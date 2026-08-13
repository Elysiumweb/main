import QRCode from "qrcode";

/**
 * Génère un data-URL PNG du QR (otpauth://…) côté client.
 * Évite d'envoyer le secret TOTP à un service tiers (quickchart, etc.).
 */
export const toQrDataUrl = (text, size = 176) =>
  QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#111111", light: "#ffffff" },
  });
