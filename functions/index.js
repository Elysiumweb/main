/**
 * Elysium — Cloud Functions
 * ============================================================================
 * - notifications/{id}: email + push FCM web aux destinataires.
 * - newsletter/{id}: envoi du double opt-in par email.
 * - confirmNewsletter / unsubscribeNewsletter: endpoints publics à jeton.
 * - sendNewsletterDigest: callable bureau pour envoyer un digest réel.
 * - ensureTotpMfa: active le second facteur TOTP sur le projet Auth.
 * - auth.user().onDelete: purge RGPD des données liées au compte supprimé.
 *
 * Variables d'environnement / secrets (Firebase CLI):
 *   firebase functions:secrets:set RESEND_API_KEY
 *   firebase functions:secrets:set BREVO_API_KEY
 *   firebase functions:secrets:set MAIL_FROM
 *   firebase functions:config:set app.url="https://elysium-esport.fr" (ou APP_URL)
 */

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const functionsV1 = require("firebase-functions/v1");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

const TOTP_PROVIDER = {
  state: "ENABLED",
  totpProviderConfig: { adjacentIntervals: 5 },
};

const enableTotpMfaOnProject = async () => {
  const mgr = admin.auth().projectConfigManager();
  let existingProviders = [];
  try {
    const current = await mgr.getProjectConfig();
    existingProviders = (current.multiFactorConfig?.providerConfigs || [])
      .filter((p) => !p.totpProviderConfig);
  } catch (err) {
    logger.warn("ensureTotpMfa: lecture config", err);
  }
  const updated = await mgr.updateProjectConfig({
    multiFactorConfig: {
      state: "ENABLED",
      providerConfigs: [...existingProviders, TOTP_PROVIDER],
    },
  });
  logger.info("ensureTotpMfa: TOTP activé sur le projet");
  return { state: updated.multiFactorConfig?.state || "ENABLED" };
};

const enableTotpMfaViaRest = async () => {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT_ID;
  if (!projectId) throw new Error("project-id-missing");
  let accessToken = "";
  try {
    const cred = admin.app().options.credential;
    if (cred && typeof cred.getAccessToken === "function") {
      const tok = await cred.getAccessToken();
      accessToken = tok.access_token || tok.accessToken || "";
    }
  } catch (err) {
    logger.warn("ensureTotpMfa: credential token", err);
  }
  if (!accessToken) {
    const meta = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
      headers: { "Metadata-Flavor": "Google" },
    });
    if (!meta.ok) throw new Error(`metadata token ${meta.status}`);
    accessToken = (await meta.json()).access_token;
  }
  const res = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=mfa`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Goog-User-Project": projectId,
    },
    body: JSON.stringify({ mfa: { providerConfigs: [TOTP_PROVIDER] } }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text.slice(0, 500));
  logger.info("ensureTotpMfa: TOTP activé via REST");
  return { state: "ENABLED" };
};

const ensureTotpMfaEnabled = async () => {
  try {
    return await enableTotpMfaOnProject();
  } catch (err) {
    logger.warn("ensureTotpMfa: Admin SDK, fallback REST", err);
    return enableTotpMfaViaRest();
  }
};

try {
  const { onInit } = require("firebase-functions/v2/core");
  onInit(() => {
    ensureTotpMfaEnabled().catch((err) => logger.warn("ensureTotpMfa init", err));
  });
} catch (err) {
  logger.warn("ensureTotpMfa: onInit indisponible", err);
}

exports.ensureTotpMfa = onCall(
  { memory: "256MiB", timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Connexion requise.");
    try {
      const result = await ensureTotpMfaEnabled();
      return { enabled: true, ...result };
    } catch (err) {
      logger.error("ensureTotpMfa", err);
      const msg = String(err.message || err);
      if (/identity platform|IDENTITY_PLATFORM|billing|blaze|CONFIGURATION_NOT_FOUND/i.test(msg)) {
        throw new HttpsError(
          "failed-precondition",
          "Passez Firebase Authentication en Identity Platform (console Firebase → Authentication → Mettre à niveau), puis réessayez.",
        );
      }
      throw new HttpsError("internal", msg.slice(0, 400));
    }
  },
);

const OFFICIAL_UID = "9IzGlpp6DHhrN9GW72haeb869Om1";
const REGION_SECRETS = ["RESEND_API_KEY", "BREVO_API_KEY"];
const APP_URL = process.env.APP_URL || "https://elysium-esport.fr";

const getMailFrom = () => process.env.MAIL_FROM || "Elysium <noreply@elysium-esport.fr>";
const getResendKey = () => process.env.RESEND_API_KEY;
const getBrevoKey = () => process.env.BREVO_API_KEY;

const escapeHtml = (s = "") => String(s)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const parseMailFrom = (from) => {
  const match = String(from).match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!match) return { email: String(from).trim(), name: "Elysium" };
  return { name: match[1].replace(/^"|"$/g, "") || "Elysium", email: match[2].trim() };
};

// ---- Templates de contenu par type de notification ----
const TEMPLATES = {
  event_new: {
    subject: (n) => `[Convocation] ${n.extra || "Nouvel événement"}`,
    title: "Nouvelle convocation",
    intro: (n) => `Un événement vient d'être planifié : « ${n.extra || ""} ». Confirme ta présence dans l'espace joueur.`,
  },
  absence_declared: {
    subject: (n) => `[Absence] ${n.extra || "Absence déclarée"}`,
    title: "Absence déclarée",
    intro: (n) => `${n.extra || "Un joueur"} sera absent. Voir le planning pour réorganiser.`,
  },
  attendance: {
    subject: (n) => `[Présence] ${n.extra || "Réponse de présence"}`,
    title: "Réponse de présence",
    intro: (n) => `${n.extra || "Un joueur"} a répondu à un événement.`,
  },
  thread_reply: {
    subject: (n) => `[Ticket] Nouvelle réponse — ${n.extra || ""}`,
    title: "Nouvelle réponse à votre demande",
    intro: () => "Un membre de l'équipe a répondu à votre ticket. Consultez la conversation sur le site.",
  },
  support_new: {
    subject: (n) => `[Support] Nouvelle demande — ${n.extra || ""}`,
    title: "Nouvelle demande de support",
    intro: () => "Une nouvelle demande de support a été ouverte.",
  },
  recruit_new: {
    subject: (n) => `[Candidature] ${n.extra || "Nouvelle candidature"}`,
    title: "Nouvelle candidature",
    intro: () => "Une nouvelle candidature vient d'être déposée.",
  },
  chat_mention: {
    subject: () => `[Chat] Vous avez été mentionné`,
    title: "Vous avez été mentionné sur le chat",
    intro: (n) => `${n.extra || "Un coéquipier"} vous a mentionné.`,
  },
  match_reminder: {
    subject: (n) => `[Match] Coup d'envoi imminent — ${n.extra || ""}`,
    title: "Match à venir",
    intro: () => "Un match démarre bientôt. Préparez-vous !",
  },
};

const fallbackTemplate = {
  subject: (n) => `[Elysium] ${n.extra || n.type || "Notification"}`,
  title: "Notification Elysium",
  intro: (n) => n.extra || "Vous avez une nouvelle notification.",
};

const absoluteLink = (link = "") => link && String(link).startsWith("http") ? link : `${APP_URL}${link || ""}`;

const buildEmail = (n) => {
  const tpl = TEMPLATES[n.type] || fallbackTemplate;
  const link = absoluteLink(n.link || "");
  const subject = tpl.subject(n);
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#111111;color:#f7f7f7;border:1px solid #222;">
      <div style="padding:24px 28px;border-bottom:1px solid #222;">
        <p style="margin:0;letter-spacing:.3em;font-size:11px;text-transform:uppercase;color:#D8CA82;">ELYSIUM ESPORT</p>
      </div>
      <div style="padding:28px;">
        <h1 style="font-size:20px;margin:0 0 12px;color:#D8CA82;">${escapeHtml(tpl.title)}</h1>
        <p style="font-size:15px;line-height:1.6;color:#cfcfcf;">${escapeHtml(tpl.intro(n))}</p>
        <p style="margin:24px 0 0;">
          <a href="${escapeHtml(link)}" style="display:inline-block;background:#D8CA82;color:#111111;font-weight:700;text-transform:uppercase;letter-spacing:.15em;font-size:12px;padding:12px 22px;text-decoration:none;">Ouvrir sur le site</a>
        </p>
      </div>
      <div style="padding:16px 28px;border-top:1px solid #222;font-size:11px;color:#666;">
        Vous recevez cet email parce que vous avez un compte Elysium. Les notifications se gèrent depuis l'espace joueur.
      </div>
    </div>`;
  return { subject, html };
};

const buildPush = (n) => {
  const tpl = TEMPLATES[n.type] || fallbackTemplate;
  return {
    title: tpl.title || "Elysium",
    body: tpl.intro(n).slice(0, 180),
    url: absoluteLink(n.link || "/"),
  };
};

// ---- Résolution des destinataires ----
const resolveRecipientUsers = async (n) => {
  const users = new Map();

  if (n.targetUid) {
    const snap = await db.collection("users").doc(n.targetUid).get();
    if (snap.exists) users.set(snap.id, { uid: snap.id, ...snap.data() });
  }

  if (Array.isArray(n.targetRoles) && n.targetRoles.length > 0) {
    const snap = await db.collection("users").where("role", "in", n.targetRoles).get();
    snap.forEach((d) => {
      const data = d.data();
      if (n.targetGame && n.targetGame !== "global" && data.role !== "bureau") {
        if (data.game && data.game !== n.targetGame) return;
      }
      users.set(d.id, { uid: d.id, ...data });
    });
  }

  return [...users.values()];
};

const resolveRecipients = async (n) => (await resolveRecipientUsers(n)).map((u) => u.email).filter(Boolean);

// ---- Fournisseurs d'envoi ----
const sendWithResend = async (to, subject, html) => {
  const key = getResendKey();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: getMailFrom(), to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return `resend:${to}`;
};

const sendWithBrevo = async (to, subject, html) => {
  const sender = parseMailFrom(getMailFrom());
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": getBrevoKey(), "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
  return `brevo:${to}`;
};

const sendEmail = async (to, subject, html) => {
  if (!getResendKey() && !getBrevoKey()) throw new Error("Aucun fournisseur email configuré.");
  return getBrevoKey() ? sendWithBrevo(to, subject, html) : sendWithResend(to, subject, html);
};

exports.notifyEmail = onDocumentCreated(
  { document: "notifications/{id}", secrets: REGION_SECRETS, memory: "256MiB", timeoutSeconds: 30 },
  async (event) => {
    const n = event.data && event.data.data ? event.data.data() : null;
    if (!n) { logger.warn("notifyEmail: notification sans données"); return null; }
    if (!getResendKey() && !getBrevoKey()) { logger.info("notifyEmail: aucun fournisseur email configuré."); return null; }
    if (!n.targetUid && !(Array.isArray(n.targetRoles) && n.targetRoles.length > 0)) return null;

    try {
      const recipients = await resolveRecipients(n);
      if (recipients.length === 0) return null;
      const { subject, html } = buildEmail(n);
      const results = await Promise.allSettled(recipients.map((to) => sendEmail(to, subject, html)));
      const ok = results.filter((r) => r.status === "fulfilled").length;
      results.filter((r) => r.status === "rejected").forEach((r) => logger.error("notifyEmail envoi échoué", r.reason));
      logger.info(`notifyEmail: ${ok}/${recipients.length} email(s) envoyés (type=${n.type}).`);
      return { ok, total: recipients.length };
    } catch (err) {
      logger.error("notifyEmail erreur", err);
      return null;
    }
  }
);

exports.notifyPush = onDocumentCreated(
  { document: "notifications/{id}", memory: "256MiB", timeoutSeconds: 30 },
  async (event) => {
    const n = event.data && event.data.data ? event.data.data() : null;
    if (!n || (!n.targetUid && !(Array.isArray(n.targetRoles) && n.targetRoles.length > 0))) return null;
    try {
      const users = await resolveRecipientUsers(n);
      const uids = users.map((u) => u.uid).filter(Boolean);
      if (!uids.length) return null;
      const tokenDocs = [];
      for (let i = 0; i < uids.length; i += 30) {
        const snap = await db.collection("pushTokens").where("uid", "in", uids.slice(i, i + 30)).where("enabled", "==", true).get();
        snap.forEach((d) => tokenDocs.push({ id: d.id, ref: d.ref, ...d.data() }));
      }
      const tokens = [...new Set(tokenDocs.map((d) => d.token).filter(Boolean))];
      if (!tokens.length) return null;
      const payload = buildPush(n);
      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        data: { title: payload.title, body: payload.body, url: payload.url, type: n.type || "notification" },
        webpush: { fcmOptions: { link: payload.url }, headers: { Urgency: "high" } },
      });
      const invalidCodes = new Set(["messaging/invalid-registration-token", "messaging/registration-token-not-registered"]);
      await Promise.all(response.responses.map((r, idx) => {
        if (r.success || !invalidCodes.has(r.error?.code)) return null;
        const bad = tokenDocs.find((d) => d.token === tokens[idx]);
        return bad?.ref.delete();
      }));
      logger.info(`notifyPush: ${response.successCount}/${tokens.length} push envoyés (type=${n.type}).`);
      return { ok: response.successCount, total: tokens.length };
    } catch (err) {
      logger.error("notifyPush erreur", err);
      return null;
    }
  }
);

const FUNCTIONS_REGION = process.env.FUNCTION_REGION || process.env.GCLOUD_REGION || "us-central1";
const cloudFunctionUrl = (name, token) => {
  if (process.env.GCLOUD_PROJECT) {
    return `https://${FUNCTIONS_REGION}-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/${name}?token=${encodeURIComponent(token)}`;
  }
  return `${APP_URL.replace(/\/$/, "")}/newsletter/confirm/${encodeURIComponent(token)}`;
};

const buildNewsletterConfirmEmail = ({ email, token }) => {
  const confirmUrl = cloudFunctionUrl("confirmNewsletter", token);
  return {
    subject: "Confirmez votre inscription à la newsletter Elysium",
    html: `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#111111;color:#f7f7f7;border:1px solid #222;">
        <div style="padding:24px 28px;border-bottom:1px solid #222;"><p style="margin:0;letter-spacing:.3em;font-size:11px;text-transform:uppercase;color:#D8CA82;">ELYSIUM NEWSLETTER</p></div>
        <div style="padding:28px;">
          <h1 style="font-size:20px;margin:0 0 12px;color:#D8CA82;">Confirmez votre email</h1>
          <p style="font-size:15px;line-height:1.6;color:#cfcfcf;">Cliquez sur le bouton pour valider l'inscription de ${escapeHtml(email)}. Sans confirmation, aucun digest ne sera envoyé.</p>
          <p style="margin:24px 0 0;"><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;background:#D8CA82;color:#111111;font-weight:700;text-transform:uppercase;letter-spacing:.15em;font-size:12px;padding:12px 22px;text-decoration:none;">Confirmer mon inscription</a></p>
        </div>
      </div>`,
  };
};

exports.sendNewsletterConfirmation = onDocumentCreated(
  { document: "newsletter/{id}", secrets: REGION_SECRETS, memory: "256MiB", timeoutSeconds: 30 },
  async (event) => {
    const sub = event.data?.data();
    if (!sub?.email || sub.confirmed !== false || !sub.confirmToken) return null;
    const duplicates = await db.collection("newsletter").where("email", "==", sub.email).get();
    const alreadyExists = duplicates.docs.some((d) => d.id !== event.params.id);
    if (alreadyExists) {
      await event.data.ref.delete();
      logger.info(`sendNewsletterConfirmation: doublon ignoré pour ${sub.email}`);
      return null;
    }
    if (!getResendKey() && !getBrevoKey()) {
      await event.data.ref.set({ emailStatus: "not_configured" }, { merge: true });
      logger.warn("sendNewsletterConfirmation: aucun fournisseur email configuré.");
      return null;
    }
    try {
      const { subject, html } = buildNewsletterConfirmEmail({ email: sub.email, token: sub.confirmToken });
      await sendEmail(sub.email, subject, html);
      await event.data.ref.set({ emailStatus: "sent", confirmationSentAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return { ok: true };
    } catch (err) {
      logger.error("sendNewsletterConfirmation erreur", err);
      await event.data.ref.set({ emailStatus: "error", emailError: String(err.message || err).slice(0, 500) }, { merge: true });
      return null;
    }
  }
);

exports.confirmNewsletter = onRequest({ memory: "128MiB", timeoutSeconds: 15 }, async (req, res) => {
  const token = String(req.query.token || "").trim();
  if (!token) { res.status(400).send("Token manquant."); return; }
  const snap = await db.collection("newsletter").where("confirmToken", "==", token).limit(1).get();
  if (snap.empty) { res.redirect(`${APP_URL}/newsletter?confirmed=invalid`); return; }
  await snap.docs[0].ref.set({ confirmed: true, confirmedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  res.redirect(`${APP_URL}/newsletter?confirmed=1`);
});

exports.unsubscribeNewsletter = onRequest({ memory: "128MiB", timeoutSeconds: 15 }, async (req, res) => {
  const token = String(req.query.token || "").trim();
  if (!token) { res.status(400).send("Token manquant."); return; }
  const snap = await db.collection("newsletter").where("confirmToken", "==", token).limit(5).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
  res.redirect(`${APP_URL}/newsletter?unsubscribed=1`);
});

const isBureauUser = async (uid) => {
  if (!uid) return false;
  if (uid === OFFICIAL_UID) return true;
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists && snap.data().role === "bureau";
};

const digestHtml = ({ subject, body, token }) => {
  const paragraphs = escapeHtml(body).split(/\n{2,}/).map((p) => `<p style="font-size:15px;line-height:1.6;color:#cfcfcf;white-space:pre-line;">${p}</p>`).join("");
  const unsubscribe = cloudFunctionUrl("unsubscribeNewsletter", token);
  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:620px;margin:0 auto;background:#111111;color:#f7f7f7;border:1px solid #222;">
      <div style="padding:24px 28px;border-bottom:1px solid #222;"><p style="margin:0;letter-spacing:.3em;font-size:11px;text-transform:uppercase;color:#D8CA82;">ELYSIUM DIGEST</p></div>
      <div style="padding:28px;"><h1 style="font-size:22px;margin:0 0 16px;color:#D8CA82;">${escapeHtml(subject)}</h1>${paragraphs}</div>
      <div style="padding:16px 28px;border-top:1px solid #222;font-size:11px;color:#777;">Vous recevez cet email car vous avez confirmé votre inscription. <a href="${escapeHtml(unsubscribe)}" style="color:#D8CA82;">Se désinscrire</a>.</div>
    </div>`;
};

exports.sendNewsletterDigest = onCall(
  { secrets: REGION_SECRETS, memory: "512MiB", timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth?.uid || !(await isBureauUser(request.auth.uid))) {
      throw new HttpsError("permission-denied", "Accès réservé au bureau.");
    }
    if (!getResendKey() && !getBrevoKey()) throw new HttpsError("failed-precondition", "Aucun fournisseur email configuré.");
    const subject = String(request.data?.subject || "").trim().slice(0, 140);
    const body = String(request.data?.body || "").trim().slice(0, 6000);
    if (!subject || !body) throw new HttpsError("invalid-argument", "Sujet et contenu requis.");

    const snap = await db.collection("newsletter").where("confirmed", "==", true).get();
    const recipients = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.email && s.confirmToken);
    const results = await Promise.allSettled(recipients.map((s) => sendEmail(s.email, subject, digestHtml({ subject, body, token: s.confirmToken }))));
    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - sent;
    await db.collection("newsletterDigestLogs").add({
      subject,
      body,
      sent,
      failed,
      total: recipients.length,
      actorUid: request.auth.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    results.filter((r) => r.status === "rejected").forEach((r) => logger.error("sendNewsletterDigest envoi échoué", r.reason));
    return { sent, failed, total: recipients.length };
  }
);

const deleteQueryDocs = async (querySnapOrQuery, recursive = false) => {
  const snap = typeof querySnapOrQuery.get === "function" ? await querySnapOrQuery.get() : querySnapOrQuery;
  await Promise.all(snap.docs.map((d) => recursive && typeof db.recursiveDelete === "function" ? db.recursiveDelete(d.ref) : d.ref.delete()));
  return snap.size;
};

const purgeAccountData = async (uid) => {
  let deleted = 0;
  const roots = [
    [db.collection("users").doc(uid), true],
    [db.collection("profiles").doc(uid), true],
    [db.collection("pushTokens").where("uid", "==", uid), false],
    [db.collection("notifications").where("targetUid", "==", uid), false],
    [db.collection("notifications").where("uid", "==", uid), false],
    [db.collection("activity").where("uid", "==", uid), false],
    [db.collection("availabilities").where("uid", "==", uid), false],
    [db.collection("recurringAvailabilities").where("uid", "==", uid), false],
    [db.collection("absences").where("uid", "==", uid), false],
    [db.collection("notes").where("ownerUid", "==", uid), true],
    [db.collection("supportThreads").where("uid", "==", uid), true],
    [db.collection("recruitThreads").where("uid", "==", uid), true],
    [db.collectionGroup("messages").where("uid", "==", uid), false],
  ];

  for (const [target, recursive] of roots) {
    try {
      if (typeof target.path === "string") {
        const snap = await target.get();
        if (snap.exists) { await (recursive && typeof db.recursiveDelete === "function" ? db.recursiveDelete(target) : target.delete()); deleted += 1; }
      } else {
        deleted += await deleteQueryDocs(target, recursive);
      }
    } catch (err) {
      logger.error(`purgeAccountData erreur uid=${uid}`, err);
    }
  }

  await db.collection("accountDeletionRequests").doc(uid).set({
    uid,
    status: "completed",
    deletedDocumentsApprox: deleted,
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return deleted;
};

exports.purgeDeletedAccount = functionsV1.auth.user().onDelete(async (user) => {
  const deleted = await purgeAccountData(user.uid);
  logger.info(`purgeDeletedAccount: uid=${user.uid}, deleted≈${deleted}`);
  return { deleted };
});

/* ============================================================================
 * 2FA côté serveur (TOTP) — vérification et sessions récentes
 * ============================================================================
 * Le secret TOTP vit dans mfaSecrets/{uid} (ou users/{uid}.totp en legacy).
 * Le code n'est PLUS vérifié dans le navigateur : `verifyMfaSession` vérifie
 * le code côté serveur puis écrit mfaSessions/{uid} (horodatage serveur).
 * Les règles Firestore exigent cette session récente (< 6 h) pour toutes les
 * opérations sensibles (rôles, matchs, campagnes, newsletter, audit…).
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const base32Decode = (input) => {
  const clean = String(input || "").toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
};

const totpAt = (secret, timestamp, step = 30, digits = 6) => {
  const key = base32Decode(secret);
  if (!key.length) return "";
  const counter = Math.floor(timestamp / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
};

const verifyTotpServer = (secret, code, { window = 1, step = 30 } = {}) => {
  const trimmed = String(code || "").replace(/\D/g, "");
  if (trimmed.length !== 6 || !secret) return false;
  const now = Date.now();
  for (let i = -window; i <= window; i += 1) {
    if (totpAt(secret, now + i * step * 1000, step) === trimmed) return true;
  }
  return false;
};

const readTotpSecret = async (uid) => {
  const snap = await db.collection("mfaSecrets").doc(uid).get();
  if (snap.exists && snap.data().secret) return snap.data().secret;
  // Legacy Spark : secret stocké sur users/{uid}.totp.secret.
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) return "";
  const data = userSnap.data() || {};
  return data.totp?.secret || data.totpSecret || "";
};

const MFA_SESSION_TTL_SECONDS = 21600; // 6 h — « session MFA récente »

exports.verifyMfaSession = onCall(
  { memory: "128MiB", timeoutSeconds: 15 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Connexion requise.");
    const code = String(request.data?.code || "").replace(/\D/g, "");
    if (code.length !== 6) throw new HttpsError("invalid-argument", "Code à 6 chiffres requis.");
    const secret = await readTotpSecret(uid);
    if (!secret) throw new HttpsError("failed-precondition", "Aucun second facteur actif sur ce compte.");
    if (!verifyTotpServer(secret, code)) {
      throw new HttpsError("unauthenticated", "Code invalide ou expiré.");
    }
    await db.collection("mfaSessions").doc(uid).set({
      uid,
      method: "totp",
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + MFA_SESSION_TTL_SECONDS * 1000),
    });
    // Synchronise le claim de rôle (custom claim) : les rôles sensibles sont
    // administrés côté serveur, pas par le client.
    try {
      const userSnap = await db.collection("users").doc(uid).get();
      const role = userSnap.exists ? userSnap.data().role : null;
      if (role) {
        await admin.auth().setCustomUserClaims(uid, { role, mfaVerifiedAt: Math.floor(Date.now() / 1000) });
      }
    } catch (err) {
      logger.warn("verifyMfaSession: mise à jour des claims", err);
    }
    return { verified: true, expiresIn: MFA_SESSION_TTL_SECONDS };
  }
);

exports.syncRoleClaims = onCall(
  { memory: "128MiB", timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth?.uid || !(await isBureauUser(request.auth.uid))) {
      throw new HttpsError("permission-denied", "Accès réservé au bureau.");
    }
    const targetUid = String(request.data?.uid || "");
    if (!targetUid) throw new HttpsError("invalid-argument", "uid requis.");
    const snap = await db.collection("users").doc(targetUid).get();
    if (!snap.exists) throw new HttpsError("not-found", "Utilisateur introuvable.");
    const role = snap.data().role;
    if (!["visitor", "player", "manager", "bureau"].includes(role)) {
      throw new HttpsError("invalid-argument", "Rôle invalide.");
    }
    await admin.auth().setCustomUserClaims(targetUid, { role });
    await db.collection("admin_audit").add({
      action: "sync_role_claims",
      actorUid: request.auth.uid,
      targetUid,
      role,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { ok: true, role };
  }
);

/* ============================================================================
 * Création de notifications validée côté serveur
 * ============================================================================
 * Les règles Firestore n'autorisent la création directe que pour les actions
 * métier strictes (mention chat, rappel personnel). Toutes les autres
 * notifications passent par ce callable qui valide l'auteur et le type.
 */
const NOTIFICATION_TYPES = new Set([
  "chat_mention",
  "match_reminder",
  "event_new",
  "support_new",
  "recruit_new",
  "thread_reply",
  "absence_declared",
  "attendance",
]);
const GAME_NAMES = ["EVA", "Rocket League", "Valorant"];

const isManagerPlusUser = async (uid) => {
  if (uid === OFFICIAL_UID) return true;
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists && ["manager", "bureau"].includes(snap.data().role);
};

exports.createNotification = onCall(
  { memory: "128MiB", timeoutSeconds: 20 },
  async (request) => {
    const actorUid = request.auth?.uid;
    if (!actorUid) throw new HttpsError("unauthenticated", "Connexion requise.");
    const data = request.data || {};
    const type = String(data.type || "");
    if (!NOTIFICATION_TYPES.has(type)) throw new HttpsError("invalid-argument", "Type de notification inconnu.");

    const extra = String(data.extra || "").slice(0, 300);
    const link = String(data.link || "/").slice(0, 300);
    const targetUid = data.targetUid ? String(data.targetUid) : null;
    let targetRoles = Array.isArray(data.targetRoles) ? data.targetRoles.map(String).filter(Boolean).slice(0, 4) : null;
    const targetGame = data.targetGame ? String(data.targetGame) : null;

    if (type === "chat_mention") {
      if (!targetUid || targetUid === actorUid) throw new HttpsError("invalid-argument", "Mention invalide.");
      targetRoles = null;
    } else if (type === "match_reminder") {
      if (targetUid !== actorUid) throw new HttpsError("invalid-argument", "Rappel personnel uniquement.");
      targetRoles = null;
    } else if (type === "event_new") {
      if (!(await isManagerPlusUser(actorUid))) throw new HttpsError("permission-denied", "Réservé aux managers.");
      if (!targetGame || !GAME_NAMES.includes(targetGame)) throw new HttpsError("invalid-argument", "Pôle requis.");
      targetRoles = ["player", "manager", "bureau"];
    } else if (type === "support_new") {
      if (!targetRoles || targetRoles.join(",") !== "bureau") throw new HttpsError("invalid-argument", "Cible invalide.");
      const threads = await db.collection("supportThreads").where("uid", "==", actorUid).limit(1).get();
      if (threads.empty) throw new HttpsError("permission-denied", "Aucun ticket support associé.");
    } else if (type === "recruit_new") {
      if (!targetRoles || targetRoles.join(",") !== "manager,bureau") throw new HttpsError("invalid-argument", "Cible invalide.");
      const apps = await db.collection("recruitThreads").where("uid", "==", actorUid).limit(1).get();
      if (apps.empty) throw new HttpsError("permission-denied", "Aucune candidature associée.");
    } else if (type === "thread_reply") {
      if (!targetUid) throw new HttpsError("invalid-argument", "Cible invalide.");
      const isStaff = await isManagerPlusUser(actorUid);
      if (targetUid !== actorUid && !isStaff) throw new HttpsError("permission-denied", "Réponse non autorisée.");
    } else if (type === "absence_declared") {
      if (!(await isManagerPlusUser(actorUid)) && targetUid !== actorUid) {
        throw new HttpsError("permission-denied", "Réponse non autorisée.");
      }
    }

    if (targetGame && !GAME_NAMES.includes(targetGame)) throw new HttpsError("invalid-argument", "Pôle invalide.");

    await db.collection("notifications").add({
      targetUid,
      targetRoles,
      targetGame: targetGame || null,
      type,
      extra,
      link,
      readBy: [],
      createdBy: actorUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { ok: true };
  }
);

/* ============================================================================
 * Désinscription newsletter — jeton signé par email (jamais de lecture publique)
 * ============================================================================
 * Le formulaire public /newsletter appelle ce callable : on cherche l'email,
 * on envoie un lien de désinscription à jeton (confirmToken) et on ne révèle
 * jamais si l'email est inscrit (réponse générique).
 */
exports.requestNewsletterUnsubscribe = onCall(
  { secrets: REGION_SECRETS, memory: "128MiB", timeoutSeconds: 15 },
  async (request) => {
    const email = String(request.data?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpsError("invalid-argument", "Email invalide.");
    const snap = await db.collection("newsletter").where("email", "==", email).limit(5).get();
    if (snap.empty) {
      // Réponse générique : aucune fuite sur l'existence de l'abonnement.
      return { sent: true };
    }
    const docSnap = snap.docs[0];
    const sub = docSnap.data() || {};
    if (!sub.confirmToken) {
      throw new HttpsError("failed-precondition", "Abonnement sans jeton de désinscription.");
    }
    if (!getResendKey() && !getBrevoKey()) {
      throw new HttpsError("failed-precondition", "Aucun fournisseur email configuré.");
    }
    const unsubscribeUrl = cloudFunctionUrl("unsubscribeNewsletter", sub.confirmToken);
    const subject = "Confirmez votre désinscription à la newsletter Elysium";
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#111111;color:#f7f7f7;border:1px solid #222;">
        <div style="padding:24px 28px;border-bottom:1px solid #222;"><p style="margin:0;letter-spacing:.3em;font-size:11px;text-transform:uppercase;color:#D8CA82;">ELYSIUM NEWSLETTER</p></div>
        <div style="padding:28px;">
          <h1 style="font-size:20px;margin:0 0 12px;color:#D8CA82;">Désinscription</h1>
          <p style="font-size:15px;line-height:1.6;color:#cfcfcf;">Vous recevez cet email parce qu'une demande de désinscription a été faite pour ${escapeHtml(email)}. Cliquez sur le bouton pour confirmer : vous ne recevrez plus aucun digest.</p>
          <p style="margin:24px 0 0;"><a href="${escapeHtml(unsubscribeUrl)}" style="display:inline-block;background:#D8CA82;color:#111111;font-weight:700;text-transform:uppercase;letter-spacing:.15em;font-size:12px;padding:12px 22px;text-decoration:none;">Confirmer ma désinscription</a></p>
        </div>
      </div>`;
    await sendEmail(email, subject, html);
    await docSnap.ref.set({ unsubRequestedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { sent: true };
  }
);

/* ============================================================================
 * Rappels de match planifiés côté serveur
 * ============================================================================
 * scheduleMatchReminder (callable) enregistre un rappel dans matchReminders.
 * processMatchReminders (planificateur, toutes les minutes) crée la
 * notification + email + push à l'heure choisie — navigateur fermé ou pas.
 */
exports.scheduleMatchReminder = onCall(
  { memory: "128MiB", timeoutSeconds: 20 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Connexion requise.");
    const matchId = String(request.data?.matchId || "");
    if (!matchId) throw new HttpsError("invalid-argument", "matchId requis.");
    const minutesBefore = Math.max(1, Math.min(120, Number(request.data?.minutesBefore) || 15));

    const matchSnap = await db.collection("matches").doc(matchId).get();
    if (!matchSnap.exists) throw new HttpsError("not-found", "Match introuvable.");
    const match = matchSnap.data() || {};
    const kickoff = new Date(`${match.date || ""}T${(match.time || "20:00").slice(0, 5)}:00`);
    if (isNaN(kickoff.getTime())) throw new HttpsError("invalid-argument", "Date de match invalide.");
    if (kickoff.getTime() <= Date.now()) throw new HttpsError("failed-precondition", "Ce match est déjà passé.");
    const fireAt = new Date(kickoff.getTime() - minutesBefore * 60000);
    if (fireAt.getTime() <= Date.now()) throw new HttpsError("failed-precondition", "L'heure du rappel est déjà passée.");

    const existing = await db.collection("matchReminders")
      .where("uid", "==", uid)
      .where("matchId", "==", matchId)
      .where("status", "==", "pending")
      .limit(1)
      .get();
    if (existing.empty) {
      await db.collection("matchReminders").add({
        uid,
        matchId,
        matchName: String(match.opponentName || "").slice(0, 120),
        minutesBefore,
        fireAt: admin.firestore.Timestamp.fromDate(fireAt),
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    return { ok: true, fireAt: fireAt.toISOString() };
  }
);

exports.cancelMatchReminder = onCall(
  { memory: "128MiB", timeoutSeconds: 15 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Connexion requise.");
    const matchId = String(request.data?.matchId || "");
    if (!matchId) return { ok: true };
    const snap = await db.collection("matchReminders")
      .where("uid", "==", uid)
      .where("matchId", "==", matchId)
      .where("status", "==", "pending")
      .get();
    await Promise.all(snap.docs.map((d) => d.ref.update({
      status: "cancelled",
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
    })));
    return { ok: true };
  }
);

exports.processMatchReminders = onSchedule(
  { schedule: "every 1 minutes", memory: "128MiB", timeoutSeconds: 60 },
  async () => {
    const now = admin.firestore.Timestamp.now();
    const snap = await db.collection("matchReminders")
      .where("status", "==", "pending")
      .where("fireAt", "<=", now)
      .get();
    let fired = 0;
    for (const docSnap of snap.docs) {
      const r = docSnap.data() || {};
      try {
        await db.collection("notifications").add({
          targetUid: r.uid || null,
          type: "match_reminder",
          extra: String(r.matchName || "").slice(0, 120),
          link: "/resultats",
          readBy: [],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await docSnap.ref.update({ status: "fired", firedAt: now });
        fired += 1;
      } catch (err) {
        logger.error("processMatchReminders", err);
      }
    }
    logger.info(`processMatchReminders: ${fired} rappel(s) traités (${snap.size} dû(s)).`);
    return { fired, due: snap.size };
  }
);

exports.getMatchReminderState = onCall(
  { memory: "128MiB", timeoutSeconds: 15 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Connexion requise.");
    const matchId = String(request.data?.matchId || "");
    if (!matchId) return { active: false };
    const snap = await db.collection("matchReminders")
      .where("uid", "==", uid)
      .where("matchId", "==", matchId)
      .where("status", "==", "pending")
      .limit(1)
      .get();
    return { active: !snap.empty };
  }
);
