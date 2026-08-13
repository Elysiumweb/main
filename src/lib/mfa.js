import {
  EmailAuthProvider,
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  multiFactor,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";

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

export const mfaErrorMessage = (err) => {
  switch (err?.code) {
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
      return "La double authentification n'est pas activée sur le projet Firebase.";
    case "auth/user-token-expired":
      return "Session expirée. Reconnectez-vous puis réessayez.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Mot de passe incorrect.";
    case "auth/too-many-requests":
      return "Trop de tentatives. Réessayez dans quelques minutes.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Fenêtre de confirmation fermée.";
    case "auth/multi-factor-auth-required":
      return "Code de double authentification requis.";
    default:
      return "Impossible de configurer la double authentification.";
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
