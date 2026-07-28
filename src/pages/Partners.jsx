import { useEffect, useMemo, useState, useRef } from "react";
import { collection, addDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { toast } from "sonner";
import { ErrorState, EmptyState } from "../components/States";
import { SkeletonGrid, SkeletonMediaCard } from "../components/Skeletons";
import { ActionButton } from "../components/ui/action-button";
import { Field, FormErrorSummary, SuccessBanner, useFormValidation, rules } from "../components/FormControls";
import { Handshake, Shield, Users, Lightbulb, Trophy, Mail, ExternalLink } from "lucide-react";

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

  const MESSAGE_MAX = 1200;
  const validation = useMemo(() => ({
    name: rules.compose(rules.required("Indiquez votre nom."), rules.maxLength(60)),
    company: rules.compose(rules.required("Indiquez le nom de votre structure."), rules.maxLength(80)),
    email: rules.compose(rules.required("Indiquez votre email."), rules.email()),
    budget: rules.maxLength(60),
    message: rules.compose(
      rules.required("Décrivez votre projet."),
      rules.minLength(20, "Décrivez votre projet en 20 caractères minimum."),
      rules.maxLength(MESSAGE_MAX)
    ),
  }), []);

  const contactForm = useFormValidation(
    { name: "", company: "", email: "", budget: "", message: "" },
    validation
  );
  const { values, fieldProps, isValid, touchAll, visibleErrors, reset } = contactForm;
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    touchAll();
    if (!isValid) {
      toast.error("Merci de corriger les champs signalés.");
      return;
    }
    setSending(true);
    try {
      await addDoc(collection(db, "partner_requests"), { ...values, createdAt: serverTimestamp() });
      toast.success(t("partners.contact.success"));
      setSent(true);
      reset();
    } catch (err) {
      console.error(err);
      toast.error(t("partners.contact.error"));
    }
    setSending(false);
  };

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      {/* HERO */}
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20 relative">
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="partners-title">{t("partners.title")}</h1>
          <p className="text-[#c8c8c8] mt-4 tracking-wide max-w-2xl">{t("partners.sub")}</p>
        </div>
      </section>

      {/* VALUES */}
      <section className="border-b border-white/10 bg-[#0c0c0c]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20" data-testid="partners-values">
          <h2 className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#D8CA82] mb-10">{t("partners.values.title")}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map(({ key, icon: Icon }) => (
              <div key={key} className="border border-white/10 bg-[#1A1A1A] p-6 hover:border-[#D8CA82]/40 transition-colors">
                <Icon className="text-[#D8CA82] mb-4" size={24} />
                <h3 className="font-display font-bold text-[#f7f7f7] mb-2">{t(`partners.values.${key}`)}</h3>
                <p className="text-sm text-[#f7f7f7]/50 leading-relaxed">{t(`partners.values.${key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* OFFERS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-20" data-testid="partners-offers">
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
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20" data-testid="partners-logos">
          {error ? (
            <ErrorState onRetry={() => setRetryKey((k) => k + 1)} testId="partners-error" />
          ) : partners === null ? (
            <SkeletonGrid count={8} Card={SkeletonMediaCard} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6" testId="partners-loading" label={t("common.loading")} />
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
                        className="group border border-white/10 bg-[#1A1A1A] p-6 flex flex-col items-center gap-3 hover:border-[#D8CA82]/40 transition-colors">
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

      {/* CONTACT FORM */}
      <section className="max-w-3xl mx-auto px-4 sm:px-8 py-20" data-testid="partners-contact">
        <h2 className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#D8CA82] mb-3">{t("partners.contact.title")}</h2>
        <p className="text-[#c8c8c8] mb-10">{t("partners.contact.sub")}</p>
        {sent && (
          <div className="mb-8">
            <SuccessBanner
              testId="partners-contact-success"
              title="Demande envoyée"
              message="Merci ! Votre demande de partenariat a bien été transmise. Notre équipe revient vers vous par email sous quelques jours."
              onDismiss={() => setSent(false)}
            />
          </div>
        )}
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-6" data-testid="partners-contact-form" noValidate>
          <FormErrorSummary errors={visibleErrors} testId="partners-form-errors" />
          <div className="grid sm:grid-cols-2 gap-6">
            <Field id="partner-name" label={t("partners.contact.name")} required max={60}
              testId="partner-form-name" {...fieldProps("name")} />
            <Field id="partner-company" label={t("partners.contact.company")} required max={80}
              testId="partner-form-company" {...fieldProps("company")} />
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <Field id="partner-email" type="email" label={t("partners.contact.email")} required
              testId="partner-form-email" {...fieldProps("email")} />
            <Field id="partner-budget" label={t("partners.contact.budget")} max={60}
              placeholder={t("partners.contact.budget.placeholder")} testId="partner-form-budget" {...fieldProps("budget")} />
          </div>
          <Field id="partner-message" as="textarea" rows={5} label={t("partners.contact.message")} required
            showCounter max={MESSAGE_MAX} min={20} placeholder={t("partners.contact.message.placeholder")}
            testId="partner-form-message" className="[&_textarea]:resize-none" {...fieldProps("message")} />
          <ActionButton type="submit" variant="primary" size="lg" icon={Mail} loading={sending} loadingLabel="Envoi en cours…"
            disabled={!isValid && Object.keys(visibleErrors).length > 0}
            disabledReason="Corrigez les champs signalés pour envoyer votre demande"
            data-testid="partner-form-submit">
            {t("partners.contact.submit")}
          </ActionButton>
        </form>
      </section>
    </div>
  );
}
