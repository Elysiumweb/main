import { AlertTriangle, RefreshCw } from "lucide-react";
import { useLang } from "../lib/i18n";

export const LoadingState = ({ testId = "loading-state", label }) => {
  const { t } = useLang();
  return (
    <div
      className="flex items-center justify-center gap-3 py-20 text-[#c8c8c8]"
      data-testid={testId}
      role="status"
      aria-live="polite"
    >
      <span className="w-4 h-4 border-2 border-[#D8CA82]/60 border-t-transparent rounded-full animate-spin motion-reduce:animate-none" />
      <span>{label || t("common.loading")}</span>
    </div>
  );
};

export const ErrorState = ({ onRetry, testId = "error-state" }) => {
  const { t } = useLang();
  return (
    <div
      className="border border-red-300/40 bg-[#1A1A1A] py-16 flex flex-col items-center gap-4"
      data-testid={testId}
      role="alert"
    >
      <AlertTriangle className="text-red-300" size={32} aria-hidden="true" />
      <p className="text-[#f7f7f7]">{t("states.error")}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          data-testid={`${testId}-retry-btn`}
          className="border border-[#D8CA82]/50 text-[#D8CA82] text-xs uppercase tracking-widest px-5 py-2.5 flex items-center gap-2 hover:bg-[#D8CA82]/10 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
        >
          <RefreshCw size={13} aria-hidden="true" /> {t("states.retry")}
        </button>
      )}
    </div>
  );
};

export const EmptyState = ({ icon: Icon, text, testId = "empty-state" }) => (
  <div
    className="border border-white/10 bg-[#1A1A1A] py-20 flex flex-col items-center gap-4"
    data-testid={testId}
    role="status"
    aria-live="polite"
  >
    {Icon && <Icon className="text-[#D8CA82]/50" size={36} aria-hidden="true" />}
    <p className="text-[#c8c8c8] tracking-wide text-center px-6">{text}</p>
  </div>
);
