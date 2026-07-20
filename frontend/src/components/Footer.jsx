import { SOCIALS } from "../lib/constants";
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
    </footer>
  );
};
