import { useState } from "react";
import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";
import { useLang } from "../lib/i18n";

export const CookieConsent = () => {
  const { t } = useLang();
  const [choice, setChoice] = useState(() => localStorage.getItem("elysium_cookie_consent"));
  if (choice) return null;
  const decide = (v) => { localStorage.setItem("elysium_cookie_consent", v); setChoice(v); };
  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[60] bg-[#111111]/95 backdrop-blur-xl border-t border-[#D8CA82]/30 px-4 sm:px-8 py-4 motion-reduce:backdrop-blur-0"
      data-testid="cookie-banner"
      role="region"
      aria-label="Consentement aux cookies"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Cookie className="text-[#D8CA82] shrink-0" size={20} aria-hidden="true" />
        <p className="text-sm text-[#c8c8c8] flex-1">
          {t("cookie.text")}{" "}
          <Link to="/confidentialite" className="text-[#D8CA82] underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]" data-testid="cookie-privacy-link">{t("legal.privacy")}</Link>
        </p>
        <div className="flex gap-3 shrink-0">
          <button
            onClick={() => decide("declined")}
            data-testid="cookie-decline-btn"
            className="border border-white/25 text-[#c8c8c8] text-xs uppercase tracking-widest px-4 py-2 hover:border-[#D8CA82] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
          >
            {t("cookie.decline")}
          </button>
          <button
            onClick={() => decide("accepted")}
            data-testid="cookie-accept-btn"
            className="bg-[#D8CA82] text-[#111111] text-xs font-bold uppercase tracking-widest px-4 py-2 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#111111]"
          >
            {t("cookie.accept")}
          </button>
        </div>
      </div>
    </div>
  );
};
