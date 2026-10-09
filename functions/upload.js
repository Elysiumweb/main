/**
 * Téléversement d'images — relais imgbb.
 * ===========================================================================
 * Cloud Storage est inaccessible sur le plan gratuit (bucket = Blaze depuis
 * février 2026). Les images du site sont donc hébergées chez imgbb, comme les
 * visuels déjà en ligne sur i.ibb.co.
 *
 * La clé API n'est JAMAIS exposée au navigateur : elle vit dans un secret de
 * fonction (`firebase functions:secrets:set IMGBB_KEY`). Le client compresse
 * l'image puis appelle cette callable, qui relaie l'envoi.
 *
 *   firebase functions:secrets:set IMGBB_KEY     # clé depuis api.imgbb.com
 *   firebase deploy --only functions:uploadImage
 *
 * La clé imgbb n'est utilisée que pour téléverser. La suppression d'un visuel
 * passe par le `delete_url` renvoyé par imgbb à l'envoi ; on ne le conserve pas
 * côté serveur, l'image reste donc-supprimable via le tableau imgbb.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const OFFICIAL_UID = "9IzGlpp6DHhrN9GW72haeb869Om1";
const IMGBB_ENDPOINT = "https://api.imgbb.com/1/upload";

// 5 Mo décodés ; le client compresse en JPEG (largeur max 800–2000 px) avant
// l'appel, donc en pratique on reste largement sous cette limite.
const MAX_BYTES = 5 * 1024 * 1024;
const DATA_URL_RE = /^data:(image\/(jpeg|png|webp|gif|avif));base64,([A-Za-z0-9+/=\s]+)$/;

// 40 envois par heure et par compte : de quoi remplir l'admin, pas de vider le
// compte imgbb depuis une clé volée.
const RATE = { scope: "upload", windowMs: 60 * 60 * 1000, max: 40 };

/** Dossiers gérés par le bureau, comme les règles Firestore. */
const STAFF_FOLDERS = new Set(["media", "articles", "matches", "opponents", "uploads"]);

const hashKey = (value) =>
  require("crypto").createHash("sha256").update(String(value)).digest("hex").slice(0, 40);

const isStaff = async (uid) => {
  if (!uid) return false;
  if (uid === OFFICIAL_UID) return true;
  const snap = await db.collection("users").doc(uid).get();
  const role = snap.exists ? snap.data().role : null;
  return role === "bureau" || role === "manager";
};

/**
 * Quota glissant sur `rateLimits/{scope_hash}`, même mécanisme que lib/abuse.js
 * (copié ici pour garder ce fichier autonome).
 */
const recordHit = async ({ scope, key, windowMs, max }) => {
  const ref = db.collection("rateLimits").doc(`${scope}_${hashKey(key)}`);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() || {}) : {};
    const hits = (data.hits || []).filter((ts) => Number.isFinite(ts) && now - ts < windowMs);
    if (hits.length >= max) {
      throw new HttpsError("resource-exhausted", "Trop d'envois d'images. Réessayez plus tard.", {
        reason: "rate-limited",
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

/** `players/<uid>/…` et `avatars/<uid>/…` : le dossier doit être le sien. */
const isOwnFolder = (folder, uid) => {
  const [root, owner] = folder.split("/");
  return (root === "players" || root === "avatars") && owner === uid;
};

const decodeImage = (data) => {
  const match = DATA_URL_RE.exec(String(data || "").trim());
  if (!match) throw new HttpsError("invalid-argument", "Image invalide (JPEG, PNG, WebP ou GIF attendu).");
  const [, mime, , base64] = match;
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length) throw new HttpsError("invalid-argument", "Image vide.");
  if (bytes.length > MAX_BYTES) {
    throw new HttpsError("invalid-argument", "Image trop lourde (5 Mo maximum).");
  }
  return { mime, bytes };
};

exports.uploadImage = onCall(
  { memory: "256MiB", timeoutSeconds: 60, secrets: ["IMGBB_KEY"] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi pour envoyer une image.");

    const folder = String(request.data?.folder || "").trim().replace(/[^a-zA-Z0-9/_-]/g, "").slice(0, 60);
    if (!folder) throw new HttpsError("invalid-argument", "Dossier manquant.");

    const staff = await isStaff(uid);
    // Même découpage que les règles Firestore : le bureau gère la médiathèque,
    // les articles, les matchs et les adversaires ; chacun sa fiche et son
    // avatar ; le chat est ouvert aux membres connectés.
    if (folder !== "chat" && !staff && !isOwnFolder(folder, uid)) {
      throw new HttpsError("permission-denied", "Tu n'as pas le droit d'envoyer une image ici.");
    }

    const { mime, bytes } = decodeImage(request.data?.image);
    await recordHit({ ...RATE, key: uid });

    const key = process.env.IMGBB_KEY;
    if (!key) {
      throw new HttpsError("failed-precondition", "Service d'envoi d'images non configuré.");
    }

    const name = `${folder.replace(/\//g, "-")}_${uid.slice(0, 6)}_${Date.now()}`;
    const form = new FormData();
    form.append("image", bytes, `${name}.${mime.split("/")[1] === "jpeg" ? "jpg" : mime.split("/")[1]}`);
    form.append("name", name);

    // AbortController : si imgbb ne répond pas, la callable ne reste pas
    // pendante jusqu'au timeout de la plateforme (c'était le bug d'origine).
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(`${IMGBB_ENDPOINT}?key=${encodeURIComponent(key)}`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.success || !payload?.data?.url) {
        logger.error("imgbb upload refus", { status: response.status, error: payload?.error });
        throw new HttpsError("internal", "L'hébergeur d'images a refusé l'envoi.");
      }

      logger.info("image téléversée", { uid, folder, bytes: bytes.length });
      return { url: payload.data.url };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("imgbb upload erreur", err);
      throw new HttpsError("internal", "Envoi d'image impossible. Réessayez dans un instant.");
    } finally {
      clearTimeout(timeout);
    }
  }
);