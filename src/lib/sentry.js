import * as Sentry from "@sentry/react";

const dsn = process.env.REACT_APP_SENTRY_DSN;

export const initSentry = () => {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.REACT_APP_ENV || process.env.NODE_ENV,
    release: process.env.REACT_APP_VERSION,
    tracesSampleRate: Number(process.env.REACT_APP_SENTRY_TRACES_SAMPLE_RATE || 0.05),
    replaysSessionSampleRate: Number(process.env.REACT_APP_SENTRY_REPLAY_SAMPLE_RATE || 0),
    replaysOnErrorSampleRate: Number(process.env.REACT_APP_SENTRY_REPLAY_ERROR_SAMPLE_RATE || 0.1),
    integrations: (integrations) => integrations,
  });
};

export const captureException = (error, context) => {
  if (!dsn) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
};
