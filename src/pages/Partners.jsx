import { useEffect, useState, useRef } from "react";
import { collection, addDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { getHoneypotProps, isHoneypotFilled, checkSessionRateLimit, rateLimitMessage } from "../lib/antiSpam";
import { toast } from "sonner";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { Handshake, Shield, Users, Lightbulb, Trophy, Mail, ExternalLink, Heart } from "lucide-react";
import { DonateBlock } from "../components/DonateButton";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { Button } from "../components/ui/button";

const values = [
  { key: "compete", icon: Trophy },
  { key: "integrity", icon: Shield },
  { key: "community", icon: Users },
  { key: "innovation", icon: Lightbulb },
];

const tiers = ["gold", "silver", "bronze"];

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

export default function Partners() {
  const { t } = useLang();
  const [partners, setPartners] = useState(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const formRef = useRef(null);

  useEffect(() => {
    setError(false); setPartners(null);
    const u = onSnapshot(collection(db, "partners"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      setPartners(list);
    }, (e) => { console.error(e); setError(true); });
    return () => u();
  }, [retryKey]);

  const grouped = partners ? tiers.map((tier) => ({
    tier,
    list: partners.filter((p) => (p.tier || "bronze") === tier),
  })).filter((g) => g.list.length > 0) : [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (isHoneypotFilled(fd.get("website"))) return;
    const limit = checkSessionRateLimit("partner_request", { max: 2, windowMs: 10 * 60 * 1000 });
    if (!limit.allowed) { toast.error(rateLimitMessage(limit.retryAt)); return; }
    const data = {
      name: fd.get("name"),
      company: fd.get("company"),
      email: fd.get("email"),
      budget: fd.get("budget"),
      message: fd.get("message"),
      createdAt: serverTimestamp(),
    };
    try {
      await addDoc(collection(db, "partner_requests"), data);
      toast.success(t("partners.contact.success"));
      e.target.reset();
    } catch (err) {
      console.error(err);
      toast.error(t("partners.contact.error"));
    }
  };

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      {/* HERO */}
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("partners.title") }]} />
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="partners-title">{t("partners.title")}</h1>
          <p className="text-[#c8c8c8] mt-4 tracking-wide max-w-2xl">{t("partners.sub")}</p>
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

      {/* OFFERS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16" data-testid="partners-offers">
        <h2 className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#D8CA82] mb-10">{t("partners.offers.title")}</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {tiers.map((tier) => (
            <div key={tier} className={`border p-6 ${tier === "gold" ? "border-[#D8CA82]/50 bg-[#D8CA82]/5" : tier === "silver" ? "border-[#C0C0C0]/30 bg-[#C0C0C0]/5" : "border-[#CD7F32]/30 bg-[#CD7F32]/5"}`}>
              <p className={`font-display font-black text-2xl uppercase mb-3 ${tier === "gold" ? "text-[#D8CA82]" : tier === "silver" ? "text-[#C0C0C0]" : "text-[#CD7F32]"}`}>
                {t(`partners.tiers.${tier}`)}
              </p>
              <p className="text-sm text-[#f7f7f7]/60 leading-relaxed">{t(`partners.offers.${tier}.desc`)}</p>
            </div>
          ))}
        </div>
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
                        {p.website && <ExternalLink size={12} className="text-[#f7f7f7]/30" />}
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
      <section className="max-w-3xl mx-auto px-4 sm:px-8 py-16" data-testid="partners-contact">
        <h2 className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#D8CA82] mb-3">{t("partners.contact.title")}</h2>
        <p className="text-[#f7f7f7]/50 mb-10">{t("partners.contact.sub")}</p>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-6" data-testid="partners-contact-form">
          <label htmlFor="partner-website" className="sr-only">Site web</label>
          <input id="partner-website" type="text" {...getHoneypotProps("website")} data-testid="partner-form-honeypot" />
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="partner-name" className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] block mb-2">{t("partners.contact.name")}</label>
              <input id="partner-name" name="name" required data-testid="partner-form-name"
                className="w-full bg-[#1A1A1A] border border-white/20 px-4 py-3 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
            </div>
            <div>
              <label htmlFor="partner-company" className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] block mb-2">{t("partners.contact.company")}</label>
              <input id="partner-company" name="company" required data-testid="partner-form-company"
                className="w-full bg-[#1A1A1A] border border-white/20 px-4 py-3 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="partner-email" className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] block mb-2">{t("partners.contact.email")}</label>
              <input id="partner-email" name="email" type="email" required data-testid="partner-form-email"
                className="w-full bg-[#1A1A1A] border border-white/20 px-4 py-3 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
            </div>
            <div>
              <label htmlFor="partner-budget" className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] block mb-2">{t("partners.contact.budget")}</label>
              <input id="partner-budget" name="budget" placeholder={t("partners.contact.budget.placeholder")} data-testid="partner-form-budget"
                className="w-full bg-[#1A1A1A] border border-white/20 px-4 py-3 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82] placeholder:text-[#a0a0a0]" />
            </div>
          </div>
          <div>
            <label htmlFor="partner-message" className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] block mb-2">{t("partners.contact.message")}</label>
            <textarea id="partner-message" name="message" rows={5} required placeholder={t("partners.contact.message.placeholder")} data-testid="partner-form-message"
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
