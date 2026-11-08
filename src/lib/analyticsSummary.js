/**
 * Agrégation des événements analytics côté admin.
 * ----------------------------------------------------------------------------
 * Les événements sont stockés dans `analytics_events` (un document par event)
 * uniquement si le visiteur a consenti au tracking. Ce module ne fait aucun
 * accès réseau : il transforme une liste d'événements en séries prêtes à
 * afficher (KPI, courbe quotidienne, pages, entonnoir).
 *
 * L'agrégation est volontairement côté client et bornée (limit 5000 docs) pour
 * rester utilisable sans infrastructure BigQuery. Au-delà, brancher un export
 * quotidien (Cloud Function) vers BigQuery/Plausible reste possible : le
 * contrat d'événement ne change pas.
 */

import { ANALYTICS_EVENTS } from "./analyticsEvents";

const DAY_MS = 86_400_000;

export const eventMillis = (event) => {
  if (!event) return 0;
  if (typeof event.timestamp === "string") {
    const parsed = Date.parse(event.timestamp);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (typeof event.createdAt?.seconds === "number") return event.createdAt.seconds * 1000;
  if (typeof event.createdAt?.toMillis === "function") {
    try { return event.createdAt.toMillis(); } catch { /* ignore */ }
  }
  return 0;
};

const dayKey = (ms, timezoneOffset = 0) =>
  new Date(ms - timezoneOffset).toISOString().slice(0, 10);

/**
 * @param {Array} events documents `analytics_events`
 * @param {{days?: number, now?: number}} options
 */
export const summarizeAnalytics = (events = [], { days = 30, now = Date.now() } = {}) => {
  const since = now - days * DAY_MS;
  const scoped = events.filter((e) => {
    const ms = eventMillis(e);
    return ms >= since && ms <= now + DAY_MS;
  });

  const sessions = new Set(scoped.map((e) => e.sessionId).filter(Boolean));
  const counts = {};
  scoped.forEach((e) => {
    if (!e.name) return;
    counts[e.name] = (counts[e.name] || 0) + 1;
  });

  const pages = {};
  const dailyMap = {};
  // On initialise chaque jour de la période à 0 pour une courbe continue.
  for (let i = days - 1; i >= 0; i -= 1) {
    dailyMap[dayKey(now - i * DAY_MS)] = { date: dayKey(now - i * DAY_MS), views: 0, events: 0 };
  }
  scoped.forEach((e) => {
    const key = dayKey(eventMillis(e));
    if (dailyMap[key]) {
      dailyMap[key].events += 1;
      if (e.name === ANALYTICS_EVENTS.PAGE_VIEW) dailyMap[key].views += 1;
    }
    if (e.name === ANALYTICS_EVENTS.PAGE_VIEW) {
      const path = e.path || "/";
      pages[path] = (pages[path] || 0) + 1;
    }
  });

  const started = counts[ANALYTICS_EVENTS.APPLICATION_STARTED] || 0;
  const submitted = counts[ANALYTICS_EVENTS.APPLICATION_SUBMITTED] || 0;
  const views = counts[ANALYTICS_EVENTS.PAGE_VIEW] || 0;

  return {
    days,
    since,
    totalEvents: scoped.length,
    views,
    sessions: sessions.size,
    pages: Object.entries(pages)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count),
    daily: Object.values(dailyMap),
    counts,
    topEvents: Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    funnel: {
      started,
      submitted,
      // Taux de complétion du formulaire de candidature.
      rate: started > 0 ? Math.round((submitted / started) * 1000) / 10 : 0,
    },
    kpis: {
      recruitClicks: counts[ANALYTICS_EVENTS.RECRUIT_CLICK] || 0,
      partnerClicks: counts[ANALYTICS_EVENTS.PARTNER_CLICK] || 0,
      donateClicks: counts[ANALYTICS_EVENTS.DONATE_CLICK] || 0,
      newsletterSignups: counts[ANALYTICS_EVENTS.NEWSLETTER_SIGNUP] || 0,
      searches: counts[ANALYTICS_EVENTS.GLOBAL_SEARCH] || 0,
      shares: counts[ANALYTICS_EVENTS.SHARE] || 0,
    },
  };
};
