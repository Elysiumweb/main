/**
 * Elysium — Cloud Functions : relais email des notifications.
 * ============================================================================
 * Déclencheur Firestore sur `notifications/{id}` (onCreate) :
 *   - résout les destinataires (par `targetUid` ou `targetRoles` ± `targetGame`)
 *     à partir de la collection `users` (email) ;
 *   - construit un objet + corps HTML selon le `type` de notification ;
 *   - envoie l'email via Resend (par défaut) ou Brevo (si BREVO_API_KEY défini).
 *
 * Cas couverts (cf. cahier des charges) :
 *   - convocations        -> type "event_new"
 *   - absences            -> type "absence_declared"
 *   - réponses de tickets -> types "thread_reply", "support_new", "recruit_new"
 *   - mentions chat       -> type "chat_mention"
 *
 * Variables d'environnement (Firebase CLI) :
 *   firebase functions:secrets:set RESEND_API_KEY
 *   firebase functions:secrets:set BREVO_API_KEY
 *   firebase functions:secrets:set MAIL_FROM
 *   firebase deploy --only functions
 *
 *   - RESEND_API_KEY : clé API Resend (https://resend.com/api-keys)
 *   - BREVO_API_KEY  : (optionnel) clé API Brevo — utilise Brevo si présent
 *   - MAIL_FROM      : adresse d'envoi (ex: "Elysium <noreply@elysium-esport.fr>")
 *                     doit être vérifiée chez le fournisseur.
 */

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM || "Elysium <noreply@elysium-esport.fr>";
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
    subject: (n) => `[Chat] Vous avez été mentionné`,
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

const buildEmail = (n) => {
  const tpl = TEMPLATES[n.type] || fallbackTemplate;
  const link = n.link && n.link.startsWith("http") ? n.link : `${APP_URL}${n.link || ""}`;
  const subject = tpl.subject(n);
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#111111;color:#f7f7f7;border:1px solid #222;">
      <div style="padding:24px 28px;border-bottom:1px solid #222;">
        <p style="margin:0;letter-spacing:.3em;font-size:11px;text-transform:uppercase;color:#D8CA82;">ELYSSIUM ESPORT</p>
      </div>
      <div style="padding:28px;">
        <h1 style="font-size:20px;margin:0 0 12px;color:#D8CA82;">${tpl.title}</h1>
        <p style="font-size:15px;line-height:1.6;color:#cfcfcf;">${tpl.intro(n)}</p>
        <p style="margin:24px 0 0;">
          <a href="${link}" style="display:inline-block;background:#D8CA82;color:#111111;font-weight:700;text-transform:uppercase;letter-spacing:.15em;font-size:12px;padding:12px 22px;text-decoration:none;">Ouvrir sur le site</a>
        </p>
      </div>
      <div style="padding:16px 28px;border-top:1px solid #222;font-size:11px;color:#666;">
        Vous recevez cet email parce que vous avez un compte Elysium. Les notifications se gèrent depuis l'espace joueur.
      </div>
    </div>`;
  return { subject, html };
};

// ---- Résolution des destinataires ----
const resolveRecipients = async (n) => {
  const emails = new Set();

  if (n.targetUid) {
    const snap = await db.collection("users").doc(n.targetUid).get();
    const email = snap.exists ? snap.data().email : null;
    if (email) emails.add(email);
  }

  if (Array.isArray(n.targetRoles) && n.targetRoles.length > 0) {
    // Requête par rôle (Firestore limite 'in' à 30 valeurs, largement suffisant).
    const snap = await db.collection("users").where("role", "in", n.targetRoles).get();
    snap.forEach((d) => {
      const data = d.data();
      if (!data.email) return;
      // Filtrage optionnel par pôle de jeu (sauf pour le bureau qui voit tout).
      if (n.targetGame && n.targetGame !== "global" && data.role !== "bureau") {
        if (data.game && data.game !== n.targetGame) return;
      }
      emails.add(data.email);
    });
  }

  return [...emails];
};

// ---- Fournisseurs d'envoi ----
const sendWithResend = async (to, subject, html) => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: MAIL_FROM, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  return `resend:${to}`;
};

const sendWithBrevo = async (to, subject, html) => {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: MAIL_FROM },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo ${res.status}: ${body}`);
  }
  return `brevo:${to}`;
};

exports.notifyEmail = onDocumentCreated(
  { document: "notifications/{id}", secrets: ["RESEND_API_KEY", "BREVO_API_KEY"], memory: "256MiB", timeoutSeconds: 30 },
  async (event) => {
    const n = event.data && event.data.data ? event.data.data() : null;
    if (!n) { logger.warn("notifyEmail: notification sans données"); return null; }

    // Aucun fournisseur configuré : on ignore silencieusement (mode in-app seul).
    if (!RESEND_API_KEY && !BREVO_API_KEY) {
      logger.info("notifyEmail: aucun fournisseur email configuré (in-app uniquement).");
      return null;
    }
    if (!n.targetUid && !(Array.isArray(n.targetRoles) && n.targetRoles.length > 0)) {
      logger.info("notifyEmail: notification sans destinataire identifiable, ignorée.");
      return null;
    }

    try {
      const recipients = await resolveRecipients(n);
      if (recipients.length === 0) {
        logger.info(`notifyEmail: aucun email pour type=${n.type}`);
        return null;
      }

      const { subject, html } = buildEmail(n);
      const send = BREVO_API_KEY ? sendWithBrevo : sendWithResend;

      // Envoi individuel (évite l'exposition des adresses entre destinataires).
      const results = await Promise.allSettled(recipients.map((to) => send(to, subject, html)));
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected");
      failed.forEach((r) => logger.error("notifyEmail envoi échoué", r.reason));

      logger.info(`notifyEmail: ${ok}/${recipients.length} email(s) envoyés (type=${n.type}).`);
      return { ok, total: recipients.length };
    } catch (err) {
      logger.error("notifyEmail erreur", err);
      return null;
    }
  }
);
