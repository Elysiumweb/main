import { useEffect, useState } from "react";

export const DEFAULT_MATCH_TIMEZONE = "Europe/Paris";
export const DEFAULT_MATCH_DURATION_MS = 2 * 60 * 60 * 1000;

const pad2 = (n) => String(n).padStart(2, "0");

const resolveSafeTimeZone = (tz) => {
  const candidate = String(tz || "").trim() || DEFAULT_MATCH_TIMEZONE;
  try {
    Intl.DateTimeFormat("en-CA", { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_MATCH_TIMEZONE;
  }
};

export const getZonedParts = (dateObj = new Date(), timeZone = DEFAULT_MATCH_TIMEZONE) => {
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

export const getTodayIsoInTimezone = (now = new Date(), timeZone = DEFAULT_MATCH_TIMEZONE) => {
  const parts = getZonedParts(now, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
};

const addDaysToIsoDate = (isoDate, days = 1) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
};

const parseTimeHm = (raw) => {
  const m = /^(\d{1,2})[:h](\d{2})/.exec(String(raw || "").trim().toLowerCase());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${pad2(hh)}:${pad2(mm)}`;
};

/**
 * Convertit une date "YYYY-MM-DD" + heure "HH:MM" dans `timeZone` en timestamp UTC (ms).
 */
export const zonedDateTimeToUtcMs = (isoDate, timeHm, timeZone = DEFAULT_MATCH_TIMEZONE) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ""))) return null;
  const parsedHm = parseTimeHm(timeHm);
  if (!parsedHm) return null;

  const [year, month, day] = isoDate.split("-").map(Number);
  const [hour, minute] = parsedHm.split(":").map(Number);
  const safeTz = resolveSafeTimeZone(timeZone);

  const targetUtcAsIfZoned = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = targetUtcAsIfZoned;

  for (let i = 0; i < 2; i += 1) {
    const parts = getZonedParts(new Date(guess), safeTz);
    const observedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      0
    );
    guess += targetUtcAsIfZoned - observedAsUtc;
  }
  return guess;
};

/**
 * Calcule la fenêtre [startAtMs, endAtMs] d'un match si `date` et `time` sont renseignés.
 */
export const getMatchWindowMs = (match) => {
  if (!match?.date || !match?.time) return null;
  const tz = match.timezone || DEFAULT_MATCH_TIMEZONE;
  const startHm = parseTimeHm(match.time);
  if (!startHm) return null;

  const startAtMs = zonedDateTimeToUtcMs(match.date, startHm, tz);
  if (!Number.isFinite(startAtMs)) return null;

  const endHm = parseTimeHm(match.endTime);
  if (endHm) {
    const endDate = endHm <= startHm ? addDaysToIsoDate(match.date, 1) : match.date;
    const endAtMs = zonedDateTimeToUtcMs(endDate, endHm, tz);
    if (Number.isFinite(endAtMs) && endAtMs > startAtMs) {
      return { startAtMs, endAtMs };
    }
  }

  return {
    startAtMs,
    endAtMs: startAtMs + DEFAULT_MATCH_DURATION_MS,
  };
};

/**
 * Retourne le statut effectif d'un match :
 * - "cancelled" si annulé
 * - "finished" si terminé
 * - "live" si explicitement "live" OU si "upcoming" et actuellement dans sa fenêtre [startAtMs, endAtMs]
 * - "upcoming" sinon
 */
export const getEffectiveMatchStatus = (match, nowMs = Date.now()) => {
  if (!match) return "upcoming";
  const raw = String(match.status || "").trim().toLowerCase();
  if (raw === "cancelled" || raw === "canceled") return "cancelled";
  if (raw === "finished") return "finished";
  if (raw === "live") return "live";

  if (raw === "upcoming") {
    const window = getMatchWindowMs(match);
    if (window && nowMs >= window.startAtMs && nowMs < window.endAtMs) {
      return "live";
    }
    return "upcoming";
  }

  return raw || "finished";
};

/** Hook léger rafraîchissant l'heure courante pour basculer automatiquement un match en "En direct". */
export const useNowMs = (intervalMs = 30_000) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return nowMs;
};
