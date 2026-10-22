const CONSENT_KEY = "elysium_analytics_consent";
const SESSION_KEY = "elysium_analytics_session";
const ENDPOINT = process.env.REACT_APP_ANALYTICS_ENDPOINT || "";
const ENABLE_DEV_LOG = process.env.REACT_APP_ANALYTICS_DEBUG === "true";
// La collecte Firestore est active par défaut (le dashboard admin lit cette
// collection). Elle peut être coupée sans redéploiement de code via
// REACT_APP_ANALYTICS_FIRESTORE=false, notamment en développement.
const FIRESTORE_SINK = process.env.REACT_APP_ANALYTICS_FIRESTORE !== "false";

const safeRandomId = () => {
  try {
    return crypto.randomUUID();
  } catch (_) {
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
  } catch (_) {
    return "session-unavailable";
  }
};

export const analyticsConsentGranted = () => {
  try {
    return localStorage.getItem(CONSENT_KEY) === "granted";
  } catch (_) {
    return false;
  }
};

export const setAnalyticsConsent = (granted) => {
  try {
    localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
  } catch (_) {}
  try {
    window.dispatchEvent(new CustomEvent("elysium:analytics-consent", { detail: { granted } }));
  } catch (_) {}
};

const scrub = (value, depth = 0) => {
  if (depth > 3) return undefined;
  if (value == null) return value;
  if (typeof value === "string") return value.slice(0, 180);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => scrub(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/email|mail|phone|discord|token|uid|name|pseudo|message|subject/i.test(key))
        .map(([key, item]) => [key, scrub(item, depth + 1)]),
    );
  }
  return undefined;
};

const referrerOrigin = () => {
  try {
    return document.referrer ? new URL(document.referrer).origin : "";
  } catch (_) {
    return "";
  }
};

// Déduplication : une même page vue deux fois en < 1,2 s (StrictMode, double
// montage) ne doit pas fausser les statistiques.
const lastSent = new Map();
const shouldSkip = (key) => {
  const now = Date.now();
  const previous = lastSent.get(key) || 0;
  lastSent.set(key, now);
  return now - previous < 1200;
};

const sendToEndpoint = (body) => {
  if (!ENDPOINT) return;
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    } else {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    }
  } catch (_) {
    // Analytics must never break the product journey.
  }
};

// Firebase est chargé à la demande : sans consentement (tests, visiteurs qui
// refusent), le SDK n'est jamais téléchargé par ce module.
let firestoreSinkPromise = null;
const getFirestoreSink = () => {
  if (!firestoreSinkPromise) {
    firestoreSinkPromise = Promise.all([import("firebase/firestore"), import("./firebase")]);
  }
  return firestoreSinkPromise;
};

const sendToFirestore = (event) => {
  if (!FIRESTORE_SINK) return;
  getFirestoreSink()
    .then(([fs, fb]) => {
      if (!fb.db) return;
      return fs.addDoc(fs.collection(fb.db, "analytics_events"), {
        ...event,
        createdAt: fs.serverTimestamp(),
      });
    })
    .catch(() => {
      // Silencieux : la collecte est un bonus, jamais un prérequis.
    });
};

/**
 * Émet un événement analytics.
 * - Toujours : événement local `elysium:analytics` (utilisé par les tests et
 *   les intégrations internes).
 * - Avec consentement : POST vers REACT_APP_ANALYTICS_ENDPOINT (si configuré)
 *   et écriture dans `analytics_events` (dashboard admin).
 */
export const trackEvent = (name, properties = {}) => {
  if (!name) return;
  const event = {
    name,
    properties: scrub(properties),
    path: window.location.pathname,
    referrer: referrerOrigin(),
    sessionId: getSessionId(),
    timestamp: new Date().toISOString(),
  };

  window.dispatchEvent(new CustomEvent("elysium:analytics", { detail: event }));

  if (ENABLE_DEV_LOG) console.info("[analytics]", event);
  if (!analyticsConsentGranted()) return;
  if (shouldSkip(`${name}:${event.path}`)) return;

  const body = JSON.stringify(event);
  sendToEndpoint(body);
  sendToFirestore(event);
};

/** Vue de page (appelée par `AnalyticsTracker` à chaque changement de route). */
export const trackPageView = (pathname, title = "") => {
  trackEvent(ANALYTICS_EVENTS.PAGE_VIEW, {
    page: pathname || window.location.pathname,
    title,
  });
};

export const ANALYTICS_EVENTS = {
  // Parcours de recrutement
  RECRUIT_CLICK: "recruitment_click",
  APPLICATION_STARTED: "application_started",
  APPLICATION_SUBMITTED: "application_submitted",
  TRYOUT_BOOKED: "tryout_booked",
  // Support
  SUPPORT_GUEST_TICKET: "support_guest_ticket",
  HELP_ARTICLE_OPEN: "help_article_open",
  // Navigation & contenus
  PAGE_VIEW: "page_view",
  MATCH_VIEW: "match_view",
  ARTICLE_VIEW: "article_view",
  GLOBAL_SEARCH: "global_search",
  SHARE: "share",
  // Communauté
  DISCORD_CLICK: "discord_click",
  LIVE_CLICK: "live_click",
  // Monétisation
  MERCH_CLICK: "merch_click",
  SHOP_CLICK: "shop_click",
  DONATE_CLICK: "donate_click",
  PARTNER_CLICK: "partner_click",
  NEWSLETTER_SIGNUP: "newsletter_signup",
  // Administration / annonces
  ANNOUNCEMENT_CLICK: "announcement_click",
  REDIRECT_HIT: "redirect_hit",
};

/** Funnel d'engagement suivi par le dashboard. */
export const FUNNEL_STEPS = [
  { event: ANALYTICS_EVENTS.RECRUIT_CLICK, label: "Clic recrutement" },
  { event: ANALYTICS_EVENTS.APPLICATION_STARTED, label: "Candidature commencée" },
  { event: ANALYTICS_EVENTS.APPLICATION_SUBMITTED, label: "Candidature envoyée" },
  { event: ANALYTICS_EVENTS.TRYOUT_BOOKED, label: "Tryout réservé" },
];

export const analyticsConfigured = () =>
  Boolean(ENDPOINT) || FIRESTORE_SINK;
