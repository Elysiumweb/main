/**
 * Domaine « recrutement » partagé par la page publique, l'espace joueur et le
 * panel admin.
 * ----------------------------------------------------------------------------
 * Les statuts de candidature (`pending` / `reviewing` / …) existent depuis le
 * début côté threads, mais le candidat ne voyait qu'un badge. On les projette
 * ici dans un parcours explicite en 4 temps — Reçu → Test → Entretien →
 * Décision — accompagné des délais moyens annoncés au public.
 *
 * Les délais vivent dans `settings/recruitment` (Firestore) pour être ajustables
 * sans redéploiement : `useRecruitmentSettings()` fusionne le document avec les
 * valeurs par défaut ci-dessous et retombe dessus en cas d'échec de lecture.
 */

import { GAMES } from "./constants";

/** Libellé stocké quand la candidature n'est pas liée à un poste publié. */
export const SPONTANEOUS_POSITION = "Candidature spontanée";

/** Statuts gérés côté dossier de candidature ( ThreadsPanel + Cloud Function). */
export const RECRUIT_STATUSES = [
  "pending",
  "reviewing",
  "interviewing",
  "accepted",
  "rejected",
  "pending_parental_consent",
];

/**
 * Étapes du parcours, dans l'ordre. `statuses` liste les statuts de dossier qui
 * rattachent la candidature à l'étape ; une étape franchie reste affichée comme
 * « done » pour les étapes précédentes.
 */
export const APPLICATION_STEPS = [
  { id: "received", labelKey: "recruit.steps.received", hintKey: "recruit.steps.received.hint", statuses: ["pending", "pending_parental_consent"], delayKey: "received" },
  { id: "test", labelKey: "recruit.steps.test", hintKey: "recruit.steps.test.hint", statuses: ["reviewing"], delayKey: "test" },
  { id: "interview", labelKey: "recruit.steps.interview", hintKey: "recruit.steps.interview.hint", statuses: ["interviewing"], delayKey: "interview" },
  { id: "decision", labelKey: "recruit.steps.decision", hintKey: "recruit.steps.decision.hint", statuses: ["accepted", "rejected"], delayKey: "decision" },
];

/** Délais moyens annoncés au public, en jours (surchargeables via Firestore). */
export const DEFAULT_STEP_DELAYS = { received: 2, test: 5, interview: 4, decision: 2 };

/** Ne conserve que les délais numériques positifs et les borne à 60 jours. */
export const normalizeStepDelays = (raw) => {
  const out = { ...DEFAULT_STEP_DELAYS };
  if (!raw || typeof raw !== "object") return out;
  Object.keys(DEFAULT_STEP_DELAYS).forEach((k) => {
    const n = Number(raw[k]);
    if (Number.isFinite(n) && n >= 0 && n <= 60) out[k] = Math.round(n);
  });
  return out;
};

/** Index de l'étape correspondant à un statut de dossier (0 par défaut). */
export const stepIndexForStatus = (status) => {
  const idx = APPLICATION_STEPS.findIndex((s) => s.statuses.includes(status));
  return idx < 0 ? 0 : idx;
};

/** Une candidature acceptée ou refusée termine le parcours. */
export const isTerminalStatus = (status) => status === "accepted" || status === "rejected";

/** Timestamp Firestore / ISO / Date → Date, ou null. */
export const toDate = (ts) => {
  if (!ts) return null;
  if (typeof ts === "string") { const d = new Date(ts); return isNaN(d.getTime()) ? null : d; }
  if (typeof ts.toDate === "function") return ts.toDate();
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
  return null;
};

/** Nombre de jours pleins écoulés depuis une date (0 aujourd'hui). */
export const daysSince = (ts, now = Date.now()) => {
  const d = toDate(ts);
  if (!d) return null;
  return Math.max(0, Math.floor((now - d.getTime()) / 86400000));
};

/* ---- Tryouts ---------------------------------------------------------- */

/** Un créneau est réservable s'il est ouvert, dans le futur et non complet. */
export const isTryoutBookable = (slot, now = Date.now()) => {
  if (!slot || slot.open === false || slot.status === "closed") return false;
  const start = toDate(slot.start);
  if (!start || start.getTime() <= now) return false;
  const capacity = Number(slot.capacity) || 0;
  const booked = Number(slot.bookedCount) || 0;
  return capacity <= 0 || booked < capacity;
};

export const tryoutRemaining = (slot) => {
  const capacity = Number(slot?.capacity) || 0;
  if (capacity <= 0) return null; // capacité illimitée
  return Math.max(0, capacity - (Number(slot?.bookedCount) || 0));
};

/** Formate un créneau pour l'affichage (« sam. 18 oct. · 20:00 »). */
export const fmtTryoutStart = (slot, lang = "fr") => {
  const d = toDate(slot?.start);
  if (!d) return "";
  return d.toLocaleString(lang === "en" ? "en-GB" : "fr-FR", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
};

/** Game valide pour une candidature spontanée (défaut : EVA). */
export const sanitizeGame = (game) => (GAMES.includes(game) ? game : "");