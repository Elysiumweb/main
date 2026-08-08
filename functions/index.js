/**
 * Elysium — Cloud Functions
 * ============================================================================
 * - notifications/{id}: email + push FCM web aux destinataires.
 * - newsletter/{id}: envoi du double opt-in par email.
 * - confirmNewsletter / unsubscribeNewsletter: endpoints publics à jeton.
 * - sendNewsletterDigest: callable bureau pour envoyer un digest réel.
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
const functionsV1 = require("firebase-functions/v1");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

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
