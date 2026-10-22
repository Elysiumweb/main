/**
 * Invitations du staff
 * ============================================================================
 * Le rôle et les permissions d'un compte ne doivent plus être édités
 * manuellement utilisateur par utilisateur. Un membre du bureau génère un lien
 * (et un QR code) portant un jeton à usage unique ; le destinataire se connecte,
 * puis la Cloud Function `redeemInvitation` applique rôle + permissions.
 *
 * Le jeton est un identifiant de document Firestore : il est généré côté
 * navigateur avec `crypto.getRandomValues` (256 bits → 64 caractères hex).
 */

export const INVITATION_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REVOKED: "revoked",
  EXPIRED: "expired",
};

export const INVITATION_ROLES = ["player", "manager", "bureau"];

export const INVITATION_TTL_DAYS = [1, 3, 7, 14, 30];

const TOKEN_ALPHABET = "0123456789abcdef";

export const generateInviteToken = (length = 48) => {
  const size = Math.max(24, Math.min(96, length));
  const bytes = new Uint8Array(size);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < size; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % 16]).join("");
};

export const isInviteToken = (token) =>
  typeof token === "string" && /^[0-9a-f]{24,96}$/.test(token);

export const invitationUrl = (token, origin = typeof window !== "undefined" ? window.location.origin : "") => {
  if (!isInviteToken(token)) return "";
  return `${origin.replace(/\/$/, "")}/invitation/${token}`;
};

export const expiresAt = (fromDate = new Date(), days = 7) => {
  const parsed = Number(days);
  const safeDays = Number.isFinite(parsed) ? Math.max(1, Math.min(90, Math.round(parsed))) : 7;
  return new Date(fromDate.getTime() + safeDays * 24 * 60 * 60 * 1000);
};

export const isInvitationExpired = (invitation, now = new Date()) => {
  if (!invitation) return true;
  if (invitation.status && invitation.status !== INVITATION_STATUS.PENDING) return true;
  if (!invitation.expiresAt) return false;
  const date = invitation.expiresAt?.toDate ? invitation.expiresAt.toDate() : new Date(invitation.expiresAt);
  return Number.isFinite(date.getTime()) ? date.getTime() < now.getTime() : true;
};

/** Charge le générateur de QR code à la demande (jamais dans le bundle public). */
export const makeInvitationQr = async (url, options = {}) => {
  if (!url) return "";
  const mod = await import("qrcode");
  const QRCode = mod.default || mod;
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
    color: { dark: "#111111", light: "#F7F7F7" },
    ...options,
  });
};

/** Libellé lisible d'une invitation, sans exposer le jeton. */
export const invitationLabel = (invitation) =>
  invitation?.email || invitation?.note || "Invitation sans destinataire nommé";
