/**
 * Protection anti-abus côté serveur pour les formulaires publics.
 * ----------------------------------------------------------------------------
 * - requireAppCheck : exige un jeton App Check valide (activable par env).
 * - enforceQuota    : quota glissant par IP et/ou par compte, stocké dans la
 *   collection Firestore `rateLimits` (transactionnel, non contournable côté
 *   client contrairement au sessionStorage).
 * - CAPTCHA adaptatif : sous le seuil « soft » aucun captcha n'est demandé ;
 *   entre soft et hard le serveur exige un jeton reCAPTCHA v3 vérifié via
 *   l'API siteverify ; au-delà du seuil hard la requête est refusée.
 *
 * Secrets / env :
 *   RECAPTCHA_SECRET   — clé secrète reCAPTCHA v3 (siteverify).
 *   ENFORCE_APP_CHECK  — "true" pour refuser les appels sans jeton App Check.
 */

const crypto = require("crypto");
const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

const getDb = () => admin.firestore();

const hashKey = (value) => crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 40);

/** IP du client derrière le proxy Google Frontend. */
const getClientIp = (rawRequest) => {
  const fwd = rawRequest?.headers?.["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  return rawRequest?.ip || rawRequest?.connection?.remoteAddress || "ip-inconnue";
};

/** App Check : bloque si ENFORCE_APP_CHECK=true, sinon trace pour observabilité. */
const requireAppCheck = (request) => {
  if (request.app) return;
  if (process.env.ENFORCE_APP_CHECK === "true") {
    throw new HttpsError("failed-precondition", "Jeton App Check manquant ou invalide.");
  }
  logger.warn("appcheck: appel sans jeton App Check (mode non bloquant)", {
    ip: getClientIp(request.rawRequest),
  });
};

/** Vérifie un jeton reCAPTCHA v3 via siteverify. Retourne null si non configuré. */
const verifyCaptchaToken = async (token, ip) => {
  const secret = process.env.RECAPTCHA_SECRET;
  // "disabled" permet de créer le secret (requis au déploiement) sans activer le captcha.
  if (!secret || secret === "disabled") return null; // captcha non configuré → indisponible
  if (!token) return { ok: false, reason: "missing-token" };
  try {
    const params = new URLSearchParams({ secret, response: String(token) });
    if (ip && ip !== "ip-inconnue") params.set("remoteip", ip);
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = await res.json();
    const ok = data.success === true && (data.score === undefined || data.score >= 0.5);
    return { ok, score: data.score, reason: ok ? null : (data["error-codes"] || []).join(",") || "low-score" };
  } catch (err) {
    logger.error("verifyCaptchaToken erreur réseau", err);
    // En cas d'indisponibilité de siteverify, on n'enferme pas l'utilisateur :
    // le quota hard reste la protection de dernier recours.
    return { ok: true, degraded: true };
  }
};

/**
 * Quota glissant transactionnel sur `rateLimits/{scope_hash}`.
 * @returns {Promise<number>} nombre d'appels récents (après enregistrement).
 */
const recordHit = async ({ scope, key, windowMs, max }) => {
  const db = getDb();
  const ref = db.collection("rateLimits").doc(`${scope}_${hashKey(key)}`);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const hits = (snap.exists ? snap.data().hits || [] : []).filter(
      (ts) => Number.isFinite(ts) && now - ts < windowMs
    );
    if (hits.length >= max) {
      const retryAt = new Date(Math.min(...hits) + windowMs).toISOString();
      throw new HttpsError("resource-exhausted", "Trop de tentatives. Réessayez plus tard.", {
        reason: "rate-limited",
        retryAt,
      });
    }
    hits.push(now);
    tx.set(ref, {
      scope,
      hits,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(now + windowMs * 2),
    });
    return hits.length;
  });
};

/** Compte les appels récents SANS enregistrer (pour le seuil adaptatif). */
const countRecentHits = async ({ scope, key, windowMs }) => {
  const db = getDb();
  const ref = db.collection("rateLimits").doc(`${scope}_${hashKey(key)}`);
  const snap = await ref.get();
  if (!snap.exists) return 0;
  const now = Date.now();
  return (snap.data().hits || []).filter((ts) => Number.isFinite(ts) && now - ts < windowMs).length;
};

/**
 * Applique la politique complète pour un formulaire public :
 * quotas IP + compte, avec CAPTCHA adaptatif entre `soft` et `max`.
 *
 * @param {object} request  requête callable v2
 * @param {object} opts     { scope, soft, max, windowMs, perUid }
 */
const enforceFormPolicy = async (request, { scope, soft = 3, max = 10, windowMs = 60 * 60 * 1000, perUid = null }) => {
  requireAppCheck(request);
  const ip = getClientIp(request.rawRequest);
  const uid = request.auth?.uid || null;

  // Seuil adaptatif : au-delà de `soft` envois récents, un captcha valide est requis.
  const recent = await countRecentHits({ scope: `${scope}_ip`, key: ip, windowMs });
  const recentUid = uid ? await countRecentHits({ scope: `${scope}_uid`, key: uid, windowMs }) : 0;
  if (recent >= soft || recentUid >= soft) {
    const verdict = await verifyCaptchaToken(request.data?.captchaToken, ip);
    if (verdict === null) {
      // Captcha non configuré → seuil soft devient bloquant (pas de bypass silencieux).
      throw new HttpsError("resource-exhausted", "Trop de tentatives. Réessayez plus tard.", {
        reason: "rate-limited",
      });
    }
    if (!verdict.ok) {
      throw new HttpsError("failed-precondition", "Vérification anti-robot requise.", {
        reason: "captcha-required",
      });
    }
  }

  // Quotas durs (transactionnels) par IP et par compte.
  await recordHit({ scope: `${scope}_ip`, key: ip, windowMs, max });
  if (uid) {
    await recordHit({ scope: `${scope}_uid`, key: uid, windowMs, max: perUid || max });
  }
  return { ip, uid };
};

module.exports = {
  hashKey,
  getClientIp,
  requireAppCheck,
  verifyCaptchaToken,
  recordHit,
  countRecentHits,
  enforceFormPolicy,
};
