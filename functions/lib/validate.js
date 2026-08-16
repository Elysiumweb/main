/**
 * Validation serveur des champs des formulaires publics.
 * Chaque fonction lève une HttpsError("invalid-argument") explicite.
 */

const { HttpsError } = require("firebase-functions/v2/https");

const fail = (message) => {
  throw new HttpsError("invalid-argument", message);
};

const cleanString = (value, { name, min = 0, max = 500, required = true } = {}) => {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) {
    if (required) fail(`Champ « ${name} » requis.`);
    return "";
  }
  if (s.length < min) fail(`Champ « ${name} » trop court (minimum ${min} caractères).`);
  if (s.length > max) fail(`Champ « ${name} » trop long (maximum ${max} caractères).`);
  return s;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const cleanEmail = (value, { name = "email", required = true } = {}) => {
  const s = cleanString(value, { name, max: 180, required });
  if (!s) return "";
  if (!EMAIL_RE.test(s)) fail("Adresse email invalide.");
  return s.toLowerCase();
};

const cleanUrl = (value, { name = "lien", required = false } = {}) => {
  const s = cleanString(value, { name, max: 2000, required });
  if (!s) return "";
  let parsed;
  try {
    parsed = new URL(s);
  } catch {
    fail(`Champ « ${name} » : URL invalide.`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) fail(`Champ « ${name} » : seuls les liens http(s) sont acceptés.`);
  return s;
};

const cleanEnum = (value, allowed, { name } = {}) => {
  const s = typeof value === "string" ? value.trim() : "";
  if (!allowed.includes(s)) fail(`Champ « ${name} » invalide.`);
  return s;
};

const requireTrue = (value, message) => {
  if (value !== true) fail(message);
};

/** Honeypot côté serveur : si le champ caché est rempli, on rejette. */
const rejectHoneypot = (value) => {
  if (typeof value === "string" && value.trim().length > 0) {
    throw new HttpsError("permission-denied", "Requête rejetée.");
  }
};

module.exports = { cleanString, cleanEmail, cleanUrl, cleanEnum, requireTrue, rejectHoneypot, EMAIL_RE };
