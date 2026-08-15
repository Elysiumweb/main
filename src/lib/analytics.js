import { hasConsent, setConsent } from "./consent";

const SESSION_KEY = "elysium_analytics_session";
const ENDPOINT = process.env.REACT_APP_ANALYTICS_ENDPOINT || "";
const ENABLE_DEV_LOG = process.env.REACT_APP_ANALYTICS_DEBUG === "true";

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

export const analyticsConsentGranted = () => hasConsent("analytics");

/** Conservé pour compatibilité : l'état vit désormais dans lib/consent. */
export const setAnalyticsConsent = (granted) => setConsent({ analytics: !!granted });

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
  if (!ENDPOINT || !analyticsConsentGranted()) return;

  const body = JSON.stringify(event);
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    } else {
      fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
    }
  } catch (_) {
    // Analytics must never break the product journey.
  }
};

export const ANALYTICS_EVENTS = {
  RECRUIT_CLICK: "recruitment_click",
  APPLICATION_STARTED: "application_started",
  APPLICATION_SUBMITTED: "application_submitted",
  DISCORD_CLICK: "discord_click",
  LIVE_CLICK: "live_click",
  MATCH_VIEW: "match_view",
};
