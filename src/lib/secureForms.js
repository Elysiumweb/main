/**
 * Appels sécurisés vers les Cloud Functions des formulaires publics.
 * ----------------------------------------------------------------------------
 * Le serveur applique App Check, des quotas par IP/compte et un CAPTCHA
 * adaptatif : quand il répond `captcha-required`, on obtient un jeton
 * reCAPTCHA v3 côté navigateur puis on rejoue l'appel avec ce jeton.
 */

import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

const getLang = () => { try { return localStorage.getItem("elysium_lang") || "fr"; } catch { return "fr"; } };

const RECAPTCHA_SITE_KEY =
  process.env.REACT_APP_RECAPTCHA_SITE_KEY || process.env.REACT_APP_FIREBASE_APPCHECK_SITE_KEY || "";

let recaptchaLoader = null;

const loadRecaptcha = () => {
  if (!RECAPTCHA_SITE_KEY || typeof window === "undefined") return Promise.resolve(null);
  if (window.grecaptcha?.execute) return Promise.resolve(window.grecaptcha);
  if (!recaptchaLoader) {
    recaptchaLoader = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(RECAPTCHA_SITE_KEY)}`;
      script.async = true;
      script.onload = () => window.grecaptcha.ready(() => resolve(window.grecaptcha));
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  }
  return recaptchaLoader;
};

/** Jeton reCAPTCHA v3 pour une action donnée, ou null si non configuré/bloqué. */
export const getCaptchaToken = async (action = "submit") => {
  try {
    const grecaptcha = await loadRecaptcha();
    if (!grecaptcha) return null;
    return await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: action.replace(/[^a-zA-Z_]/g, "_") });
  } catch (err) {
    console.error("getCaptchaToken", err);
    return null;
  }
};

const isCaptchaRequired = (err) =>
  err?.details?.reason === "captcha-required" ||
  /anti-robot|captcha/i.test(String(err?.message || ""));

/**
 * Appelle une callable protégée ; rejoue automatiquement l'appel avec un jeton
 * reCAPTCHA si le serveur exige la vérification anti-robot adaptative.
 */
export const callProtected = async (name, payload = {}) => {
  const callable = httpsCallable(functions, name);
  try {
    return (await callable(payload)).data;
  } catch (err) {
    if (isCaptchaRequired(err)) {
      const captchaToken = await getCaptchaToken(name);
      if (captchaToken) return (await callable({ ...payload, captchaToken })).data;
    }
    throw err;
  }
};

/** Message d'erreur utilisateur pour un échec de callable protégée. */
export const protectedErrorMessage = (err, fallback = "Une erreur est survenue. Réessayez plus tard.") => {
  const code = String(err?.code || "");
  const details = err?.details || {};
  const lang = getLang();
  if (code.endsWith("resource-exhausted") || details.reason === "rate-limited") {
    if (details.retryAt) {
      const time = new Date(details.retryAt).toLocaleTimeString(lang === "en" ? "en-US" : "fr-FR", { hour: "2-digit", minute: "2-digit" });
      return lang === "en" ? `Too many recent submissions. Try again around ${time}.` : `Trop d'envois récents. Réessayez vers ${time}.`;
    }
    return lang === "en" ? "Too many recent submissions. Try again later." : "Trop d'envois récents. Réessayez plus tard.";
  }
  if (details.reason === "captcha-required") return lang === "en" ? "Anti-bot check failed. Try again later." : "Vérification anti-robot impossible. Réessayez plus tard.";
  if (code.endsWith("invalid-argument")) return err.message || fallback;
  if (code.endsWith("unauthenticated")) return lang === "en" ? "Sign-in required." : "Connexion requise.";
  return fallback;
};
