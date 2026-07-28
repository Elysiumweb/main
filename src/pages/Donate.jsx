import { Link } from "react-router-dom";
import { HeartHandshake, Trophy, Users, Wrench, ShieldCheck, Mail, ArrowRight } from "lucide-react";
import { useLang } from "../lib/i18n";
import { useSEO } from "../lib/useSEO";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { PayPalDonateButton, PAYPAL_FALLBACK_URL } from "../components/DonateButton";
import { ActionButton } from "../components/ui/action-button";
import { CONTACT_EMAIL } from "../lib/notify";

const USES = [
  { icon: Trophy, key: "comp" },
  { icon: Wrench, key: "gear" },
  { icon: Users, key: "team" },
];

export default function Donate() {
  const { t } = useLang();

  useSEO({
    title: `${t("donate.title")} — ELYSIUM Esport`,
    description: t("donate.sub"),
  });

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      {/* HERO */}
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <img
          src="/brand/logo-icon-gold.png"
          alt=""
          aria-hidden="true"
          className="absolute -right-16 top-1/2 -translate-y-1/2 w-[420px] max-w-none opacity-[0.06] pointer-events-none"
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20 relative">
          <PageBreadcrumb items={[{ label: t("donate.title") }]} />
          <p className="text-[#D8CA82] font-display text-xs tracking-[0.5em] uppercase mb-5">
            {t("donate.kicker")}
          </p>
          <h1
            className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase"
            data-testid="donate-title"
          >
            {t("donate.title")}
          </h1>
          <img src="/brand/accent-blade.png" alt="" aria-hidden="true" className="w-40 my-7 opacity-80" />
          <p className="text-[#c8c8c8] tracking-wide max-w-2xl leading-relaxed">{t("donate.sub")}</p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16 grid lg:grid-cols-12 gap-12 items-start">
        {/* Colonne dons */}
        <div className="lg:col-span-5 lg:sticky lg:top-24">
          <div className="relative border border-[#D8CA82]/30 bg-[#1A1A1A] p-6 sm:p-8 overflow-hidden" data-testid="donate-panel">
            <div className="pattern-overlay" aria-hidden="true" />
            <img
              src="/brand/accent-brackets-gold.png"
              alt=""
              aria-hidden="true"
              className="absolute -right-6 -top-6 w-28 opacity-20 pointer-events-none"
            />
            <div className="relative">
              <div className="flex items-center gap-3 mb-2">
                <HeartHandshake className="text-[#D8CA82]" size={20} aria-hidden="true" />
                <h2 className="font-display font-bold uppercase tracking-[0.25em] text-sm text-[#D8CA82]">
                  {t("donate.panel.title")}
                </h2>
              </div>
              <p className="text-sm text-[#c8c8c8] leading-relaxed mb-6">{t("donate.panel.sub")}</p>

              <PayPalDonateButton testId="donate-paypal" />

              <p className="mt-5 flex items-center gap-2 text-[11px] uppercase tracking-widest text-[#a0a0a0]">
                <ShieldCheck size={13} aria-hidden="true" /> {t("donate.secure")}
              </p>
              <p className="mt-4 text-[11px] text-[#a0a0a0] leading-relaxed">
                {t("donate.noReceipt")}{" "}
                <a
                  href={PAYPAL_FALLBACK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#D8CA82] hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
                  data-testid="donate-paypal-direct"
                >
                  {t("donate.directLink")}
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Colonne explications */}
        <div className="lg:col-span-7 space-y-10">
          <div>
            <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7] mb-6">
              {t("donate.uses.title")}
            </h2>
            <div className="grid sm:grid-cols-3 gap-4" data-testid="donate-uses">
              {USES.map(({ icon: Icon, key }) => (
                <div key={key} className="border border-white/10 bg-[#141414] p-5 hover:border-[#D8CA82]/40 transition-colors motion-reduce:transition-none">
                  <Icon className="text-[#D8CA82] mb-3" size={20} aria-hidden="true" />
                  <p className="font-display font-bold text-sm text-[#f7f7f7] uppercase tracking-wider">
                    {t(`donate.uses.${key}`)}
                  </p>
                  <p className="text-sm text-[#c8c8c8] mt-2 leading-relaxed">{t(`donate.uses.${key}.desc`)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border-l-2 border-[#D8CA82] pl-6 py-2">
            <p className="text-[#c8c8c8] text-lg leading-relaxed font-light">{t("donate.quote")}</p>
            <p className="mt-3 text-[11px] uppercase tracking-[0.3em] text-[#D8CA82]">Not given. Earned.</p>
          </div>

          <div className="border border-white/10 bg-[#0c0c0c] p-6">
            <h3 className="font-display text-sm tracking-[0.25em] uppercase text-[#D8CA82] mb-3">
              {t("donate.other.title")}
            </h3>
            <p className="text-sm text-[#c8c8c8] leading-relaxed">{t("donate.other.sub")}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <ActionButton as={Link} to="/partenaires" variant="secondary" size="md" data-testid="donate-partners-link">
                {t("nav.partners")} <ArrowRight size={14} aria-hidden="true" />
              </ActionButton>
              <ActionButton
                as="a"
                href={`mailto:${CONTACT_EMAIL}`}
                variant="ghost"
                size="md"
                icon={Mail}
                data-testid="donate-contact-link"
              >
                {CONTACT_EMAIL}
              </ActionButton>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
