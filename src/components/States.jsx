import { AlertTriangle, RefreshCw } from "lucide-react";
import { useLang } from "../lib/i18n";

export const LoadingState = ({ testId = "loading-state", label }) => {
  const { t } = useLang();
  return (
    <div
      className="flex items-center justify-center gap-3 py-20 text-muted-foreground"
      data-testid={testId}
      role="status"
      aria-live="polite"
    >
      <span className="w-4 h-4 border-2 border-primary/60 border-t-transparent rounded-full animate-spin motion-reduce:animate-none" />
      <span>{label || t("common.loading")}</span>
    </div>
  );
};

export const ErrorState = ({ onRetry, testId = "error-state" }) => {
  const { t } = useLang();
  return (
    <div
      className="clip-blade-sm border border-red-300/40 bg-card/80 py-16 flex flex-col items-center gap-4"
      data-testid={testId}
      role="alert"
    >
      <AlertTriangle className="text-red-300" size={32} aria-hidden="true" />
      <p className="text-foreground">{t("states.error")}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          data-testid={`${testId}-retry-btn`}
          className="clip-blade-sm border border-primary/50 font-label font-semibold text-primary text-xs uppercase tracking-widest px-5 py-2.5 flex items-center gap-2 hover:bg-primary/10 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <RefreshCw size={13} aria-hidden="true" /> {t("states.retry")}
        </button>
      )}
    </div>
  );
};

export const EmptyState = ({ icon: Icon, text, testId = "empty-state" }) => (
  <div
    className="panel clip-blade-sm py-20 flex flex-col items-center gap-4"
    data-testid={testId}
    role="status"
    aria-live="polite"
  >
    {Icon && <Icon className="text-primary/50" size={36} aria-hidden="true" />}
    <p className="text-muted-foreground tracking-wide text-center px-6">{text}</p>
  </div>
);
