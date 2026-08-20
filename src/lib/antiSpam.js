const DEFAULT_WINDOW_MS = 10 * 60 * 1000;

const safeNow = () => Date.now();

export const getSpamSessionId = () => {
  const key = "elysium_spam_session";
  try {
    let id = sessionStorage.getItem(key) || localStorage.getItem(key);
    if (!id) {
      id = `${safeNow().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      sessionStorage.setItem(key, id);
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "session-unavailable";
  }
};

export const getHoneypotProps = (name = "website") => ({
  name,
  autoComplete: "off",
  tabIndex: -1,
  "aria-hidden": "true",
  className: "hidden",
});

export const isHoneypotFilled = (value) => String(value || "").trim().length > 0;

const readBucket = (key) => {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isFinite(n)) : [];
  } catch {
    return [];
  }
};

const writeBucket = (key, values) => {
  try { sessionStorage.setItem(key, JSON.stringify(values)); } catch { /* noop */ }
};

export const checkSessionRateLimit = (bucket, { max = 3, windowMs = DEFAULT_WINDOW_MS } = {}) => {
  const key = `elysium_rate_${bucket}_${getSpamSessionId()}`;
  const now = safeNow();
  const recent = readBucket(key).filter((ts) => now - ts < windowMs);
  if (recent.length >= max) {
    const retryAt = new Date(Math.min(...recent) + windowMs);
    return { allowed: false, retryAt };
  }
  recent.push(now);
  writeBucket(key, recent);
  return { allowed: true, retryAt: null };
};

export const rateLimitMessage = (retryAt, lang = "fr") => {
  const locale = lang === "en" ? "en-US" : "fr-FR";
  const time = retryAt?.toLocaleTimeString?.(locale, { hour: "2-digit", minute: "2-digit" }) || (lang === "en" ? "a few minutes" : "quelques minutes");
  return lang === "en" ? `Too many submissions from this session. Try again around ${time}.` : `Trop d'envois depuis cette session. Réessayez vers ${time}.`;
};
