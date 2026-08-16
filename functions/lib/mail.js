/**
 * Helpers d'envoi email partagés (Resend / Brevo).
 * Extrait de index.js pour être réutilisé par les modules forms/gdpr/retention.
 */

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

const hasMailProvider = () => Boolean(getResendKey() || getBrevoKey());

const sendEmail = async (to, subject, html) => {
  if (!hasMailProvider()) throw new Error("Aucun fournisseur email configuré.");
  return getBrevoKey() ? sendWithBrevo(to, subject, html) : sendWithResend(to, subject, html);
};

module.exports = {
  getMailFrom,
  getResendKey,
  getBrevoKey,
  escapeHtml,
  parseMailFrom,
  sendWithResend,
  sendWithBrevo,
  sendEmail,
  hasMailProvider,
};
