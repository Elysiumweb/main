/**
 * Domaine « boîte de réception admin » (support + candidatures).
 * ----------------------------------------------------------------------------
 * Logique pure, testable sans Firestore : filtres, ancienneté, SLA et compteurs.
 *
 * SLA : l'objectif de première réponse dépend de la priorité du ticket support.
 * Pour les candidatures, on applique un délai unique raisonnable (72 h) qui
 * correspond aux délais annoncés publiquement sur /recrutement.
 */

import { RECRUIT_STATUSES } from "./recruitment";

export const SUPPORT_STATUSES = ["open", "in_progress", "resolved"];
export const SUPPORT_CATEGORIES = ["account", "technical", "team", "other"];
export const SUPPORT_PRIORITIES = ["low", "normal", "high"];

export const SLA_HOURS = {
  support: { high: 4, normal: 24, low: 72 },
  recruit: { default: 72 },
};

/** Statuts considérés comme « terminés » (plus de SLA à surveiller). */
export const CLOSED_STATUSES = ["resolved", "closed", "accepted", "rejected"];

export const statusOptionsFor = (source) =>
  source === "support" ? SUPPORT_STATUSES : RECRUIT_STATUSES;

export const slaHoursFor = (thread) => {
  if (!thread) return SLA_HOURS.recruit.default;
  if (thread.source === "support") {
    return SLA_HOURS.support[thread.priority] || SLA_HOURS.support.normal;
  }
  return SLA_HOURS.recruit.default;
};

/** Millisecondes depuis epoch, tolérant Timestamp Firestore / ISO / nombre. */
export const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value.toMillis === "function") {
    try { return value.toMillis(); } catch { return 0; }
  }
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
};

export const threadAgeHours = (thread, now = Date.now()) => {
  const created = toMillis(thread?.createdAt);
  if (!created) return 0;
  return Math.max(0, (now - created) / 3_600_000);
};

export const isThreadClosed = (thread) => CLOSED_STATUSES.includes(thread?.status);

/**
 * `ok` tant que le délai est respecté, `soon` dans le dernier quart du délai,
 * `overdue` au-delà. Un fil terminé est toujours `ok`.
 */
export const slaState = (thread, now = Date.now()) => {
  if (!thread || isThreadClosed(thread)) return "ok";
  const limit = slaHoursFor(thread);
  const age = threadAgeHours(thread, now);
  if (age >= limit) return "overdue";
  if (age >= limit * 0.75) return "soon";
  return "ok";
};

export const slaRemainingHours = (thread, now = Date.now()) =>
  Math.round((slaHoursFor(thread) - threadAgeHours(thread, now)) * 10) / 10;

/** Un fil est « à traiter » s'il est ouvert et sans responsable. */
export const needsAttention = (thread, now = Date.now()) =>
  !isThreadClosed(thread) && (!thread.assignedTo || slaState(thread, now) === "overdue");

const fold = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const threadSearchText = (thread) =>
  thread?.source === "support"
    ? [thread.subject, thread.name, thread.email, thread.meta, thread.category, thread.priority]
    : [thread.pseudo, thread.name, thread.email, thread.position, thread.game, thread.country, thread.ageRange, thread.meta];

export const EMPTY_FILTERS = {
  source: "all",
  status: "all",
  category: "all",
  priority: "all",
  game: "all",
  assignee: "all",
  query: "",
};

/**
 * Filtre les fils fusionnés. Chaque fil doit porter `source` ("support" |
 * "recruit") et, le cas échéant, `assignedTo`.
 */
export const filterThreads = (threads = [], filters = EMPTY_FILTERS, now = Date.now()) => {
  const f = { ...EMPTY_FILTERS, ...filters };
  const q = fold(f.query.trim());
  return threads.filter((thread) => {
    if (f.source !== "all" && thread.source !== f.source) return false;
    if (f.status !== "all" && (thread.status || "open") !== f.status) return false;
    if (f.category !== "all" && thread.category !== f.category) return false;
    if (f.priority !== "all" && thread.priority !== f.priority) return false;
    if (f.game !== "all" && thread.game !== f.game) return false;
    if (f.assignee === "unassigned" && thread.assignedTo) return false;
    if (f.assignee === "mine" && !thread.assignedTo) return false;
    if (f.assignee === "overdue" && slaState(thread, now) !== "overdue") return false;
    if (q) {
      const haystack = threadSearchText(thread).map(fold).join(" ");
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
};

/** Tri par défaut : retard SLA d'abord, puis ancienneté décroissante. */
export const sortThreads = (threads = [], now = Date.now()) =>
  [...threads].sort((a, b) => {
    const rank = { overdue: 0, soon: 1, ok: 2 };
    const diff = rank[slaState(a, now)] - rank[slaState(b, now)];
    if (diff !== 0) return diff;
    return toMillis(a.createdAt) - toMillis(b.createdAt);
  });

/** Compteurs affichés dans l'en-tête et dans la navbar. */
export const inboxCounts = (threads = [], now = Date.now()) => ({
  total: threads.length,
  open: threads.filter((t) => !isThreadClosed(t)).length,
  unassigned: threads.filter((t) => !isThreadClosed(t) && !t.assignedTo).length,
  overdue: threads.filter((t) => !isThreadClosed(t) && slaState(t, now) === "overdue").length,
  support: threads.filter((t) => t.source === "support" && !isThreadClosed(t)).length,
  recruit: threads.filter((t) => t.source === "recruit" && !isThreadClosed(t)).length,
});

/** Ancienneté lisible : « 3 h », « 2 j », « à l'instant ». */
export const formatAge = (thread, lang = "fr", now = Date.now()) => {
  const hours = threadAgeHours(thread, now);
  if (hours < 1) return lang === "en" ? "just now" : "à l'instant";
  if (hours < 48) {
    const rounded = Math.round(hours);
    return lang === "en" ? `${rounded} h` : `${rounded} h`;
  }
  const days = Math.floor(hours / 24);
  return lang === "en" ? `${days} d` : `${days} j`;
};
