import { SOCIALS } from "../lib/constants";
import { Link } from "react-router-dom";
import { useLang } from "../lib/i18n";
import { SocialIcon } from "./SocialIcon";

export const Footer = () => {
  const { t } = useLang();
  return (
    <footer className="border-t border-white/10 bg-[#0c0c0c] relative overflow-hidden">
      <div className="pattern-overlay" />
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 flex flex-col sm:flex-row items-center justify-between gap-8">
        <img src="/brand/wordmark-gold.png" alt="Elysium" className="h-6" />
        <div className="flex items-center gap-5" data-testid="footer-socials">
          {SOCIALS.map((s) => (
            <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" data-testid={`footer-social-${s.icon}`}
              className="text-[#f7f7f7]/50 hover:text-[#D8CA82] transition-colors" title={s.name}>
              <SocialIcon name={s.icon} size={20} />
            </a>
          ))}
        </div>
        <p className="text-xs text-[#f7f7f7]/40 tracking-widest uppercase">© 2026 Elysium — {t("footer.rights")}</p>
      </div>
      <div className="relative border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2" data-testid="footer-legal-links">
          <Link to="/mentions-legales" className="text-[11px] uppercase tracking-widest text-[#f7f7f7]/35 hover:text-[#D8CA82] transition-colors" data-testid="footer-link-mentions">{t("legal.mentions")}</Link>
          <Link to="/confidentialite" className="text-[11px] uppercase tracking-widest text-[#f7f7f7]/35 hover:text-[#D8CA82] transition-colors" data-testid="footer-link-privacy">{t("legal.privacy")}</Link>
          <Link to="/cgu" className="text-[11px] uppercase tracking-widest text-[#f7f7f7]/35 hover:text-[#D8CA82] transition-colors" data-testid="footer-link-terms">{t("legal.terms")}</Link>
        </div>
      </div>
    </footer>
  );
};
