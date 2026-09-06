#!/usr/bin/env node
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const mode = [...args].find((arg) => arg.startsWith("--mode="))?.split("=")[1] || "build";
const skip = process.env.SKIP_ENV_VALIDATION === "true";

const DEFAULT_SITE_URL = "https://elysium-esport.fr";

const REQUIRED_CLIENT = [
  "REACT_APP_SITE_URL",
  "REACT_APP_FIREBASE_API_KEY",
  "REACT_APP_FIREBASE_AUTH_DOMAIN",
  "REACT_APP_FIREBASE_PROJECT_ID",
  "REACT_APP_FIREBASE_STORAGE_BUCKET",
  "REACT_APP_FIREBASE_MESSAGING_SENDER_ID",
  "REACT_APP_FIREBASE_APP_ID",
];

const OPTIONAL_FEATURES = [
  ["App Check", "REACT_APP_FIREBASE_APPCHECK_SITE_KEY"],
  ["reCAPTCHA formulaires", "REACT_APP_RECAPTCHA_SITE_KEY"],
  ["Push web", "REACT_APP_FIREBASE_VAPID_KEY"],
  ["PayPal client", "REACT_APP_PAYPAL_CLIENT_ID"],
  ["PayPal bouton ponctuel", "REACT_APP_PAYPAL_HOSTED_BUTTON_ID"],
  ["PayPal abonnement", "REACT_APP_PAYPAL_SUBSCRIPTION_HOSTED_BUTTON_ID"],
  ["Sentry", "REACT_APP_SENTRY_DSN"],
  ["Analytics custom", "REACT_APP_ANALYTICS_ENDPOINT"],
  ["UID officiel client", "REACT_APP_OFFICIAL_UID"],
  ["UID officiel Functions", "OFFICIAL_UID"],
  ["Email Resend", "RESEND_API_KEY"],
  ["Email Brevo", "BREVO_API_KEY"],
  ["Email expéditeur", "MAIL_FROM"],
  ["App Check Functions", "ENFORCE_APP_CHECK"],
];

const readExampleKeys = () => {
  if (!existsSync(".env.example")) return new Set();
  const text = readFileSync(".env.example", "utf8");
  return new Set(text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => line.split("=")[0].trim()));
};

const exampleKeys = readExampleKeys();
const get = (key) => process.env[key]?.trim();
const isPlaceholder = (value = "") => /^(__|changeme|todo|your_|xxx)/i.test(value);
const effectiveValue = (key) => {
  const explicit = get(key);
  if (key === "REACT_APP_SITE_URL" && !explicit) return DEFAULT_SITE_URL;
  return explicit;
};
const configured = (key) => {
  const value = effectiveValue(key);
  return Boolean(value && !isPlaceholder(value));
};

const rows = OPTIONAL_FEATURES.map(([label, key]) => ({
  feature: label,
  variable: key,
  state: configured(key) ? "activé" : "désactivé",
}));

console.log("\nConfiguration Elysium");
console.table(rows);

const failures = [];

if (mode === "example") {
  for (const key of REQUIRED_CLIENT) {
    if (!exampleKeys.has(key)) failures.push(`.env.example ne documente pas ${key}`);
  }
  for (const [, key] of OPTIONAL_FEATURES) {
    if (!exampleKeys.has(key)) failures.push(`.env.example ne documente pas ${key}`);
  }
}

if (mode !== "example" && !skip) {
  for (const key of REQUIRED_CLIENT) {
    if (!configured(key)) failures.push(`${key} manquant ou placeholder`);
  }
}

const siteUrl = effectiveValue("REACT_APP_SITE_URL");
if (!get("REACT_APP_SITE_URL") && mode !== "example") {
  console.warn(`[env] REACT_APP_SITE_URL absent — fallback canonique ${DEFAULT_SITE_URL} utilisé.`);
}
if (siteUrl) {
  try {
    const url = new URL(siteUrl);
    if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
      failures.push("REACT_APP_SITE_URL doit être en HTTPS en production");
    }
  } catch {
    failures.push("REACT_APP_SITE_URL n'est pas une URL valide");
  }
}

const clientOfficial = get("REACT_APP_OFFICIAL_UID");
const serverOfficial = get("OFFICIAL_UID");
if (clientOfficial && serverOfficial && clientOfficial !== serverOfficial) {
  failures.push("REACT_APP_OFFICIAL_UID et OFFICIAL_UID divergent : privilégier des custom claims ou corriger les valeurs.");
} else if (clientOfficial && !serverOfficial) {
  console.warn("[env] REACT_APP_OFFICIAL_UID est défini côté client sans OFFICIAL_UID côté Functions — vérifiez le couplage d'autorisation.");
}

for (const key of ["REACT_APP_SENTRY_TRACES_SAMPLE_RATE", "REACT_APP_SENTRY_REPLAY_SAMPLE_RATE", "REACT_APP_SENTRY_REPLAY_ERROR_SAMPLE_RATE"]) {
  if (!get(key)) continue;
  const value = Number(get(key));
  if (!Number.isFinite(value) || value < 0 || value > 1) failures.push(`${key} doit être un nombre entre 0 et 1`);
}

if (skip) console.warn("[env] SKIP_ENV_VALIDATION=true — validation non bloquante.");

if (failures.length) {
  console.error("\nValidation environnement échouée :");
  failures.forEach((failure) => console.error(`- ${failure}`));
  console.error("\nCopiez .env.example vers .env.local puis remplacez les placeholders. Utilisez SKIP_ENV_VALIDATION=true uniquement pour un smoke test local sans backend.");
  process.exit(1);
}

console.log(`\n[env] Validation ${mode} OK.`);
