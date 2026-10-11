/**
 * Trigger / template email post-don (don simple + adhésion PayPal).
 * À brancher sur un webhook PayPal / Cloud Function Firestore onCreate `donations`.
 */
const { sendEmail, escapeHtml } = require("./mail");

const getMailFrom = () => process.env.MAIL_FROM || "Elysium <noreply@elysium-esport.fr>";

exports.sendThankYou = async ({ to, name = "", amount = 0, isSubscription = false }) => {
  const subject = isSubscription
    ? "Bienvenue parmi les membres Elysium — confirmation d'adhésion"
    : "Merci pour votre soutien — reçu de don Elysium";

  const html = `
    <div style="font-family:system-ui,sans-serif;color:#f7f7f7;background:#111111;padding:32px 24px;max-width:560px;margin:0 auto;border-top:3px solid #D8CA82;">
      <h2 style="font-family:'Playfair Display',serif;color:#D8CA82;font-size:22px;margin:0 0 16px;">Merci, ${escapeHtml(name || "membre")}.</h2>
      <p style="line-height:1.6;color:#c8c8c8;font-size:15px;">
        ${isSubscription ? "Votre adhésion mensuelle est confirmée." : "Votre don a bien été reçu."}
        ${amount ? `<br><strong style="color:#D8CA82;">Montant : ${amount.toFixed(2)} €</strong>` : ""}
      </p>
      <p style="line-height:1.6;color:#c8c8c8;font-size:15px;">
        Un reçu vous est envoyé séparément. Pour annuler votre abonnement : <a href="https://elysium-esport.fr/soutenir" style="color:#D8CA82;text-decoration:underline;">accédez à votre compte PayPal</a> ou contactez-nous.
      </p>
      <hr style="border:0;border-top:1px solid rgba(255,255,255,0.10);margin:24px 0;">
      <p style="font-size:12px;color:#888;">Elysium Esport — équipe compétitive & communauté.</p>
    </div>`;

  if (!to) throw new Error("Email post-don manquant : champ 'to' requis.");
  return sendEmail(to, subject, html);
};
