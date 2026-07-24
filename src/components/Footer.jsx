import { SOCIALS } from "../lib/constants";
import { Link } from "react-router-dom";
import { useLang } from "../lib/i18n";
import { SocialIcon } from "./SocialIcon";
import { NewsletterSignup } from "./NewsletterSignup";
import { MessageSquare, Mail } from "lucide-react";

export const Footer = () => {
  const { t } = useLang();
  return (
    <footer className="border-t border-white/10 bg-[#0c0c0c] relative overflow-hidden" data-testid="footer">
      <div className="pattern-overlay" />
      
      {/* Top Main Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 border-b border-white/5 relative z-10">
        
        {/* Col 1: Brand & Discord CTA */}
        <div className="lg:col-span-4 space-y-4">
          <Link to="/" data-testid="footer-brand-logo">
            <img src="/brand/wordmark-gold.png" alt="Elysium" className="h-7 mb-3" />
          </Link>
          <p className="text-xs text-[#f7f7f7]/60 leading-relaxed max-w-sm">
            Elysium Esport — Organisation e-sportive française compétitive sur EVA et Rocket League. Not given. Earned.
          </p>
          
          {/* Discord CTA */}
          <div className="pt-2">
            <a
              href="https://discord.gg/RH3ZZkMJsw"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="footer-discord-cta"
              className="inline-flex items-center gap-3 border border-[#5865F2]/40 bg-[#5865F2]/10 px-4 py-2.5 hover:bg-[#5865F2]/20 hover:border-[#5865F2] transition-colors"
            >
              <SocialIcon name="discord" size={18} className="text-[#5865F2]" />
              <div className="text-left">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#f7f7f7]">Discord Elysium</p>
                <p className="text-[9px] text-[#f7f7f7]/50 uppercase tracking-widest">Rejoindre la communauté</p>
              </div>
            </a>
          </div>
        </div>

        {/* Col 2: Navigation secondaire */}
        <div className="lg:col-span-3 space-y-3">
          <p className="text-xs font-display uppercase tracking-[0.25em] text-[#D8CA82] font-semibold mb-4">
            Navigation
          </p>
          <ul className="space-y-2 text-xs uppercase tracking-wider text-[#f7f7f7]/60">
            <li>
              <Link to="/equipe" className="hover:text-[#D8CA82] transition-colors" data-testid="footer-nav-team">
                {t("nav.team")}
              </Link>
            </li>
            <li>
              <Link to="/resultats" className="hover:text-[#D8CA82] transition-colors" data-testid="footer-nav-results">
                {t("nav.results")}
              </Link>
            </li>
            <li>
              <Link to="/actus" className="hover:text-[#D8CA82] transition-colors" data-testid="footer-nav-news">
                {t("nav.news")}
              </Link>
            </li>
            <li>
              <Link to="/medias" className="hover:text-[#D8CA82] transition-colors" data-testid="footer-nav-media">
                {t("nav.media")}
              </Link>
            </li>
            <li>
              <Link to="/calendrier" className="hover:text-[#D8CA82] transition-colors" data-testid="footer-nav-calendar">
                {t("nav.calendar")}
              </Link>
            </li>
            <li>
              <Link to="/statistiques" className="hover:text-[#D8CA82] transition-colors" data-testid="footer-nav-stats">
                {t("nav.stats")}
              </Link>
            </li>
          </ul>
        </div>

        {/* Col 3: Support, Contact & Legal */}
        <div className="lg:col-span-2 space-y-3">
          <p className="text-xs font-display uppercase tracking-[0.25em] text-[#D8CA82] font-semibold mb-4">
            Contact & Aide
          </p>
          <ul className="space-y-2 text-xs uppercase tracking-wider text-[#f7f7f7]/60">
            <li>
              <Link to="/support" className="hover:text-[#D8CA82] transition-colors" data-testid="footer-nav-support">
                {t("nav.support")}
              </Link>
            </li>
            <li>
              <Link to="/recrutement" className="hover:text-[#D8CA82] transition-colors" data-testid="footer-nav-recruitment">
                {t("nav.recruitment")}
              </Link>
            </li>
            <li>
              <Link to="/partenaires" className="hover:text-[#D8CA82] transition-colors" data-testid="footer-nav-partners">
                {t("nav.partners")}
              </Link>
            </li>
          </ul>

          <div className="pt-3">
            <p className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/40 mb-1">{t("footer.contact")}</p>
            <a
              href="mailto:contact@elysium-esport.fr"
              data-testid="footer-contact-email"
              className="text-xs text-[#D8CA82]/80 hover:text-[#D8CA82] transition-colors flex items-center gap-1.5"
            >
              <Mail size={13} /> contact@elysium-esport.fr
            </a>
          </div>
        </div>

        {/* Col 4: Newsletter & Socials */}
        <div className="lg:col-span-3 space-y-4">
          <p className="text-xs font-display uppercase tracking-[0.25em] text-[#D8CA82] font-semibold">
            {t("newsletter.title")}
          </p>
          <p className="text-xs text-[#f7f7f7]/40 leading-relaxed">{t("newsletter.sub")}</p>
          <NewsletterSignup compact />

          <div className="pt-2">
            <p className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/40 mb-2">Suivez-nous</p>
            <div className="flex items-center gap-4" data-testid="footer-socials">
              {SOCIALS.map((s) => (
                <a
                  key={s.name}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`footer-social-${s.icon}`}
                  className="text-[#f7f7f7]/50 hover:text-[#D8CA82] transition-colors"
                  title={s.name}
                >
                  <SocialIcon name={s.icon} size={18} />
                </a>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Bottom Bar */}
      <div className="relative border-t border-white/5 bg-[#080808]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[#f7f7f7]/40 tracking-widest uppercase">
            © 2026 Elysium — {t("footer.rights")}
          </p>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] uppercase tracking-widest text-[#f7f7f7]/40" data-testid="footer-legal-links">
            <Link to="/mentions-legales" className="hover:text-[#D8CA82] transition-colors" data-testid="footer-link-mentions">
              {t("legal.mentions")}
            </Link>
            <Link to="/confidentialite" className="hover:text-[#D8CA82] transition-colors" data-testid="footer-link-privacy">
              {t("legal.privacy")}
            </Link>
            <Link to="/cgu" className="hover:text-[#D8CA82] transition-colors" data-testid="footer-link-terms">
              {t("legal.terms")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
