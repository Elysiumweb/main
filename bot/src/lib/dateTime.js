import { DEFAULT_TIMEZONE } from "../config.js";

const pad2 = (n) => String(n).padStart(2, "0");

/** Vérifie qu'une date grégorienne YYYY-MM-DD existe réellement (ex: rejette 31/02). */
const isValidCalendarDate = (year, month, day) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 2020 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
};

const resolveSafeTimeZone = (tz) => {
  const candidate = String(tz || "").trim() || DEFAULT_TIMEZONE;
  try {
    Intl.DateTimeFormat("en-CA", { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
};

/** Retourne { year, month, day, hour, minute, second } dans le fuseau horaire demandé. */
export const getZonedParts = (dateObj = new Date(), timeZone = DEFAULT_TIMEZONE) => {
  const safeTz = resolveSafeTimeZone(timeZone);
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map = {};
  for (const part of dtf.formatToParts(dateObj)) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour === 24 ? 0 : map.hour,
    minute: map.minute,
    second: map.second,
  };
};

/** Ajoute `days` jours calendaires à une chaîne YYYY-MM-DD. */
export const addDaysToIsoDate = (isoDate, days = 1) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
};

/**
 * Normalise une saisie de date vers "YYYY-MM-DD" (format attendu par le site Elysium).
 * Formats acceptés :
 *  - "2026-10-30" ou "2026/10/30"
 *  - "30/10/2026", "30-10-2026", "30.10.2026"
 *  - "30/10" ou "30-10" (année courante dans le fuseau Europe/Paris)
 *  - "aujourd'hui", "aujourdhui", "demain"
 */
export const parseMatchDate = (raw, { now = new Date(), timeZone = DEFAULT_TIMEZONE } = {}) => {
  const clean = String(raw || "").trim().toLowerCase();
  if (!clean) return null;

  const todayParts = getZonedParts(now, timeZone);
  const todayIso = `${todayParts.year}-${pad2(todayParts.month)}-${pad2(todayParts.day)}`;

  if (["aujourd'hui", "aujourdhui", "ajd", "today"].includes(clean)) {
    return todayIso;
  }
  if (["demain", "tomorrow"].includes(clean)) {
    return addDaysToIsoDate(todayIso, 1);
  }

  // ISO : YYYY-MM-DD ou YYYY/MM/DD
  const isoMatch = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(clean);
  if (isoMatch) {
    const [, yStr, mStr, dStr] = isoMatch;
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);
    if (!isValidCalendarDate(y, m, d)) return null;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  // FR : DD/MM/YYYY ou DD-MM-YYYY ou DD/MM/YY
  const frFullMatch = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(clean);
  if (frFullMatch) {
    const [, dStr, mStr, yRaw] = frFullMatch;
    const d = Number(dStr);
    const m = Number(mStr);
    const y = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
    if (!isValidCalendarDate(y, m, d)) return null;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  // FR court : DD/MM
  const frShortMatch = /^(\d{1,2})[-/.](\d{1,2})$/.exec(clean);
  if (frShortMatch) {
    const [, dStr, mStr] = frShortMatch;
    const d = Number(dStr);
    const m = Number(mStr);
    const y = todayParts.year;
    if (!isValidCalendarDate(y, m, d)) return null;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  return null;
};

/**
 * Normalise une saisie d'heure vers "HH:MM" (format 24h attendu par le site).
 * Formats acceptés : "20:00", "20h00", "20h", "9:30", "20.30"
 */
export const parseMatchTime = (raw) => {
  const clean = String(raw || "").trim().toLowerCase();
  if (!clean) return null;
  const match = /^(\d{1,2})(?:[:h.](\d{1,2})?)?$/.exec(clean);
  if (!match) return null;
  // Si seul un nombre sans séparateur est fourni (ex: "20"), on exige au moins "h" ou ":" sauf s'il est <=23
  const hh = Number(match[1]);
  const mm = match[2] !== undefined && match[2] !== "" ? Number(match[2]) : 0;
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return `${pad2(hh)}:${pad2(mm)}`;
};

/**
 * Convertit une date "YYYY-MM-DD" + heure "HH:MM" dans `timeZone` (Europe/Paris)
 * en timestamp UTC exact (ms), en gérant automatiquement l'heure d'été/hiver.
 */
export const zonedDateTimeToUtcMs = (isoDate, timeHm, timeZone = DEFAULT_TIMEZONE) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  const [hour, minute] = timeHm.split(":").map(Number);

  // Estimation initiale en UTC puis correction par l'écart observé dans le fuseau cible (2 passes pour DST)
  const targetUtcAsIfZoned = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = targetUtcAsIfZoned;

  for (let i = 0; i < 2; i += 1) {
    const parts = getZonedParts(new Date(guess), timeZone);
    const observedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      0
    );
    const diff = targetUtcAsIfZoned - observedAsUtc;
    guess += diff;
  }
  return guess;
};

/**
 * Calcule le planning complet d'un match (timestamps de début et de fin).
 * Si l'heure de fin est <= l'heure de début (ex: début 23:00, fin 00:30),
 * la fin est automatiquement positionnée au lendemain.
 */
export const computeMatchSchedule = ({
  dateInput,
  startTimeInput,
  endTimeInput,
  timeZone = DEFAULT_TIMEZONE,
  now = new Date(),
}) => {
  const date = parseMatchDate(dateInput, { now, timeZone });
  if (!date) {
    return { ok: false, error: "Date invalide. Utilisez par exemple `30/10/2026` ou `2026-10-30`." };
  }
  const startTime = parseMatchTime(startTimeInput);
  if (!startTime) {
    return { ok: false, error: "Heure du match invalide. Utilisez par exemple `20:00` ou `20h00`." };
  }
  const endTime = parseMatchTime(endTimeInput);
  if (!endTime) {
    return { ok: false, error: "Heure de fin invalide. Utilisez par exemple `21:00` ou `21h00`." };
  }

  const startAtMs = zonedDateTimeToUtcMs(date, startTime, timeZone);
  const endDate = endTime <= startTime ? addDaysToIsoDate(date, 1) : date;
  const endAtMs = zonedDateTimeToUtcMs(endDate, endTime, timeZone);

  return {
    ok: true,
    date,
    endDate,
    startTime,
    endTime,
    timeZone,
    startAtMs,
    endAtMs,
  };
};

/** Formate une date ISO YYYY-MM-DD en JJ/MM/AAAA pour l'affichage Discord. */
export const formatDateFr = (isoDate) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!m) return String(isoDate || "");
  return `${m[3]}/${m[2]}/${m[1]}`;
};
