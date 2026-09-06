const dsn = process.env.REACT_APP_SENTRY_DSN;
let sentryPromise = null;

const loadSentry = () => {
  if (!dsn) return Promise.resolve(null);
  if (!sentryPromise) sentryPromise = import("@sentry/react");
  return sentryPromise;
};

const scheduleIdle = (callback) => {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout: 3000 });
  } else {
    setTimeout(callback, 0);
  }
};

export const initSentry = () => {
  if (!dsn) return;
  scheduleIdle(() => {
    loadSentry().then((Sentry) => {
      if (!Sentry) return;
      Sentry.init({
        dsn,
        environment: process.env.REACT_APP_ENV || process.env.NODE_ENV,
        release: process.env.REACT_APP_VERSION,
        tracesSampleRate: Number(process.env.REACT_APP_SENTRY_TRACES_SAMPLE_RATE || 0.05),
        replaysSessionSampleRate: Number(process.env.REACT_APP_SENTRY_REPLAY_SAMPLE_RATE || 0),
        replaysOnErrorSampleRate: Number(process.env.REACT_APP_SENTRY_REPLAY_ERROR_SAMPLE_RATE || 0.1),
        integrations: (integrations) => integrations,
      });
    }).catch((err) => console.warn("[sentry] chargement différé impossible", err));
  });
};

export const captureException = (error, context) => {
  if (!dsn) return;
  loadSentry()
    .then((Sentry) => Sentry?.captureException(error, context ? { extra: context } : undefined))
    .catch((err) => console.warn("[sentry] capture impossible", err));
};
