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

const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const functionsV1 = require("firebase-functions/v1");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const {
  getMailFrom, getResendKey, getBrevoKey, escapeHtml, sendEmail,
} = require("./lib/mail");

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
    subject: (n) => `[Match] À venir — ${n.extra || ""}`,
    title: "Match à venir",
    intro: () => "Un match suivi est programmé. Retrouvez les détails sur le site.",
  },
  match_result: {
    subject: (n) => `[Résultat] ${n.extra || "Nouveau résultat"}`,
    title: "Nouveau résultat",
    intro: () => "Le résultat d’un match que vous suivez est disponible.",
  },
  article_new: {
    subject: (n) => `[Actualité] ${n.extra || "Nouvel article"}`,
    title: "Nouvel article",
    intro: () => "Un nouvel article lié à vos sujets favoris vient d’être publié.",
  },
  live_started: {
    subject: (n) => `[Live] ${n.extra || "Elysium est en direct"}`,
    title: "Le live commence",
    intro: () => "Un match que vous suivez est maintenant en direct.",
  },
  event_new_public: {
    subject: (n) => `[Événement] ${n.extra || "Nouvel événement"}`,
    title: "Nouvel événement",
    intro: () => "Un événement correspondant à vos favoris vient d’être publié.",
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

// ---- Fournisseurs d'envoi : voir lib/mail.js (sendEmail, Resend/Brevo) ----

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

const purgeAccountData = async (uid, email = "") => {
  let deleted = 0;
  const roots = [
    [db.collection("users").doc(uid), true],
    [db.collection("profiles").doc(uid), true],
    [db.collection("supporterPreferences").doc(uid), false],
    [db.collection("pushTokens").where("uid", "==", uid), false],
    [db.collection("notifications").where("targetUid", "==", uid), false],
    [db.collection("notifications").where("uid", "==", uid), false],
    [db.collection("activity").where("uid", "==", uid), false],
    [db.collection("activity").where("byUid", "==", uid), false],
    [db.collection("availabilities").where("uid", "==", uid), false],
    [db.collection("recurringAvailabilities").where("uid", "==", uid), false],
    [db.collection("absences").where("uid", "==", uid), false],
    [db.collection("notes").where("ownerUid", "==", uid), true],
    [db.collection("supportThreads").where("uid", "==", uid), true],
    [db.collection("recruitThreads").where("uid", "==", uid), true],
    [db.collectionGroup("messages").where("uid", "==", uid), false],
    [db.collectionGroup("rsvps").where("uid", "==", uid), false],
    [db.collection("mfaSecrets").doc(uid), false],
  ];
  if (email) {
    roots.push([db.collection("newsletter").where("email", "==", String(email).toLowerCase()), false]);
  }

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
  const deleted = await purgeAccountData(user.uid, user.email || "");
  logger.info(`purgeDeletedAccount: uid=${user.uid}, deleted≈${deleted}`);
  return { deleted };
});

// ============================================================================
// Alertes supporter — fan-out idempotent selon les favoris du visiteur
// ============================================================================
const supporterMatches = (preference, content) => {
  const games = Array.isArray(preference.games) ? preference.games : [];
  const rosters = Array.isArray(preference.rosters) ? preference.rosters : [];
  const competitions = Array.isArray(preference.competitions) ? preference.competitions : [];
  return (content.game && games.includes(content.game))
    || (content.roster && rosters.includes(content.roster))
    || (content.competition && competitions.includes(content.competition))
    || (content.competitionId && competitions.includes(content.competitionId));
};

const notifySupporters = async ({ source, sourceId, type, content, extra, link }) => {
  const snapshot = await db.collection("supporterPreferences").where("notificationTypes", "array-contains", type).get();
  const writes = [];
  snapshot.forEach((preferenceDoc) => {
    const preference = preferenceDoc.data();
    if (!supporterMatches(preference, content || {})) return;
    const id = `${source}_${sourceId}_${type}_${preferenceDoc.id}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    writes.push(db.collection("notifications").doc(id).set({
      targetUid: preferenceDoc.id,
      targetRoles: null,
      targetGame: null,
      type,
      extra: extra || "",
      link: link || "/",
      source,
      sourceId,
      readBy: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: false }));
  });
  await Promise.all(writes);
  logger.info(`supporter fan-out ${source}/${sourceId}/${type}: ${writes.length}`);
};

exports.fanOutMatchSupporters = onDocumentWritten(
  { document: "matches/{id}", memory: "256MiB", timeoutSeconds: 60 },
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (!after) return null;
    const content = { game: after.game, roster: after.roster, competition: after.competition, competitionId: after.competitionId };
    const label = `Elysium vs ${after.opponentName || "adversaire"}${after.competition ? ` · ${after.competition}` : ""}`;
    const jobs = [];
    if (!before && after.status !== "finished") jobs.push(notifySupporters({ source: "match", sourceId: event.params.id, type: "match_reminder", content, extra: label, link: "/resultats" }));
    if ((!before || before.status !== "live") && after.status === "live") jobs.push(notifySupporters({ source: "match", sourceId: event.params.id, type: "live_started", content, extra: label, link: after.watchUrl || "/resultats" }));
    const resultChanged = after.status === "finished" && (!before || before.status !== "finished" || before.scoreUs !== after.scoreUs || before.scoreThem !== after.scoreThem);
    if (resultChanged) jobs.push(notifySupporters({ source: "match", sourceId: event.params.id, type: "match_result", content, extra: `${label} · ${after.scoreUs ?? "–"}-${after.scoreThem ?? "–"}`, link: "/resultats" }));
    await Promise.all(jobs);
    return null;
  },
);

exports.fanOutArticleSupporters = onDocumentWritten(
  { document: "articles/{id}", memory: "256MiB", timeoutSeconds: 60 },
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (!after || after.status !== "published" || before?.status === "published") return null;
    return notifySupporters({ source: "article", sourceId: event.params.id, type: "article_new", content: after, extra: after.title || "Nouvel article", link: `/actus/${event.params.id}` });
  },
);

exports.fanOutEventSupporters = onDocumentCreated(
  { document: "communityEvents/{id}", memory: "256MiB", timeoutSeconds: 60 },
  async (event) => {
    const data = event.data?.data();
    if (!data) return null;
    return notifySupporters({ source: "event", sourceId: event.params.id, type: "event_new_public", content: data, extra: data.title || "Nouvel événement", link: "/calendrier" });
  },
);

// ============================================================================
// Modules additionnels
// ============================================================================
// - forms.js     : formulaires publics protégés (App Check, quotas IP/compte,
//   CAPTCHA adaptatif, validation serveur) + consentement parental.
// - rsvp.js      : RSVP transactionnel du calendrier communautaire.
// - gdpr.js      : export RGPD complet côté serveur.
// - retention.js : purges planifiées (corbeille Notes 30 j, threads 24 mois…).
Object.assign(
  exports,
  require("./forms"),
  require("./rsvp"),
  require("./gdpr"),
  require("./retention"),
);

