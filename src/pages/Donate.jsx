import { Heart, Trophy, Plane, Wrench, Users, Handshake, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useLang } from "../lib/i18n";
import { useSEO } from "../lib/useSEO";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { DonateButton, DonateSecureNote, DonateSubscriptionCard } from "../components/DonateButton";
import { CampaignProgress } from "../components/CampaignProgress";
import { OptimizedImage } from "../components/OptimizedImage";
import { CONTACT_EMAIL } from "../lib/notify";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";

const USES = [
  { key: "gear", icon: Wrench },
  { key: "travel", icon: Plane },
  { key: "comp", icon: Trophy },
  { key: "community", icon: Users },
];

export default function Donate() {
  const { t } = useLang();
  useSEO({
    title: `${t("donate.title")} — Elysium Esport`,
    description: t("donate.sub"),
    url: "/soutenir",
  });

  return (
    <div className="min-h-[70vh] bg-transparent">
      {/* HERO */}
      <section className="relative overflow-hidden pt-6 sm:pt-10">
        <div className="pattern-overlay" />
        <div className="absolute -right-20 top-1/2 -translate-y-1/2 opacity-[0.06] pointer-events-none">
          <OptimizedImage src="/brand/logo-icon-gold.png" alt="" aria-hidden="true" width="808" height="798" loading="lazy" className="w-[520px] h-auto max-w-none" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb className="opacity-80" items={[{ label: t("donate.title") }]} />
          <p className="text-xs font-display uppercase tracking-[0.45em] text-primary mb-5">
            {t("donate.badge")}
          </p>
          <h1
            className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-foreground uppercase leading-none"
            data-testid="donate-title"
          >
            {t("donate.title")}
          </h1>
          <OptimizedImage
            src="/brand/accent-blade.png"
            alt=""
            aria-hidden="true"
            width="787"
            height="658"
            loading="lazy"
            className="w-40 h-auto my-7 opacity-80"
          />
          <p className="text-muted-foreground text-base sm:text-lg tracking-wide max-w-2xl leading-relaxed">
            {t("donate.sub")}
          </p>
        </div>
      </section>

      {/* OBJECTIF DE CAMPAGNE */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 pt-16" data-testid="donate-campaign">
        <CampaignProgress testId="donate-campaign-progress" />
      </section>

      {/* DON — BOUTONS PAYPAL */}
      <section
        className="max-w-7xl mx-auto px-4 sm:px-8 py-20 grid lg:grid-cols-12 gap-12"
        data-testid="donate-main"
        aria-labelledby="donate-give-h2"
      >
        <div className="lg:col-span-7">
          <h2
            id="donate-give-h2"
            className="eyebrow mb-6"
          >
            {t("donate.why.title")}
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-6">{t("donate.why.text")}</p>
          <p className="text-muted-foreground leading-relaxed">{t("donate.why.text2")}</p>

          <div className="mt-10 grid sm:grid-cols-2 gap-6" data-testid="donate-uses">
            {USES.map(({ key, icon: Icon }) => (
              <div
                key={key}
                className="panel clip-blade-sm p-6 hover:border-primary/40 transition-colors motion-reduce:transition-none"
                data-testid={`donate-use-${key}`}
              >
                <Icon className="text-primary mb-4" size={22} aria-hidden="true" />
                <h3 className="font-display font-bold text-foreground mb-2">{t(`donate.use.${key}`)}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{t(`donate.use.${key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Carte de don — sticky sur desktop */}
        <aside className="lg:col-span-5">
          <div
            className="lg:sticky lg:top-24 relative border border-primary/30 bg-card p-8 overflow-hidden"
            data-testid="donate-card"
          >
            <OptimizedImage
              src="/brand/accent-brackets-gold.png"
              alt=""
              aria-hidden="true"
              width="600"
              height="754"
              loading="lazy"
              className="pointer-events-none absolute -right-10 -bottom-10 w-44 h-auto opacity-[0.06]"
            />
            <div className="relative">
              <div className="flex items-center gap-3 mb-5">
                <Heart className="text-primary" size={20} aria-hidden="true" />
                <p className="eyebrow">
                  {t("donate.card.title")}
                </p>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-7">{t("donate.card.text")}</p>

              <DonateButton testId="donate-page-paypal" />
              <DonateSecureNote testId="donate-page-secure-note" />

              {/* Don mensuel / adhésion */}
              <DonateSubscriptionCard testId="donate-page-subscription" />

              <div className="mt-7 pt-6 border-t border-border/25">
                <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-2">
                  {t("donate.card.other")}
                </p>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  data-testid="donate-contact-email"
                  className="text-xs text-primary hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {CONTACT_EMAIL}
                </a>
              </div>
            </div>
          </div>
        </aside>
      </section>

      {/* TRANSPARENCE */}
      <section className="border-t border-border/25 bg-background/70" aria-labelledby="donate-transparency-h2">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20" data-testid="donate-transparency">
          <div className="flex items-center gap-4 mb-8">
            <h2
              id="donate-transparency-h2"
              className="eyebrow"
            >
              {t("donate.transparency.title")}
            </h2>
            <div className="flex-1 h-px bg-primary/10" />
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="panel clip-blade-sm p-6" data-testid={`donate-transparency-${i}`}>
                <p className="font-display font-black text-2xl text-primary mb-3">0{i}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{t(`donate.transparency.item${i}`)}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-8 max-w-3xl leading-relaxed" data-testid="donate-legal-note">
            {t("donate.legal")}
          </p>
        </div>
      </section>

      {/* AUTRES FAÇONS DE SOUTENIR */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-20" aria-labelledby="donate-alt-h2">
        <div className="flex items-center gap-4 mb-8">
          <h2
            id="donate-alt-h2"
            className="eyebrow"
          >
            {t("donate.alt.title")}
          </h2>
          <div className="flex-1 h-px bg-primary/10" />
        </div>
        <div className="grid sm:grid-cols-2 gap-6" data-testid="donate-alt">
          <Link
            to="/partenaires"
            data-testid="donate-alt-partners"
            className="group panel clip-blade-sm p-6 hover:border-primary/40 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Handshake className="text-primary mb-4" size={22} aria-hidden="true" />
            <h3 className="font-display font-bold text-foreground mb-2 group-hover:text-primary transition-colors motion-reduce:transition-none">
              {t("donate.alt.partner")}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{t("donate.alt.partner.desc")}</p>
            <span className="mt-4 inline-flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-primary">
              {t("donate.alt.cta")} <ArrowRight size={12} aria-hidden="true" />
            </span>
          </Link>
          <a
            href="https://discord.gg/RH3ZZkMJsw"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="donate-alt-discord"
            onClick={() => trackEvent(ANALYTICS_EVENTS.DISCORD_CLICK, { source: "donate_alt" })}
            className="group panel clip-blade-sm p-6 hover:border-primary/40 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Users className="text-primary mb-4" size={22} aria-hidden="true" />
            <h3 className="font-display font-bold text-foreground mb-2 group-hover:text-primary transition-colors motion-reduce:transition-none">
              {t("donate.alt.community")}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{t("donate.alt.community.desc")}</p>
            <span className="mt-4 inline-flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-primary">
              {t("donate.alt.cta")} <ArrowRight size={12} aria-hidden="true" />
            </span>
          </a>
        </div>
      </section>
    </div>
  );
}
