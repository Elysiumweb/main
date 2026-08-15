import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cookie, ChevronDown } from "lucide-react";
import { useLang } from "../lib/i18n";
import {
  CONSENT_CATEGORIES,
  getConsent,
  isConsentDecided,
  openConsentManager,
  setConsent,
} from "../lib/consent";

/**
 * Bandeau de consentement par catégories.
 * - « Tout accepter » / « Tout refuser » : décision binaire rapide.
 * - « Gérer mes choix » : cases par catégorie (analytics, social, fonts).
 * Le lien du footer « Gérer mes choix » rouvre ce bandeau à tout moment.
 */
export const CookieConsent = () => {
  const { t } = useLang();
  const [open, setOpen] = useState(() => !isConsentDecided());
  const [choices, setChoices] = useState(() => getConsent());
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onOpen = () => {
      setChoices(getConsent());
      setExpanded(true);
      setOpen(true);
    };
    window.addEventListener("elysium:open-consent-manager", onOpen);
    return () => window.removeEventListener("elysium:open-consent-manager", onOpen);
  }, []);

  if (!open) return null;

  const decideAll = (value) => {
    const next = setConsent({ analytics: value, social: value, fonts: value });
    setChoices(next);
    setOpen(false);
    setExpanded(false);
  };

  const saveChoices = () => {
    setConsent(choices);
    setOpen(false);
    setExpanded(false);
  };

  const toggleCategory = (id) => setChoices((c) => ({ ...c, [id]: !c[id] }));

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[60] bg-[#111111]/95 backdrop-blur-xl border-t border-[#D8CA82]/30 px-4 sm:px-8 py-4 motion-reduce:backdrop-blur-0"
      data-testid="cookie-banner"
      role="region"
      aria-label="Consentement aux cookies"
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Cookie className="text-[#D8CA82] shrink-0" size={20} aria-hidden="true" />
          <p className="text-sm text-[#c8c8c8] flex-1">
            {t("cookie.text")}{" "}
            <Link to="/confidentialite" className="text-[#D8CA82] underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]" data-testid="cookie-privacy-link">{t("legal.privacy")}</Link>
          </p>
          <div className="flex gap-3 shrink-0 flex-wrap">
            <button
              onClick={() => decideAll(false)}
              data-testid="cookie-decline-btn"
              className="border border-white/25 text-[#c8c8c8] text-xs uppercase tracking-widest px-4 py-2 hover:border-[#D8CA82] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
            >
              {t("cookie.decline")}
            </button>
            <button
              onClick={() => setExpanded((e) => !e)}
              data-testid="cookie-manage-btn"
              aria-expanded={expanded}
              className="border border-white/25 text-[#c8c8c8] text-xs uppercase tracking-widest px-4 py-2 hover:border-[#D8CA82] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82] flex items-center gap-1.5"
            >
              {t("cookie.manage")}
              <ChevronDown size={12} className={`transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            <button
              onClick={() => decideAll(true)}
              data-testid="cookie-accept-btn"
              className="bg-[#D8CA82] text-[#111111] text-xs font-bold uppercase tracking-widest px-4 py-2 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#111111]"
            >
              {t("cookie.accept")}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 border-t border-white/10 pt-4 grid gap-3 sm:grid-cols-3" data-testid="cookie-manage-panel">
            {CONSENT_CATEGORIES.map((cat) => (
              <label key={cat.id} className="flex items-start gap-3 border border-white/10 bg-[#0d0d0d] p-3 cursor-pointer" data-testid={`cookie-cat-${cat.id}`}>
                <input
                  type="checkbox"
                  checked={!!choices[cat.id]}
                  onChange={() => toggleCategory(cat.id)}
                  className="mt-0.5 accent-[#D8CA82]"
                  data-testid={`cookie-cat-${cat.id}-input`}
                />
                <span>
                  <span className="block text-xs font-display uppercase tracking-[0.2em] text-[#D8CA82]">{t(cat.labelKey)}</span>
                  <span className="block text-[11px] text-[#c8c8c8] leading-relaxed mt-1">{t(cat.descKey)}</span>
                </span>
              </label>
            ))}
            <div className="sm:col-span-3 flex justify-end">
              <button
                onClick={saveChoices}
                data-testid="cookie-save-btn"
                className="bg-[#D8CA82] text-[#111111] text-xs font-bold uppercase tracking-widest px-5 py-2 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#111111]"
              >
                {t("cookie.save")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Ré-export pour les composants qui veulent rouvrir le gestionnaire.
export { openConsentManager };
