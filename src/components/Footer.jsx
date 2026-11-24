import { SOCIALS } from "../lib/constants";
import { Link } from "react-router-dom";
import { useLang } from "../lib/i18n";
import { SocialIcon } from "./SocialIcon";
import { NewsletterSignup } from "./NewsletterSignup";
import { Mail, Heart } from "lucide-react";

const linkCls =
  "text-muted-foreground hover:text-primary transition-colors duration-200 focus:outline-none";

const headingCls = "eyebrow mb-4";

export const Footer = () => {
  const { t } = useLang();
  return (
    <footer
      className="relative z-10 mt-24 border-t border-border/30 bg-background/80 backdrop-blur-xl overflow-hidden"
      data-testid="footer"
      aria-label={t("footer.ariaLabel")}
    >
      {/* Marquee — the motto of the design system, bilingual-safe and decorative */}
      <div className="overflow-hidden border-b border-border/20 py-5 select-none" aria-hidden="true">
        <div className="flex w-max animate-marquee gap-10 whitespace-nowrap font-display text-3xl font-black uppercase sm:text-5xl">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className={i % 2 ? "text-outline" : "text-gold"}>
              Not given. Earned.
            </span>
          ))}
        </div>
      </div>

      {/* Top Main Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 relative z-10">
        {/* Col 1: Brand & Discord CTA */}
        <div className="lg:col-span-4 space-y-4">
          <Link to="/" data-testid="footer-brand-logo" aria-label="Elysium — Accueil" className="inline-block">
            <img src="/brand/wordmark-gold.png" alt="" aria-hidden="true" className="h-7 w-auto mb-3" />
          </Link>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
            {t("footer.brandBio")}
          </p>

          {/* Discord CTA */}
          <div className="pt-2">
            <a
              href="https://discord.gg/RH3ZZkMJsw"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="footer-discord-cta"
              className="inline-flex items-center gap-3 clip-blade-sm border border-[#5865F2]/40 bg-[#5865F2]/10 px-4 py-2.5 hover:bg-[#5865F2]/20 hover:border-[#5865F2] transition-colors"
            >
              <SocialIcon name="discord" size={18} className="text-[#5865F2]" aria-hidden="true" />
              <div className="text-left">
                <p className="font-display text-[0.68rem] font-bold uppercase tracking-wider text-foreground">{t("footer.discordTitle")}</p>
                <p className="font-label text-[0.65rem] text-muted-foreground uppercase tracking-widest">{t("footer.discordSub")}</p>
              </div>
            </a>
          </div>
        </div>

        {/* Col 2: Navigation secondaire */}
        <nav className="lg:col-span-3 space-y-3" aria-label={t("footer.ariaNav")}>
          <p className={headingCls}>{t("footer.navigation")}</p>
          <ul className="space-y-2.5 font-label text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <li>
              <Link to="/equipe" className={linkCls} data-testid="footer-nav-team">{t("nav.team")}</Link>
            </li>
            <li>
              <Link to="/resultats" className={linkCls} data-testid="footer-nav-results">{t("nav.results")}</Link>
            </li>
            <li>
              <Link to="/actus" className={linkCls} data-testid="footer-nav-news">{t("nav.news")}</Link>
            </li>
            <li>
              <Link to="/medias" className={linkCls} data-testid="footer-nav-media">{t("nav.media")}</Link>
            </li>
            <li>
              <Link to="/boutique" className="text-primary hover:underline transition-colors" data-testid="footer-nav-shop">{t("nav.shop")}</Link>
            </li>
            <li>
              <Link to="/calendrier" className={linkCls} data-testid="footer-nav-calendar">{t("nav.calendar")}</Link>
            </li>
            <li>
              <Link to="/statistiques" className={linkCls} data-testid="footer-nav-stats">{t("nav.stats")}</Link>
            </li>
            <li>
              <Link to="/competitions" className={linkCls} data-testid="footer-nav-competitions">{t("nav.competitions")}</Link>
            </li>
            <li>
              <Link to="/a-propos" className={linkCls} data-testid="footer-nav-about">{t("nav.about")}</Link>
            </li>
          </ul>
        </nav>

        {/* Col 3: Support, Contact & Legal */}
        <nav className="lg:col-span-2 space-y-3" aria-label={t("footer.ariaHelp")}>
          <p className={headingCls}>{t("footer.contactHelp")}</p>
          <ul className="space-y-2.5 font-label text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <li>
              <Link to="/support" className={linkCls} data-testid="footer-nav-support">{t("nav.support")}</Link>
            </li>
            <li>
              <Link to="/recrutement" className={linkCls} data-testid="footer-nav-recruitment">{t("nav.recruitment")}</Link>
            </li>
            <li>
              <Link to="/partenaires" className={linkCls} data-testid="footer-nav-partners">{t("nav.partners")}</Link>
            </li>
            <li>
              <Link to="/soutenir" className="text-primary font-semibold hover:underline transition-colors inline-flex items-center gap-1.5" data-testid="footer-nav-donate">
                <Heart size={12} aria-hidden="true" /> {t("nav.donate")}
              </Link>
            </li>
            <li>
              <Link to="/presse" className={linkCls} data-testid="footer-nav-press">{t("nav.press")}</Link>
            </li>
          </ul>

          <div className="pt-4">
            <p className="eyebrow text-[0.6rem] mb-1.5 opacity-70">{t("footer.contact")}</p>
            <a
              href="mailto:contact@elysium-esport.fr"
              data-testid="footer-contact-email"
              className="text-xs text-primary hover:underline transition-colors flex items-center gap-1.5"
            >
              <Mail size={13} aria-hidden="true" /> contact@elysium-esport.fr
            </a>
          </div>
        </nav>

        {/* Col 4: Newsletter & Socials */}
        <div className="lg:col-span-3 space-y-4">
          <p className={headingCls}>{t("newsletter.title")}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{t("newsletter.sub")}</p>
          <NewsletterSignup compact />

          <div className="pt-2">
            <p className="eyebrow text-[0.6rem] mb-3 opacity-70" id="footer-socials-label">{t("footer.followUs")}</p>
            <div className="flex items-center gap-4" data-testid="footer-socials" role="list" aria-labelledby="footer-socials-label">
              {SOCIALS.map((s) => (
                <a
                  key={s.name}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`footer-social-${s.icon}`}
                  aria-label={`${s.name} (${t("footer.opensNewTab")})`}
                  className="text-muted-foreground hover:text-primary transition-colors"
                  title={s.name}
                >
                  <SocialIcon name={s.icon} size={18} aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="relative z-10 border-t border-border/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-label text-xs text-muted-foreground tracking-[0.18em] uppercase">
            © 2026 Elysium — {t("footer.rights")}
          </p>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 font-label text-xs uppercase tracking-[0.18em] text-muted-foreground" data-testid="footer-legal-links" aria-label={t("footer.ariaLegal")}>
            <Link to="/mentions-legales" className={linkCls} data-testid="footer-link-mentions">{t("legal.mentions")}</Link>
            <Link to="/confidentialite" className={linkCls} data-testid="footer-link-privacy">{t("legal.privacy")}</Link>
            <Link to="/cgu" className={linkCls} data-testid="footer-link-terms">{t("legal.terms")}</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
};
