import {
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  multiFactor,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./firebase";

export const TOTP_FACTOR_ID = TotpMultiFactorGenerator.FACTOR_ID || "totp";

const isTotpFactor = (factor) =>
  factor?.factorId === "totp" || factor?.factorId === TOTP_FACTOR_ID;

/** Lecture interne (reloadUserInfo) si multiFactor() jette — cas HMR / listener déjà posé. */
const factorsFromReloadInfo = (user) => {
  const raw = user?.reloadUserInfo?.mfaInfo;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((info) => info?.totpInfo || info?.factorId === "totp")
    .map((info) => ({
      uid: info.mfaEnrollmentId,
      displayName: info.displayName || "TOTP",
      factorId: TOTP_FACTOR_ID,
    }));
};

export const readEnrolledFactors = (user) => {
  if (!user) return [];
  try {
    const mfaUser = typeof multiFactor === "function" ? multiFactor(user) : null;
    const live = (mfaUser?.enrolledFactors || []).filter(isTotpFactor);
    if (live.length) return live;
  } catch (err) {
    console.warn("mfa enrolledFactors", err);
  }
  return factorsFromReloadInfo(user);
};

/**
 * Firebase ne remplit `enrolledFactors` qu'après un reload *postérieur*
 * à la première création du MultiFactorUser. Sans ça, un compte déjà
 * protégé apparaît comme « sans 2FA » au rechargement de page.
 */
export const syncEnrolledFactors = async (user) => {
  if (!user) return [];
  try {
    if (typeof multiFactor === "function") multiFactor(user);
    if (typeof user.reload === "function") await user.reload();
  } catch (err) {
    console.warn("mfa sync", err);
  }
  return readEnrolledFactors(user);
};

export const isTotpDisabledError = (err) => {
  const code = err?.code || "";
  return code === "auth/operation-not-allowed" || code === "auth/admin-restricted-operation";
};

export const ensureProjectTotpEnabled = async () => {
  const call = httpsCallable(functions, "ensureTotpMfa");
  const res = await call();
  return res?.data || { enabled: true };
};

const getLang = () => { try { return localStorage.getItem("elysium_lang") || "fr"; } catch { return "fr"; } };
export const mfaErrorMessage = (err) => {
  const lang = getLang();
  const code = err?.code || "";
  const details = String(err?.message || err?.details || "");
  if (/identity platform|IDENTITY_PLATFORM|Mettre à niveau/i.test(details)) {
    return lang === "en" ? "Upgrade Firebase Authentication to Identity Platform (Firebase console → Authentication → Upgrade) then retry." : "Passez Firebase Authentication en Identity Platform (console Firebase → Authentication → Mettre à niveau), puis réessayez.";
  }
  if (code === "functions/not-found" || code === "functions/unimplemented" || code === "functions/unavailable") {
    return "La 2FA n'est pas encore activée côté serveur. Déployez la Cloud Function ensureTotpMfa puis réessayez.";
  }
  switch (code) {
    case "auth/requires-recent-login":
      return "Pour des raisons de sécurité, confirmez votre identité pour continuer.";
    case "auth/unverified-email":
      return "Vérifiez votre adresse email avant d'activer la double authentification.";
    case "auth/invalid-verification-code":
    case "auth/invalid-code":
    case "auth/invalid-multi-factor-session":
      return "Code invalide ou expiré. Générez un nouveau code et réessayez.";
    case "auth/code-expired":
    case "auth/totp-challenge-timeout":
      return "Le délai d'activation est dépassé. Recommencez l'enrôlement.";
    case "auth/maximum-second-factor-count-exceeded":
    case "auth/second-factor-already-in-use":
      return "Un second facteur TOTP est déjà actif sur ce compte.";
    case "auth/unsupported-first-factor":
      return "Ce mode de connexion ne permet pas la double authentification.";
    case "auth/operation-not-allowed":
    case "auth/admin-restricted-operation":
      return "Activation automatique de la 2FA en cours. Si ça persiste : console Firebase → Authentication → MFA → activer TOTP.";
    case "functions/failed-precondition":
      return details || "Passez Firebase Authentication en Identity Platform, puis réessayez.";
    case "auth/user-token-expired":
      return "Session expirée. Reconnectez-vous puis réessayez.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return lang === "en" ? "Incorrect password." : "Mot de passe incorrect.";
    case "auth/too-many-requests":
      return lang === "en" ? "Too many attempts. Try again in a few minutes." : "Trop de tentatives. Réessayez dans quelques minutes.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Fenêtre de confirmation fermée.";
    case "auth/multi-factor-auth-required":
      return "Code de double authentification requis.";
    case "permission-denied":
    case "firestore/permission-denied":
      return "Écriture refusée par Firestore. La 2FA est maintenant enregistrée sur votre profil (pas besoin de nouvelle collection). Rechargez et réessayez.";
    default:
      return details && details.length < 220 ? details : "Impossible de configurer la double authentification.";
  }
};

export const userHasPassword = (user) =>
  !!user?.providerData?.some((p) => p.providerId === "password");

export const userHasGoogle = (user) =>
  !!user?.providerData?.some((p) => p.providerId === "google.com");

export const resolverFromMfaError = (err) => {
  if (err?.code !== "auth/multi-factor-auth-required") return null;
  try {
    return getMultiFactorResolver(auth, err);
  } catch (e) {
    console.error("mfa resolver", e);
    return null;
  }
};
