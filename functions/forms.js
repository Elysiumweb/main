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
 * - submitSupportTicketGuest  : ticket support SANS compte (email de suivi).
 * - getGuestSupportTicket     : suivi d'un ticket invité via son jeton secret.
 * - submitRecruitApplication  : candidature (compte requis) — poste ouvert ou
 *   candidature spontanée — + consentement parental vérifié par email pour les
 *   candidats de moins de 15 ans.
 * - bookTryoutSlot            : réservation d'un créneau d'essai par un candidat.
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

    // Les champs sont validés AVANT les quotas : une simple faute de frappe
    // ne doit jamais consommer le quota IP/compte ni déclencher le CAPTCHA,
    // sinon l'utilisateur légitime se retrouve bloqué après 2 essais.
    const payload = {
      name: cleanString(request.data?.name, { name: "nom", min: 2, max: 120 }),
      company: cleanString(request.data?.company, { name: "société", min: 2, max: 160 }),
      email: cleanEmail(request.data?.email),
      budget: cleanString(request.data?.budget, { name: "budget", max: 80, required: false }),
      message: cleanString(request.data?.message, { name: "message", min: 10, max: 3000 }),
      createdAt: now(),
      source: "function",
    };
    await enforceFormPolicy(request, { scope: "partner", soft: 2, max: 5, windowMs: 60 * 60 * 1000 });
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

    // Validation (et idempotence) avant quotas : les doublons et les fautes
    // de frappe ne consomment pas le quota, sinon double-clic = blocage.
    requireTrue(request.data?.consent, "Le consentement est requis pour s'inscrire.");

    const email = cleanEmail(request.data?.email);
    const lang = ["fr", "en"].includes(request.data?.lang) ? request.data.lang : "fr";

    // Idempotent et sans énumération : on répond toujours ok.
    const existing = await db().collection("newsletter").where("email", "==", email).limit(1).get();
    if (!existing.empty) return { ok: true };

    await enforceFormPolicy(request, { scope: "newsletter", soft: 2, max: 6, windowMs: 60 * 60 * 1000 });

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

    // Champs validés AVANT les quotas : un ticket invalide ne doit pas
    // consommer le quota ni armer le CAPTCHA adaptatif.
    const uid = request.auth.uid;
    const subject = cleanString(request.data?.subject, { name: "sujet", min: 3, max: 140 });
    const description = cleanString(request.data?.description, { name: "description", min: 10, max: 3500 });
    const category = cleanEnum(request.data?.category, SUPPORT_CATEGORIES, { name: "catégorie" });
    const priority = cleanEnum(request.data?.priority, SUPPORT_PRIORITIES, { name: "priorité" });
    const attachment = cleanUrl(request.data?.attachment, { name: "pièce jointe", required: false });

    await enforceFormPolicy(request, {
      scope: "support", soft: 3, max: 10, windowMs: 60 * 60 * 1000, perUid: 5,
    });

    const userSnap = await db().collection("users").doc(uid).get();
    const userData = userSnap.exists ? (userSnap.data() || {}) : {};
    const name = userData.displayName || "";
    const email = request.auth.token?.email || userData.email || "";

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

// --- Ticket invité (sans compte) ------------------------------------------
// Un visiteur incapable de se connecter (compte bloqué, email perdu, mot de
// passe oublié) est précisément le cas où la page Support doit rester
// accessible. Le ticket est créé avec `uid: null` (donc invisible des règles
// Firestore côté client) et un jeton de suivi secret : le visiteur reçoit un
// email de confirmation + un lien de suivi qui lui permet de lire les réponses
// du staff sans jamais créer de compte.
const guestTicketEmail = ({ subject, reference, trackUrl }) => ({
  subject: `Votre demande ${reference} a bien été enregistrée — Elysium Support`,
  html: `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#111111;color:#f7f7f7;border:1px solid #222;">
      <div style="padding:24px 28px;border-bottom:1px solid #222;"><p style="margin:0;letter-spacing:.3em;font-size:11px;text-transform:uppercase;color:#D8CA82;">ELYSIUM ESPORT</p></div>
      <div style="padding:28px;">
        <h1 style="font-size:20px;margin:0 0 12px;color:#D8CA82;">Demande enregistrée</h1>
        <p style="font-size:15px;line-height:1.6;color:#cfcfcf;">Bonjour,</p>
        <p style="font-size:15px;line-height:1.6;color:#cfcfcf;">
          Votre demande « ${escapeHtml(subject)} » (référence <strong>${escapeHtml(reference)}</strong>) vient d'arriver
          chez l'équipe support. Vous n'avez pas besoin de compte pour la suivre : ce lien privé montre tous nos échanges.
        </p>
        <p style="margin:24px 0 0;"><a href="${escapeHtml(trackUrl)}" style="display:inline-block;background:#D8CA82;color:#111111;font-weight:700;text-transform:uppercase;letter-spacing:.15em;font-size:12px;padding:12px 22px;text-decoration:none;">Suivre ma demande</a></p>
        <p style="font-size:12px;line-height:1.6;color:#888;margin-top:24px;">
          Conservez ce lien : il est le seul moyen d'accéder à la conversation sans compte.
          Pour une réponse immédiate, rejoignez-nous sur Discord : https://discord.gg/RH3ZZkMJsw
        </p>
      </div>
    </div>`,
});

/** Référence lisible et non devinable pour un ticket invité. */
const ticketReference = (id) => `EVA-${String(id).slice(-6).toUpperCase()}`;

exports.submitSupportTicketGuest = onCall(
  { memory: "256MiB", timeoutSeconds: 60, secrets: [...REGION_SECRETS, "RECAPTCHA_SECRET"] },
  async (request) => {
    rejectHoneypot(request.data?.website);

    // Validation AVANT les quotas (idem tickets connectés) : une faute de
    // frappe ne doit pas consommer le quota d'un visiteur sans compte, qui
    // dispose d'un budget plus serré (max 3/h).
    const email = cleanEmail(request.data?.email);
    const subject = cleanString(request.data?.subject, { name: "sujet", min: 3, max: 140 });
    const description = cleanString(request.data?.description, { name: "description", min: 10, max: 3500 });
    const category = cleanEnum(request.data?.category, SUPPORT_CATEGORIES, { name: "catégorie" });
    const priority = cleanEnum(request.data?.priority, SUPPORT_PRIORITIES, { name: "priorité" });
    const attachment = cleanUrl(request.data?.attachment, { name: "pièce jointe", required: false });

    await enforceFormPolicy(request, {
      scope: "support_guest", soft: 2, max: 3, windowMs: 60 * 60 * 1000,
    });

    const trackToken = randomToken();
    const meta = `[${CAT_LABELS[category]} · ${PRIO_LABELS[priority]}] (invité)\n${description}${attachment ? `\n📎 ${attachment}` : ""}`;
    // Auto-ID Firestore : on génère l'ID d'abord pour en déduire la référence
    // lisible sans écriture supplémentaire.
    const ref = db().collection("supportThreads").doc();
    const reference = ticketReference(ref.id);
    await ref.set({
      uid: null,
      name: email.split("@")[0],
      email,
      guest: true,
      guestTokenHash: hashKey(trackToken),
      reference,
      subject,
      meta,
      category,
      priority,
      attachment,
      status: "open",
      createdAt: now(),
      source: "function_guest",
    });
    await ref.collection("messages").add({ uid: null, name: "Visiteur", text: meta, createdAt: now() });

    let emailSent = false;
    if (hasMailProvider()) {
      try {
        const { subject: mailSubject, html } = guestTicketEmail({
          subject, reference, trackUrl: `${APP_URL.replace(/\/$/, "")}/suivi-demande?token=${encodeURIComponent(trackToken)}`,
        });
        await sendEmail(email, mailSubject, html);
        emailSent = true;
        await ref.update({ "guest.emailStatus": "sent" });
      } catch (err) {
        logger.error("submitSupportTicketGuest: email", err);
        await ref.update({ "guest.emailStatus": "error" });
      }
    } else {
      logger.warn("submitSupportTicketGuest: aucun fournisseur email — le suivi se fait via le lien affiché sur le site.");
    }

    await notify({ targetRoles: ["bureau"], type: "support_new", extra: `${subject} (invité)`, link: "/support" });
    return { ok: true, id: ref.id, reference, trackToken, emailSent };
  }
);

// Suivi d'un ticket invité : le jeton secret est la seule clé d'accès. Aucune
// donnée personnelle n'est renvoyée (ni email, ni jeton, ni compte associé).
exports.getGuestSupportTicket = onCall(
  { memory: "256MiB", timeoutSeconds: 30 },
  async (request) => {
    const raw = String(request.data?.token || "").trim();
    // On accepte le jeton brut ou l'URL complète du lien reçu par email.
    const token = (raw.includes("token=") ? raw.split("token=")[1] : raw).split("&")[0].trim();
    if (token.length < 16 || token.length > 200) {
      throw new HttpsError("invalid-argument", "Lien de suivi invalide.");
    }
    const snap = await db().collection("supportThreads")
      .where("guestTokenHash", "==", hashKey(token)).limit(1).get();
    if (snap.empty) throw new HttpsError("not-found", "Demande introuvable : le lien est peut-être erroné ou expiré.");

    const docSnap = snap.docs[0];
    const data = docSnap.data();
    const msgs = await docSnap.ref.collection("messages").orderBy("createdAt", "asc").limit(100).get();
    const toIso = (v) => (v?.toDate ? v.toDate().toISOString() : v || null);
    return {
      reference: data.reference || ticketReference(docSnap.id),
      subject: data.subject || "",
      category: data.category || "other",
      priority: data.priority || "normal",
      status: data.status || "open",
      createdAt: toIso(data.createdAt),
      lastUpdateAt: toIso(data.lastUpdateAt || data.createdAt),
      messages: msgs.docs.map((m) => {
        const md = m.data();
        return { from: md.uid ? "staff" : "guest", text: md.text || "", createdAt: toIso(md.createdAt) };
      }),
    };
  }
);

// ============================================================================
// Recrutement + consentement parental (< 15 ans)
// ============================================================================
const AGE_RANGES = ["-15", "15-17", "18-24", "25+", "-16", "16-17"]; // les 2 derniers = valeurs historiques
const MINOR_RANGES = ["-15", "-16"]; // en-dessous de l'âge de consentement numérique (15 ans en France)
const GAMES = ["EVA", "Rocket League"];
// Candidature spontanée : le candidat n'est rattaché à aucun poste publié
// (scouting, essai libre, proposition de joueur). `position` devient facultatif.
const SPONTANEOUS_POSITION = "Candidature spontanée";

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

    // Champs validés AVANT les quotas : une candidature invalide (faute de
    // frappe, champ trop court…) ne doit pas consommer le quota IP/compte ni
    // armer le CAPTCHA adaptatif, sinon le candidat légitime se retrouve
    // bloqué (« Trop d'envois récents ») après seulement 2 essais.
    requireTrue(request.data?.consent, "Le consentement au traitement des données est requis.");

    const uid = request.auth.uid;
    // Candidature spontanée : le poste devient facultatif (candidature libre).
    // Le drapeau est figé côté serveur à partir de l'absence de poste : un
    // client ne peut pas « prétendre » être spontané en envoyant un poste vide.
    const spontaneous = request.data?.spontaneous === true;
    const rawPosition = cleanString(request.data?.position, {
      name: "poste", min: 2, max: 140, required: !spontaneous,
    });
    const form = {
      pseudo: cleanString(request.data?.pseudo, { name: "pseudo", min: 2, max: 60 }),
      position: rawPosition || SPONTANEOUS_POSITION,
      ageRange: cleanEnum(request.data?.ageRange, AGE_RANGES, { name: "tranche d'âge" }),
      country: cleanString(request.data?.country, { name: "pays", min: 2, max: 120 }),
      experience: cleanString(request.data?.experience, { name: "expérience", min: 10, max: 2000 }),
      videos: cleanString(request.data?.videos, { name: "vidéos", max: 1000, required: false }),
      availability: cleanString(request.data?.availability, { name: "disponibilités", min: 3, max: 1000 }),
      discord: cleanString(request.data?.discord, { name: "discord", min: 2, max: 80 }),
    };
    // Pôle visé (utile pour router une candidature spontanée vers la bonne équipe).
    const game = cleanEnum(request.data?.game, GAMES, { name: "jeu", required: false });
    form.game = game || "";

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

    await enforceFormPolicy(request, {
      scope: "recruit", soft: 2, max: 6, windowMs: 60 * 60 * 1000, perUid: 3,
    });

    const userSnap = await db().collection("users").doc(uid).get();
    const name = userSnap.exists ? userSnap.data().displayName || "" : "";
    const email = request.auth.token?.email || (userSnap.exists ? userSnap.data().email || "" : "");

    const meta = [
      `Pseudo: ${form.pseudo}`,
      spontaneous ? "Type: candidature spontanée (aucun poste publié)" : null,
      form.game ? `Jeu: ${form.game}` : null,
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
      spontaneous: spontaneous === true || !rawPosition,
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
      try {
        await notify({ targetRoles: ["manager", "bureau"], type: "recruit_new", extra: form.position, link: "/recrutement" });
      } catch (notifyErr) {
        const logger = require("firebase-functions/logger");
        logger.error("submitRecruitApplication notify error", notifyErr);
      }
    }

    return { ok: true, id: ref.id, parentalConsentRequired: isMinor, parentalEmailSent };
  }
);

// ============================================================================
// Tryouts — réservation d'un créneau d'essai
// ============================================================================
/**
 * Réserve un créneau d'essai pour un candidat connecté.
 * - Quotas IP + compte (même politique anti-spam que les autres formulaires).
 * - Transaction : la capacité est vérifiée et décrémentée côté serveur, un
 *   candidat ne peut donc pas s'insérer en surchargeant un créneau complet.
 * - Effet de bord métier : le dossier de candidature lié passe à l'étape
 *   « Essai / Entretien » (statut `interviewing`) et reçoit un message système,
 *   ce qui rend la réservation visible dans le suivi du candidat.
 */
exports.bookTryoutSlot = onCall(
  { memory: "256MiB", timeoutSeconds: 30, secrets: ["RECAPTCHA_SECRET"] },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Connexion requise.");
    rejectHoneypot(request.data?.website);
    const slotId = cleanString(request.data?.slotId, { name: "créneau", min: 3, max: 60 });
    const threadId = cleanString(request.data?.threadId, { name: "candidature", max: 60, required: false });

    await enforceFormPolicy(request, { scope: "tryout", soft: 3, max: 10, windowMs: 60 * 60 * 1000, perUid: 10 });

    const uid = request.auth.uid;
    const slotRef = db().collection("tryoutSlots").doc(slotId);
    const bookingRef = slotRef.collection("bookings").doc(uid);

    let slot;
    try {
      slot = await db().runTransaction(async (tx) => {
        const snap = await tx.get(slotRef);
        if (!snap.exists) throw new HttpsError("not-found", "Créneau d'essai introuvable.");
        const data = snap.data();
        if (data.open === false) throw new HttpsError("failed-precondition", "Ce créneau n'est plus ouvert.");
        const start = data.start?.toDate ? data.start.toDate() : new Date(data.start);
        if (isNaN(start.getTime()) || start.getTime() <= Date.now()) {
          throw new HttpsError("failed-precondition", "Ce créneau est déjà passé.");
        }
        const capacity = Number(data.capacity) || 0;
        const booked = Number(data.bookedCount) || 0;
        if (capacity > 0 && booked >= capacity) {
          throw new HttpsError("resource-exhausted", "Créneau complet.");
        }
        const existing = await tx.get(bookingRef);
        if (!existing.exists) {
          tx.set(bookingRef, { uid, bookedAt: now(), game: data.game || "", title: data.title || "" });
          tx.update(slotRef, { bookedCount: booked + 1, updatedAt: now() });
        }
        return { ...data, id: snap.id, bookedCount: existing.exists ? booked : booked + 1 };
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("bookTryoutSlot transaction", err);
      throw new HttpsError("internal", "Réservation impossible pour le moment.");
    }

    // Rattachement au dossier de candidature : l'étape « Essai » s'ouvre et le
    // candidat voit la confirmation dans son fil de discussion. Sans identifiant
    // fourni, on rattache à sa candidature la plus récente (le client public
    // n'a pas à connaître la liste des dossiers).
    let threadRef = threadId ? db().collection("recruitThreads").doc(threadId) : null;
    if (!threadRef) {
      try {
        // Tri fait en mémoire : un `where` + `orderBy` exigerait un index
        // composite que le projet n'a pas (aucun firestore.indexes.json).
        const mine = await db().collection("recruitThreads").where("uid", "==", uid).limit(20).get();
        const latest = mine.docs
          .map((d) => ({ ref: d.ref, at: d.data().createdAt?.toMillis?.() || 0 }))
          .sort((a, b) => b.at - a.at)[0];
        if (latest) threadRef = latest.ref;
      } catch (err) {
        logger.error("bookTryoutSlot: recherche candidature", err);
      }
    }
    if (threadRef) {
      try {
        const snap = await threadRef.get();
        if (snap.exists && snap.data().uid === uid) {
          const startIso = (slot.start?.toDate ? slot.start.toDate() : new Date(slot.start)).toISOString();
          await threadRef.update({
            tryout: { slotId, start: startIso, title: slot.title || "" },
            ...(["pending", "reviewing"].includes(snap.data().status) ? { status: "interviewing" } : {}),
          });
          await threadRef.collection("messages").add({
            uid: null,
            name: "Système",
            text: `📅 Essai planifié : ${slot.title || "créneau d'essai"} le ${new Date(startIso).toLocaleString("fr-FR")}.`,
            createdAt: now(),
          });
        }
      } catch (err) {
        logger.error("bookTryoutSlot: rattachement candidature", err);
      }
    }

    await notify({ targetRoles: ["manager", "bureau"], type: "recruit_new", extra: `Essai réservé — ${slot.title || ""}`, link: "/recrutement" });
    return { ok: true, slotId, title: slot.title || "", start: slot.start?.toDate ? slot.start.toDate().toISOString() : slot.start, bookedCount: slot.bookedCount };
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
