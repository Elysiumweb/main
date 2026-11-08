import { ANALYTICS_EVENTS } from "./analyticsEvents";

// Ré-export pour ne pas casser les imports historiques (`lib/analytics`).
export { ANALYTICS_EVENTS };

const CONSENT_KEY = "elysium_analytics_consent";
const SESSION_KEY = "elysium_analytics_session";
const ENDPOINT = process.env.REACT_APP_ANALYTICS_ENDPOINT || "";
const ENABLE_DEV_LOG = process.env.REACT_APP_ANALYTICS_DEBUG === "true";
/** Événements Firestore max par session : protège le quota gratuit. */
const MAX_EVENTS_PER_SESSION = 250;

const safeRandomId = () => {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  }
};

const getSessionId = () => {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = safeRandomId();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch (e) {
    return "session-unavailable";
  }
};

export const analyticsConsentGranted = () => {
  try {
    return localStorage.getItem(CONSENT_KEY) === "granted";
  } catch (e) {
    return false;
  }
};

export const setAnalyticsConsent = (granted) => {
  try {
    localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
  } catch (e) { /* stockage indisponible */ }
};

const scrub = (value) => {
  if (value == null) return value;
  if (typeof value === "string") return value.slice(0, 180);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(scrub);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/email|mail|phone|discord|token|uid|name|pseudo/i.test(key))
        .map(([key, item]) => [key, scrub(item)]),
    );
  }
  return undefined;
};

/* ---- Persistance Firestore ----------------------------------------------
   `analytics_events` est la destination par défaut, consultable dans l'onglet
   admin Analytics. Le beacon HTTP (REACT_APP_ANALYTICS_ENDPOINT) reste
   optionnel : il peut alimenter Plausible/BigQuery en parallèle, sans que le
   front dépende d'un service tiers. Écriture uniquement après consentement,
   plafonnée par session, et jamais bloquante pour le parcours utilisateur. */
let sessionEventCount = 0;
const lastPersistKey = new Map();
/* Destination branchée au démarrage de l'app (Firestore) — voir
   `analyticsFirestore.js`. Ce module reste sans dépendance à Firebase pour
   pouvoir être importé par n'importe quel composant (et par les tests). */
let sink = null;

export const setAnalyticsSink = (fn) => { sink = typeof fn === "function" ? fn : null; };

const persistEvent = (event) => {
  if (!analyticsConsentGranted()) return;
  if (sessionEventCount >= MAX_EVENTS_PER_SESSION) return;
  const key = `${event.name}:${event.path}`;
  const now = Date.now();
  const last = lastPersistKey.get(key) || 0;
  // Déduplication des vues de page (StrictMode, double montage).
  if (event.name === ANALYTICS_EVENTS.PAGE_VIEW && now - last < 1500) return;
  lastPersistKey.set(key, now);
  sessionEventCount += 1;
  if (!sink) return;
  try {
    const result = sink(event);
    if (result && typeof result.catch === "function") result.catch(() => { /* quota / règles */ });
  } catch (e) { /* l'analytics ne doit jamais casser l'app */ }
};

export const trackEvent = (name, properties = {}) => {
  const event = {
    name,
    properties: scrub(properties),
    path: window.location.pathname,
    referrer: document.referrer ? new URL(document.referrer).origin : "",
    sessionId: getSessionId(),
    timestamp: new Date().toISOString(),
  };

  window.dispatchEvent(new CustomEvent("elysium:analytics", { detail: event }));

  if (ENABLE_DEV_LOG) console.info("[analytics]", event);
  persistEvent(event);
  if (!ENDPOINT || !analyticsConsentGranted()) return;

  const body = JSON.stringify(event);
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    } else {
      fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
    }
  } catch (e) {
    // Analytics must never break the product journey.
  }
};

/** Vue de page : émise à chaque changement de route (hors /admin, privé). */
export const trackPageView = (pathname, { search = "", title = "" } = {}) => {
  if (!pathname) return;
  if (pathname.startsWith("/admin") || pathname.startsWith("/espace-joueur")) return;
  trackEvent(ANALYTICS_EVENTS.PAGE_VIEW, {
    title,
    search: search ? search.slice(0, 120) : "",
    referrerPath: typeof document !== "undefined" ? document.referrer : "",
  });
};
