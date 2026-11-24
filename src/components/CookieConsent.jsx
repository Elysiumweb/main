import { useState } from "react";
import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";
import { useLang } from "../lib/i18n";
import { setAnalyticsConsent } from "../lib/analytics";

export const CookieConsent = () => {
  const { t } = useLang();
  const [choice, setChoice] = useState(() => {
    const saved = localStorage.getItem("elysium_cookie_consent");
    if (saved) setAnalyticsConsent(saved === "accepted");
    return saved;
  });
  if (choice) return null;
  const decide = (v) => {
    localStorage.setItem("elysium_cookie_consent", v);
    setAnalyticsConsent(v === "accepted");
    setChoice(v);
  };
  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[60] bg-background/95 backdrop-blur-xl border-t border-primary/30 px-4 sm:px-8 py-4 motion-reduce:backdrop-blur-0"
      data-testid="cookie-banner"
      role="region"
      aria-label="Consentement aux cookies"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Cookie className="text-primary shrink-0" size={20} aria-hidden="true" />
        <p className="text-sm text-muted-foreground flex-1">
          {t("cookie.text")}{" "}
          <Link to="/confidentialite" className="text-primary underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" data-testid="cookie-privacy-link">{t("legal.privacy")}</Link>
        </p>
        <div className="flex gap-3 shrink-0">
          <button
            onClick={() => decide("declined")}
            data-testid="cookie-decline-btn"
            className="clip-blade-sm border border-border/40 font-label text-muted-foreground text-xs uppercase tracking-widest px-4 py-2 hover:border-primary hover:text-primary transition-colors motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            {t("cookie.decline")}
          </button>
          <button
            onClick={() => decide("accepted")}
            data-testid="cookie-accept-btn"
            className="clip-blade-sm bg-gold text-primary-foreground font-display text-xs font-bold uppercase tracking-widest px-4 py-2 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-foreground"
          >
            {t("cookie.accept")}
          </button>
        </div>
      </div>
    </div>
  );
};
