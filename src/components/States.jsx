import { AlertTriangle, RefreshCw } from "lucide-react";
import { useLang } from "../lib/i18n";

export const LoadingState = ({ testId = "loading-state" }) => {
  const { t } = useLang();
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-[#f7f7f7]/40" data-testid={testId}>
      <span className="w-4 h-4 border-2 border-[#D8CA82]/60 border-t-transparent rounded-full animate-spin" />
      {t("common.loading")}
    </div>
  );
};

export const ErrorState = ({ onRetry, testId = "error-state" }) => {
  const { t } = useLang();
  return (
    <div className="border border-red-400/30 bg-[#1A1A1A] py-16 flex flex-col items-center gap-4" data-testid={testId}>
      <AlertTriangle className="text-red-400/70" size={32} />
      <p className="text-[#f7f7f7]/60">{t("states.error")}</p>
      {onRetry && (
        <button onClick={onRetry} data-testid={`${testId}-retry-btn`}
          className="border border-[#D8CA82]/50 text-[#D8CA82] text-xs uppercase tracking-widest px-5 py-2.5 flex items-center gap-2 hover:bg-[#D8CA82]/10 transition-colors">
          <RefreshCw size={13} /> {t("states.retry")}
        </button>
      )}
    </div>
  );
};

export const EmptyState = ({ icon: Icon, text, testId = "empty-state" }) => (
  <div className="border border-white/10 bg-[#1A1A1A] py-20 flex flex-col items-center gap-4" data-testid={testId}>
    {Icon && <Icon className="text-[#D8CA82]/40" size={36} />}
    <p className="text-[#f7f7f7]/50 tracking-wide text-center px-6">{text}</p>
  </div>
);
