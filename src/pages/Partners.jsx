import { useEffect, useState, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { getHoneypotProps, isHoneypotFilled, checkSessionRateLimit, rateLimitMessage } from "../lib/antiSpam";
import { callProtected, protectedErrorMessage } from "../lib/secureForms";
import { toast } from "sonner";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { Handshake, Shield, Users, Lightbulb, Trophy, Mail, ExternalLink, Heart, Check, Star, Zap, Crown, Wrench, BarChart3, Megaphone } from "lucide-react";
import { DonateBlock } from "../components/DonateButton";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { Button } from "../components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion";

const values = [
  { key: "compete", icon: Trophy },
  { key: "integrity", icon: Shield },
  { key: "community", icon: Users },
  { key: "innovation", icon: Lightbulb },
];

const tiersOrder = ["gold", "silver", "bronze"];

const PartnerLogo = ({ src, name, className }) => {
  const [err, setErr] = useState(false);
  const safeName = (name || "Partenaire").trim();
  if (!src || err) {
    const initials = safeName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || "")
      .join("") || "?";
    return (
      <div
        role="img"
        aria-label={`Logo du partenaire indisponible : ${safeName}`}
        className={`${className} bg-[#0c0c0c] flex items-center justify-center text-[#a0a0a0] font-display tracking-widest text-sm uppercase border border-white/10`}
      >
        <span aria-hidden="true">{initials}</span>
      </div>
    );
  }
  return <img src={src} alt={`Logo du partenaire : ${safeName}`} onError={() => setErr(true)} className={`${className} object-contain`} />;
};

const tierConfig = {
  bronze: { icon: Star, color: "#CD7F32", bg: "bg-[#CD7F32]/5", border: "border-[#CD7F32]/30", text: "text-[#CD7F32]", badgeKey: "jersey", count: 5 },
  silver: { icon: Zap, color: "#C0C0C0", bg: "bg-[#C0C0C0]/5", border: "border-[#C0C0C0]/30", text: "text-[#C0C0C0]", badgeKey: "stream", count: 6, popular: true },
  gold: { icon: Crown, color: "#D8CA82", bg: "bg-[#D8CA82]/5", border: "border-[#D8CA82]/50", text: "text-[#D8CA82]", badgeKey: "jersey", count: 8 },
  custom: { icon: Wrench, color: "#f7f7f7", bg: "bg-[#f7f7f7]/5", border: "border-white/20", text: "text-[#f7f7f7]", badgeKey: "event", count: 5 },
};

export default function Partners() {
  const { t } = useLang();
  const [partners, setPartners] = useState(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const formRef = useRef(null);
  const contactSectionRef = useRef(null);
  const [prefilled, setPrefilled] = useState({ budget: "", message: "" });

  useEffect(() => {
    setError(false); setPartners(null);
    const u = onSnapshot(collection(db, "partners"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      setPartners(list);
    }, (e) => { console.error(e); setError(true); });
    return () => u();
  }, [retryKey]);

  const grouped = partners ? tiersOrder.map((tier) => ({
    tier,
    list: partners.filter((p) => (p.tier || "bronze") === tier),
  })).filter((g) => g.list.length > 0) : [];

  const scrollToContact = (tierKey) => {
    const tierLabel = t(`partners.tiers.${tierKey}`);
    const price = t(`partners.offers.${tierKey}.price`);
    setPrefilled({
      budget: tierKey === "custom" ? "" : `${tierLabel} — ${price} ${t("partners.offers.period")}`,
      message: tierKey === "custom"
        ? `Bonjour Elysium,\n\nNous souhaitons discuter d'un partenariat sur-mesure (activation terrain, tournoi à notre nom, contenu).\nObjectifs : \nBudget envisagé : \n\nMerci !`
        : `Bonjour Elysium,\n\nNous sommes intéressés par le pack ${tierLabel} (${price} ${t("partners.offers.period")}).\n\nPrésentation de notre entreprise : \nObjectifs du partenariat : \n\nÀ très vite,`,
    });
    setTimeout(() => {
      contactSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (isHoneypotFilled(fd.get("website"))) return;
    const pName = String(fd.get("name") || "").trim();
    const pCompany = String(fd.get("company") || "").trim();
    const pEmail = String(fd.get("email") || "").trim();
    const pBudget = String(fd.get("budget") || "").trim();
    const pMessage = String(fd.get("message") || "").trim();
    if (pName.length < 2 || pName.length > 120) { toast.error(`${t("partners.contact.name")} : 2 ${t("form.minChars")}`); return; }
    if (pCompany.length < 2 || pCompany.length > 160) { toast.error(`${t("partners.contact.company")} : 2 ${t("form.minChars")}`); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pEmail)) { toast.error(t("partners.contact.emailInvalid")); return; }
    if (pBudget.length > 80) { toast.error(`${t("partners.contact.budget")} : 80 ${t("form.maxChars")}`); return; }
    if (pMessage.length < 10) { toast.error(`${t("partners.contact.message")} : 10 ${t("form.minChars")}`); return; }
    if (pMessage.length > 3000) { toast.error(`${t("partners.contact.message")} : 3000 ${t("form.maxChars")}`); return; }
    const limit = checkSessionRateLimit("partner_request", { max: 2, windowMs: 10 * 60 * 1000 });
    if (!limit.allowed) { toast.error(rateLimitMessage(limit.retryAt)); return; }
    try {
      await callProtected("submitPartnerRequest", {
        name: pName,
        company: pCompany,
        email: pEmail,
        budget: pBudget,
        message: pMessage,
      });
      toast.success(t("partners.contact.success"));
      e.target.reset();
      setPrefilled({ budget: "", message: "" });
    } catch (err) {
      console.error(err);
      toast.error(protectedErrorMessage(err, t("partners.contact.error")));
    }
  };

  const offerKeys = ["bronze", "silver", "gold", "custom"];

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      {/* HERO */}
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("partners.title") }]} />
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="partners-title">{t("partners.title")}</h1>
          <p className="text-[#c8c8c8] mt-4 tracking-wide max-w-2xl">{t("partners.sub")}</p>
          <p className="text-sm text-[#D8CA82]/80 mt-3 max-w-2xl">{t("partners.offers.sub")}</p>
        </div>
      </section>

      {/* VALUES */}
      <section className="border-b border-white/10 bg-[#0c0c0c]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16" data-testid="partners-values">
          <h2 className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#D8CA82] mb-10">{t("partners.values.title")}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map(({ key, icon: Icon }) => (
              <div key={key} className="border border-white/10 bg-[#1A1A1A] p-6 hover:border-[#D8CA82]/50 transition-colors">
                <Icon className="text-[#D8CA82] mb-4" size={24} />
                <h3 className="font-display font-bold text-[#f7f7f7] mb-2">{t(`partners.values.${key}`)}</h3>
                <p className="text-sm text-[#f7f7f7]/50 leading-relaxed">{t(`partners.values.${key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AUDIENCE / WHY */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16 border-b border-white/10" data-testid="partners-audience">
        <h2 className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#D8CA82] mb-10">{t("partners.offers.audience.title")}</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="border border-white/10 bg-[#1A1A1A] p-6">
            <BarChart3 className="text-[#D8CA82] mb-4" size={22} />
            <h3 className="font-display font-bold text-[#f7f7f7] mb-2">{t("partners.offers.audience.reach")}</h3>
            <p className="text-sm text-[#f7f7f7]/60 leading-relaxed">{t("partners.offers.audience.reach.desc")}</p>
          </div>
          <div className="border border-white/10 bg-[#1A1A1A] p-6">
            <Megaphone className="text-[#D8CA82] mb-4" size={22} />
            <h3 className="font-display font-bold text-[#f7f7f7] mb-2">{t("partners.offers.audience.engagement")}</h3>
            <p className="text-sm text-[#f7f7f7]/60 leading-relaxed">{t("partners.offers.audience.engagement.desc")}</p>
          </div>
          <div className="border border-white/10 bg-[#1A1A1A] p-6">
            <Shield className="text-[#D8CA82] mb-4" size={22} />
            <h3 className="font-display font-bold text-[#f7f7f7] mb-2">{t("partners.offers.audience.values")}</h3>
            <p className="text-sm text-[#f7f7f7]/60 leading-relaxed">{t("partners.offers.audience.values.desc")}</p>
          </div>
        </div>
      </section>

      {/* OFFERS DETAILED - Annexe 3 p15-16 */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16" data-testid="partners-offers">
        <div className="flex items-center gap-4 mb-4">
          <h2 className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#D8CA82]">{t("partners.offers.title")}</h2>
          <div className="flex-1 h-px bg-white/10" />
        </div>
        <p className="text-sm text-[#c8c8c8] mb-10 max-w-3xl">{t("partners.offers.commitment")}</p>

        <div className="grid lg:grid-cols-4 md:grid-cols-2 gap-6">
          {offerKeys.map((tier) => {
            const cfg = tierConfig[tier];
            const Icon = cfg.icon;
            const isPopular = cfg.popular;
            const benefitsCount = cfg.count;
            const benefits = Array.from({ length: benefitsCount }, (_, i) => t(`partners.offers.benefits.${tier}.${i + 1}`));
            return (
              <div key={tier} className={`relative border ${cfg.border} ${cfg.bg} p-6 flex flex-col ${isPopular ? "ring-1 ring-[#D8CA82]/30" : ""}`} data-testid={`partners-offer-${tier}`}>
                {isPopular && (
                  <div className="absolute -top-3 left-6 bg-[#D8CA82] text-[#111111] text-[10px] font-display font-bold uppercase tracking-[0.2em] px-3 py-1">
                    {t("partners.offers.popular")}
                  </div>
                )}
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 border ${cfg.border} bg-[#0c0c0c] flex items-center justify-center`}>
                    <Icon className={cfg.text} size={18} />
                  </div>
                  <div>
                    <p className={`font-display font-black text-xl uppercase ${cfg.text}`}>{t(`partners.tiers.${tier}`)}</p>
                    <p className="text-xs uppercase tracking-widest text-[#c8c8c8]">{t(`partners.offers.badge.${cfg.badgeKey}`)}</p>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display font-black text-3xl text-[#f7f7f7]">{t(`partners.offers.${tier}.price`)}</span>
                    {tier !== "custom" && <span className="text-xs text-[#c8c8c8] uppercase tracking-widest">{t("partners.offers.period")}</span>}
                  </div>
                  <p className="text-sm text-[#f7f7f7]/60 mt-3 leading-relaxed min-h-[60px]">{t(`partners.offers.${tier}.long`)}</p>
                </div>

                <div className="border-t border-white/10 pt-4 mb-6 flex-1">
                  <p className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] mb-3">{t("partners.offers.benefits")}</p>
                  <ul className="space-y-2.5">
                    {benefits.map((b, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-sm text-[#f7f7f7]/80">
                        <Check size={14} className={`${cfg.text} mt-0.5 shrink-0`} />
                        <span className="leading-snug">{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Button
                  onClick={() => scrollToContact(tier)}
                  variant={tier === "gold" ? "gold" : "outline"}
                  size="md"
                  className={`w-full mt-auto ${tier === "gold" ? "" : "border-white/20 text-[#f7f7f7] hover:border-[#D8CA82] hover:text-[#D8CA82]"}`}
                  data-testid={`partners-offer-cta-${tier}`}
                >
                  {tier === "custom" ? t("partners.offers.cta.custom") : t("partners.offers.cta")}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-[#a0a0a0] mt-8 border border-white/10 bg-[#0c0c0c] p-4">{t("partners.offers.legal")}</p>
      </section>

      {/* COMPARISON TABLE */}
      <section className="border-t border-white/10 bg-[#0c0c0c]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16" data-testid="partners-comparison">
          <h2 className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#D8CA82] mb-10">{t("partners.offers.comparison.title")}</h2>
          <div className="overflow-x-auto border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1A1A1A] border-b border-white/10">
                  <th className="text-left p-4 font-display uppercase tracking-widest text-xs text-[#c8c8c8]">{t("partners.offers.comparison.col.feature")}</th>
                  <th className="text-center p-4 font-display uppercase tracking-widest text-xs text-[#CD7F32]">{t("partners.tiers.bronze")}</th>
                  <th className="text-center p-4 font-display uppercase tracking-widest text-xs text-[#C0C0C0]">{t("partners.tiers.silver")}</th>
                  <th className="text-center p-4 font-display uppercase tracking-widest text-xs text-[#D8CA82]">{t("partners.tiers.gold")}</th>
                  <th className="text-center p-4 font-display uppercase tracking-widest text-xs text-[#f7f7f7]">{t("partners.tiers.custom")}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { key: "logoSite", bronze: true, silver: true, gold: true, custom: true },
                  { key: "logoStream", bronze: false, silver: true, gold: true, custom: true },
                  { key: "logoJersey", bronze: false, silver: false, gold: true, custom: false },
                  { key: "socialPosts", bronze: "1", silver: "2", gold: "4", custom: "—" },
                  { key: "newsletter", bronze: true, silver: true, gold: true, custom: false },
                  { key: "eventAccess", bronze: false, silver: "2", gold: "2", custom: "sur mesure" },
                  { key: "content", bronze: false, silver: false, gold: true, custom: true },
                  { key: "report", bronze: false, silver: false, gold: true, custom: false },
                  { key: "naming", bronze: false, silver: false, gold: true, custom: true },
                ].map((row) => (
                  <tr key={row.key} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="p-4 text-[#f7f7f7]/80">{t(`partners.offers.comparison.row.${row.key}`)}</td>
                    <td className="p-4 text-center text-[#f7f7f7]/60">{typeof row.bronze === "boolean" ? (row.bronze ? <Check size={16} className="text-[#CD7F32] mx-auto" /> : <span className="text-[#a0a0a0]">—</span>) : row.bronze}</td>
                    <td className="p-4 text-center text-[#f7f7f7]/60">{typeof row.silver === "boolean" ? (row.silver ? <Check size={16} className="text-[#C0C0C0] mx-auto" /> : <span className="text-[#a0a0a0]">—</span>) : row.silver}</td>
                    <td className="p-4 text-center text-[#f7f7f7]/60">{typeof row.gold === "boolean" ? (row.gold ? <Check size={16} className="text-[#D8CA82] mx-auto" /> : <span className="text-[#a0a0a0]">—</span>) : row.gold}</td>
                    <td className="p-4 text-center text-[#f7f7f7]/60">{typeof row.custom === "boolean" ? (row.custom ? <Check size={16} className="text-[#f7f7f7] mx-auto" /> : <span className="text-[#a0a0a0]">—</span>) : row.custom}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-4xl mx-auto px-4 sm:px-8 py-16" data-testid="partners-faq">
        <h2 className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#D8CA82] mb-10">{t("partners.offers.faq.title")}</h2>
        <Accordion type="single" collapsible className="w-full">
          {[1, 2, 3, 4].map((n) => (
            <AccordionItem key={n} value={`faq-${n}`} className="border-white/10" data-testid={`partners-faq-${n}`}>
              <AccordionTrigger className="text-left text-[#f7f7f7] hover:text-[#D8CA82] hover:no-underline">
                {t(`partners.offers.faq.q${n}`)}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-[#c8c8c8] leading-relaxed">
                {t(`partners.offers.faq.a${n}`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* PARTNER LOGOS */}
      <section className="border-t border-white/10 bg-[#0c0c0c]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16" data-testid="partners-logos">
          {error ? (
            <ErrorState onRetry={() => setRetryKey((k) => k + 1)} testId="partners-error" />
          ) : partners === null ? (
            <LoadingState testId="partners-loading" />
          ) : grouped.length === 0 ? (
            <EmptyState icon={Handshake} text={t("partners.empty")} testId="partners-empty" />
          ) : (
            <div className="space-y-12">
              {grouped.map(({ tier, list }) => (
                <div key={tier}>
                  <div className="flex items-center gap-4 mb-6">
                    <h3 className={`font-display text-sm tracking-[0.3em] uppercase ${tier === "gold" ? "text-[#D8CA82]" : tier === "silver" ? "text-[#C0C0C0]" : "text-[#CD7F32]"}`}>
                      {t(`partners.tiers.${tier}`)}
                    </h3>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                    {list.map((p) => (
                      <a key={p.id} href={p.website || "#"} target="_blank" rel="noopener noreferrer"
                        className="group border border-white/10 bg-[#1A1A1A] p-6 flex flex-col items-center gap-3 hover:border-[#D8CA82]/50 transition-colors">
                        <PartnerLogo src={p.logoUrl} name={p.name} className="w-full h-20" />
                        <p className="font-display font-bold text-sm text-[#f7f7f7] group-hover:text-[#D8CA82] transition-colors text-center">{p.name}</p>
                        {p.website && <ExternalLink size={12} className="text-[#c8c8c8]" />}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* DON — PARTICULIERS */}
      <section className="border-t border-white/10 bg-[#0c0c0c]" aria-labelledby="partners-donate-h2">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16" data-testid="partners-donate">
          <div className="flex items-center gap-4 mb-10">
            <Heart className="text-[#D8CA82]" size={20} aria-hidden="true" />
            <h2 id="partners-donate-h2" className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#f7f7f7]">{t("donate.title")}</h2>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <DonateBlock testId="partners-donate-block" />
        </div>
      </section>

      {/* CONTACT FORM */}
      <section ref={contactSectionRef} className="max-w-3xl mx-auto px-4 sm:px-8 py-16" data-testid="partners-contact">
        <h2 className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#D8CA82] mb-3">{t("partners.contact.title")}</h2>
        <p className="text-[#f7f7f7]/50 mb-10">{t("partners.contact.sub")}</p>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-6" data-testid="partners-contact-form">
          <label htmlFor="partner-website" className="sr-only">Site web</label>
          <input id="partner-website" type="text" {...getHoneypotProps("website")} data-testid="partner-form-honeypot" />
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="partner-name" className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] block mb-2">{t("partners.contact.name")}</label>
              <input id="partner-name" name="name" required data-testid="partner-form-name"
                className="w-full bg-[#1A1A1A] border border-white/20 px-4 py-3 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
            </div>
            <div>
              <label htmlFor="partner-company" className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] block mb-2">{t("partners.contact.company")}</label>
              <input id="partner-company" name="company" required data-testid="partner-form-company"
                className="w-full bg-[#1A1A1A] border border-white/20 px-4 py-3 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="partner-email" className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] block mb-2">{t("partners.contact.email")}</label>
              <input id="partner-email" name="email" type="email" required data-testid="partner-form-email"
                className="w-full bg-[#1A1A1A] border border-white/20 px-4 py-3 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
            </div>
            <div>
              <label htmlFor="partner-budget" className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] block mb-2">{t("partners.contact.budget")}</label>
              <input id="partner-budget" name="budget" value={prefilled.budget} onChange={(e) => setPrefilled((p) => ({ ...p, budget: e.target.value }))} placeholder={t("partners.contact.budget.placeholder")} data-testid="partner-form-budget"
                className="w-full bg-[#1A1A1A] border border-white/20 px-4 py-3 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82] placeholder:text-[#a0a0a0]" />
            </div>
          </div>
          <div>
            <label htmlFor="partner-message" className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] block mb-2">{t("partners.contact.message")}</label>
            <textarea id="partner-message" name="message" value={prefilled.message} onChange={(e) => setPrefilled((p) => ({ ...p, message: e.target.value }))} rows={6} required placeholder={t("partners.contact.message.placeholder")} data-testid="partner-form-message"
              className="w-full bg-[#1A1A1A] border border-white/20 px-4 py-3 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82] placeholder:text-[#a0a0a0] resize-none" />
          </div>
          <Button type="submit" data-testid="partner-form-submit" variant="gold" size="lg" className="flex items-center gap-2">
            <Mail size={16} aria-hidden="true" /> {t("partners.contact.submit")}
          </Button>
        </form>
      </section>
    </div>
  );
}
