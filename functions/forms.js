/**
 * Formulaires publics — traitement 100 % côté serveur.
 * ----------------------------------------------------------------------------
 * Les écritures directes Firestore depuis le client sont désormais fermées
 * (voir firestore.rules) : chaque formulaire passe par une callable qui
 * valide les champs, applique App Check, des quotas IP/compte et un CAPTCHA
 * adaptatif (lib/abuse.js).
 *
 * - submitPartnerRequest      : demande de partenariat (public).
 * - subscribeNewsletter       : inscription newsletter double opt-in (public).
 * - requestNewsletterUnsubscribe : désinscription par email (public, sans énumération).
 * - submitSupportTicket       : ticket support (compte requis).
 * - submitRecruitApplication  : candidature (compte requis) + consentement
 *   parental vérifié par email pour les candidats de moins de 15 ans.
 * - confirmParentalConsent    : endpoint HTTP à jeton pour le parent.
 */

const crypto = require("crypto");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { enforceFormPolicy, hashKey } = require("./lib/abuse");
const { cleanString, cleanEmail, cleanUrl, cleanEnum, requireTrue, rejectHoneypot } = require("./lib/validate");
const { sendEmail, hasMailProvider, escapeHtml } = require("./lib/mail");

const db = () => admin.firestore();
const now = () => admin.firestore.FieldValue.serverTimestamp();

const REGION_SECRETS = ["RESEND_API_KEY", "BREVO_API_KEY"];
const APP_URL = process.env.APP_URL || "https://elysium-esport.fr";
const FUNCTIONS_REGION = process.env.FUNCTION_REGION || process.env.GCLOUD_REGION || "us-central1";

const functionUrl = (name, token) => {
  if (process.env.GCLOUD_PROJECT) {
    return `https://${FUNCTIONS_REGION}-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/${name}?token=${encodeURIComponent(token)}`;
  }
  return `${APP_URL.replace(/\/$/, "")}/${name}?token=${encodeURIComponent(token)}`;
};

const randomToken = () => crypto.randomBytes(32).toString("hex");

const notify = async ({ targetUid = null, targetRoles = null, targetGame = null, type, extra = "", link = "/" }) => {
  try {
    await db().collection("notifications").add({
      targetUid, targetRoles, targetGame, type, extra, link, readBy: [], createdAt: now(),
    });
  } catch (err) {
    logger.error("forms notify", err);
  }
};

// ============================================================================
// Partenariat
// ============================================================================
exports.submitPartnerRequest = onCall(
  { memory: "256MiB", timeoutSeconds: 30, secrets: ["RECAPTCHA_SECRET"] },
  async (request) => {
    rejectHoneypot(request.data?.website);
    await enforceFormPolicy(request, { scope: "partner", soft: 2, max: 5, windowMs: 60 * 60 * 1000 });

    const payload = {
      name: cleanString(request.data?.name, { name: "nom", min: 2, max: 120 }),
      company: cleanString(request.data?.company, { name: "société", min: 2, max: 160 }),
      email: cleanEmail(request.data?.email),
      budget: cleanString(request.data?.budget, { name: "budget", max: 80, required: false }),
      message: cleanString(request.data?.message, { name: "message", min: 10, max: 3000 }),
      createdAt: now(),
      source: "function",
    };
    await db().collection("partner_requests").add(payload);
    return { ok: true };
  }
);

// ============================================================================
// Newsletter (double opt-in)
// ============================================================================
exports.subscribeNewsletter = onCall(
  { memory: "256MiB", timeoutSeconds: 30, secrets: ["RECAPTCHA_SECRET"] },
  async (request) => {
    rejectHoneypot(request.data?.website);
    await enforceFormPolicy(request, { scope: "newsletter", soft: 2, max: 6, windowMs: 60 * 60 * 1000 });
    requireTrue(request.data?.consent, "Le consentement est requis pour s'inscrire.");

    const email = cleanEmail(request.data?.email);
    const lang = ["fr", "en"].includes(request.data?.lang) ? request.data.lang : "fr";

    // Idempotent et sans énumération : on répond toujours ok.
    const existing = await db().collection("newsletter").where("email", "==", email).limit(1).get();
    if (!existing.empty) return { ok: true };

    await db().collection("newsletter").add({
      email,
      confirmed: false,
      confirmToken: randomToken(),
      lang,
      subscribedAt: now(),
      consentGivenAt: now(),
      source: "function",
    });
    return { ok: true };
  }
);

exports.requestNewsletterUnsubscribe = onCall(
  { memory: "256MiB", timeoutSeconds: 30, secrets: ["RECAPTCHA_SECRET"] },
  async (request) => {
    await enforceFormPolicy(request, { scope: "newsletter_unsub", soft: 3, max: 10, windowMs: 60 * 60 * 1000 });
    const email = cleanEmail(request.data?.email);
    const snap = await db().collection("newsletter").where("email", "==", email).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
    // Réponse identique que l'email existe ou non (pas d'énumération).
    return { ok: true };
  }
);

// ============================================================================
// Support
// ============================================================================
const SUPPORT_CATEGORIES = ["account", "technical", "team", "other"];
const SUPPORT_PRIORITIES = ["low", "normal", "high"];
const CAT_LABELS = { account: "Compte", technical: "Technique", team: "Équipe", other: "Autre" };
const PRIO_LABELS = { low: "Basse", normal: "Normale", high: "Haute" };

exports.submitSupportTicket = onCall(
  { memory: "256MiB", timeoutSeconds: 30, secrets: ["RECAPTCHA_SECRET"] },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Connexion requise.");
    rejectHoneypot(request.data?.website);
    await enforceFormPolicy(request, {
      scope: "support", soft: 3, max: 10, windowMs: 60 * 60 * 1000, perUid: 5,
    });

    const uid = request.auth.uid;
    const subject = cleanString(request.data?.subject, { name: "sujet", min: 3, max: 140 });
    const description = cleanString(request.data?.description, { name: "description", min: 10, max: 3500 });
    const category = cleanEnum(request.data?.category, SUPPORT_CATEGORIES, { name: "catégorie" });
    const priority = cleanEnum(request.data?.priority, SUPPORT_PRIORITIES, { name: "priorité" });
    const attachment = cleanUrl(request.data?.attachment, { name: "pièce jointe", required: false });

    const userSnap = await db().collection("users").doc(uid).get();
    const name = userSnap.exists ? userSnap.data().displayName || "" : "";
    const email = request.auth.token?.email || (userSnap.exists ? userSnap.data().email || "" : "");

    const meta = `[${CAT_LABELS[category]} · ${PRIO_LABELS[priority]}]\n${description}${attachment ? `\n📎 ${attachment}` : ""}`;
    const ref = await db().collection("supportThreads").add({
      uid, name, email, subject, meta, category, priority, attachment,
      status: "open", createdAt: now(), source: "function",
    });
    await ref.collection("messages").add({ uid, name, text: meta, createdAt: now() });
    await notify({ targetRoles: ["bureau"], type: "support_new", extra: subject, link: "/support" });
    return { ok: true, id: ref.id };
  }
);

// ============================================================================
// Recrutement + consentement parental (< 15 ans)
// ============================================================================
const AGE_RANGES = ["-15", "15-17", "18-24", "25+", "-16", "16-17"]; // les 2 derniers = valeurs historiques
const MINOR_RANGES = ["-15", "-16"]; // en-dessous de l'âge de consentement numérique (15 ans en France)

const parentalConsentEmail = ({ parentName, childPseudo, position, confirmUrl }) => ({
  subject: "Consentement parental requis — candidature Elysium",
  html: `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#111111;color:#f7f7f7;border:1px solid #222;">
      <div style="padding:24px 28px;border-bottom:1px solid #222;"><p style="margin:0;letter-spacing:.3em;font-size:11px;text-transform:uppercase;color:#D8CA82;">ELYSIUM ESPORT</p></div>
      <div style="padding:28px;">
        <h1 style="font-size:20px;margin:0 0 12px;color:#D8CA82;">Consentement parental</h1>
        <p style="font-size:15px;line-height:1.6;color:#cfcfcf;">Bonjour ${escapeHtml(parentName)},</p>
        <p style="font-size:15px;line-height:1.6;color:#cfcfcf;">
          « ${escapeHtml(childPseudo)} » a déposé une candidature (${escapeHtml(position)}) auprès de l'équipe esport Elysium
          en indiquant avoir moins de 15 ans. Conformément au RGPD et à la loi Informatique et Libertés,
          le traitement de sa candidature nécessite l'accord d'un titulaire de l'autorité parentale.
        </p>
        <p style="font-size:15px;line-height:1.6;color:#cfcfcf;">
          En cliquant sur le bouton ci-dessous, vous confirmez être titulaire de l'autorité parentale et
          autoriser le traitement de cette candidature (données : pseudo, tranche d'âge, pays, expérience,
          liens vidéo, disponibilités, identifiant Discord).
        </p>
        <p style="margin:24px 0 0;"><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;background:#D8CA82;color:#111111;font-weight:700;text-transform:uppercase;letter-spacing:.15em;font-size:12px;padding:12px 22px;text-decoration:none;">Je donne mon accord</a></p>
        <p style="font-size:12px;line-height:1.6;color:#888;margin-top:24px;">
          Sans confirmation sous 30 jours, la candidature sera automatiquement supprimée.
          Si vous n'êtes pas concerné par cette demande, ignorez cet email : aucune candidature ne sera traitée.
        </p>
      </div>
    </div>`,
});

exports.submitRecruitApplication = onCall(
  { memory: "256MiB", timeoutSeconds: 60, secrets: [...REGION_SECRETS, "RECAPTCHA_SECRET"] },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Connexion requise.");
    rejectHoneypot(request.data?.website);
    await enforceFormPolicy(request, {
      scope: "recruit", soft: 2, max: 6, windowMs: 60 * 60 * 1000, perUid: 3,
    });
    requireTrue(request.data?.consent, "Le consentement au traitement des données est requis.");

    const uid = request.auth.uid;
    const form = {
      pseudo: cleanString(request.data?.pseudo, { name: "pseudo", min: 2, max: 60 }),
      position: cleanString(request.data?.position, { name: "poste", min: 2, max: 140 }),
      ageRange: cleanEnum(request.data?.ageRange, AGE_RANGES, { name: "tranche d'âge" }),
      country: cleanString(request.data?.country, { name: "pays", min: 2, max: 120 }),
      experience: cleanString(request.data?.experience, { name: "expérience", min: 10, max: 2000 }),
      videos: cleanString(request.data?.videos, { name: "vidéos", max: 1000, required: false }),
      availability: cleanString(request.data?.availability, { name: "disponibilités", min: 3, max: 1000 }),
      discord: cleanString(request.data?.discord, { name: "discord", min: 2, max: 80 }),
    };

    const isMinor = MINOR_RANGES.includes(form.ageRange);
    let parental = null;
    let parentalToken = null;
    if (isMinor) {
      const parentName = cleanString(request.data?.parentName, { name: "nom du parent", min: 2, max: 120 });
      const parentEmail = cleanEmail(request.data?.parentEmail, { name: "email du parent" });
      requireTrue(request.data?.parentConsent, "L'accord explicite du titulaire de l'autorité parentale est requis.");
      if (parentEmail === (request.auth.token?.email || "").toLowerCase()) {
        throw new HttpsError("invalid-argument", "L'email du parent doit être différent de celui du candidat.");
      }
      parentalToken = randomToken();
      parental = {
        required: true,
        status: "pending",
        parentName,
        parentEmail,
        tokenHash: hashKey(parentalToken),
        requestedAt: now(),
      };
    }

    const userSnap = await db().collection("users").doc(uid).get();
    const name = userSnap.exists ? userSnap.data().displayName || "" : "";
    const email = request.auth.token?.email || (userSnap.exists ? userSnap.data().email || "" : "");

    const meta = [
      `Pseudo: ${form.pseudo}`,
      `Tranche d'âge: ${form.ageRange}`,
      `Pays / fuseau: ${form.country}`,
      `Expérience: ${form.experience}`,
      form.videos ? `Vidéos: ${form.videos}` : null,
      `Disponibilités: ${form.availability}`,
      `Discord: ${form.discord}`,
      isMinor ? "⚠️ Candidat de moins de 15 ans — consentement parental en attente de confirmation." : null,
    ].filter(Boolean).join("\n");

    const docData = {
      uid, name, email, ...form, meta,
      consent: true,
      status: isMinor ? "pending_parental_consent" : "pending",
      createdAt: now(),
      source: "function",
    };
    if (parental) docData.parentalConsent = parental;

    const ref = await db().collection("recruitThreads").add(docData);
    await ref.collection("messages").add({ uid, name, text: meta, createdAt: now() });

    let parentalEmailSent = false;
    if (isMinor) {
      const confirmUrl = functionUrl("confirmParentalConsent", parentalToken);
      if (hasMailProvider()) {
        try {
          const { subject, html } = parentalConsentEmail({
            parentName: parental.parentName,
            childPseudo: form.pseudo,
            position: form.position,
            confirmUrl,
          });
          await sendEmail(parental.parentEmail, subject, html);
          parentalEmailSent = true;
          await ref.update({ "parentalConsent.emailStatus": "sent" });
        } catch (err) {
          logger.error("submitRecruitApplication: email parental", err);
          await ref.update({ "parentalConsent.emailStatus": "error" });
        }
      } else {
        logger.warn("submitRecruitApplication: aucun fournisseur email — consentement parental à vérifier manuellement.");
      }
    } else {
      await notify({ targetRoles: ["manager", "bureau"], type: "recruit_new", extra: form.position, link: "/recrutement" });
    }

    return { ok: true, id: ref.id, parentalConsentRequired: isMinor, parentalEmailSent };
  }
);

exports.confirmParentalConsent = onRequest(
  { memory: "256MiB", timeoutSeconds: 30 },
  async (req, res) => {
    const token = String(req.query.token || "").trim();
    if (!token) { res.status(400).send("Jeton manquant."); return; }
    const snap = await db().collection("recruitThreads")
      .where("parentalConsent.tokenHash", "==", hashKey(token)).limit(1).get();
    if (snap.empty) { res.redirect(`${APP_URL}/recrutement?parental=invalid`); return; }

    const docSnap = snap.docs[0];
    const data = docSnap.data();
    if (data.parentalConsent?.status !== "granted") {
      await docSnap.ref.set({
        status: "pending",
        parentalConsent: {
          ...data.parentalConsent,
          status: "granted",
          grantedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      }, { merge: true });
      await docSnap.ref.collection("messages").add({
        uid: data.uid || null,
        name: "Système",
        text: `✅ Consentement parental confirmé par ${data.parentalConsent?.parentName || "le parent"} (${data.parentalConsent?.parentEmail || ""}).`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await notify({ targetRoles: ["manager", "bureau"], type: "recruit_new", extra: data.position || "", link: "/recrutement" });
    }
    res.redirect(`${APP_URL}/recrutement?parental=confirmed`);
  }
);
