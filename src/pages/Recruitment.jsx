import { useEffect, useMemo, useRef, useState } from "react";
import { collection, addDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Briefcase, CalendarX, Send } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { ThreadsPanel, LoginPrompt } from "../components/ThreadsPanel";
import { EmptyState } from "../components/States";
import { createNotification } from "../lib/notify";
import { ActionButton } from "../components/ui/action-button";
import { Field, FormErrorSummary, SuccessBanner, useFormValidation, rules } from "../components/FormControls";

const AGE_RANGES = ["-16", "16-17", "18-24", "25+"];
const EMPTY_FORM = { pseudo: "", position: "", ageRange: "", country: "", experience: "", videos: "", availability: "", discord: "" };

export default function Recruitment() {
  const { user, displayName, canSeeRecruit } = useAuth();
  const { t } = useLang();
  const [positions, setPositions] = useState([]);
  const [consent, setConsent] = useState(false);
  const [consentTouched, setConsentTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const formRef = useRef(null);

  const validation = useMemo(() => ({
    pseudo: rules.compose(rules.required("Indiquez votre pseudo."), rules.maxLength(40)),
    position: rules.compose(rules.required("Indiquez le poste visé."), rules.maxLength(80)),
    ageRange: rules.required("Sélectionnez votre tranche d'âge."),
    country: rules.compose(rules.required("Indiquez votre pays / fuseau horaire."), rules.maxLength(60)),
    experience: rules.compose(
      rules.required("Décrivez votre expérience."),
      rules.minLength(20, "Décrivez votre expérience en 20 caractères minimum."),
      rules.maxLength(1000)
    ),
    videos: rules.compose(
      rules.maxLength(500),
      (v) => (v && !String(v).split(/[\s,]+/).filter(Boolean).every((u) => /^https?:\/\/.+/.test(u))
        ? "Chaque lien doit commencer par http:// ou https://" : null)
    ),
    availability: rules.compose(rules.required("Indiquez vos disponibilités."), rules.maxLength(500)),
    discord: rules.compose(rules.required("Indiquez votre identifiant Discord."), rules.maxLength(50)),
  }), []);

  const form = useFormValidation(EMPTY_FORM, validation);
  const { values, fieldProps, isValid, touchAll, visibleErrors, reset, setValue } = form;
  const consentError = consentTouched && !consent ? t("recruit.consentRequired") : null;

  useEffect(() => {
    return onSnapshot(collection(db, "positions"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.open !== false);
      list.sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
      setPositions(list);
    }, console.error);
  }, []);

  const applyTo = (p) => {
    setValue("position", p.title);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async (e) => {
    e.preventDefault();
    touchAll();
    setConsentTouched(true);
    if (!isValid || !consent) {
      toast.error(!consent && isValid ? t("recruit.consentRequired") : "Merci de corriger les champs signalés.");
      return;
    }
    setSending(true);
    try {
      const meta = [
        `${t("recruit.form.pseudo")}: ${values.pseudo}`,
        `${t("recruit.form.age")} ${values.ageRange}`,
        `${t("recruit.form.country")}: ${values.country}`,
        `${t("recruit.form.experience")} ${values.experience}`,
        values.videos ? `${t("recruit.form.videos")}: ${values.videos}` : null,
        `${t("recruit.form.availability")} ${values.availability}`,
        values.discord ? `${t("recruit.form.discord")}: ${values.discord}` : null,
      ].filter(Boolean).join("\n");
      const ref = await addDoc(collection(db, "recruitThreads"), {
        uid: user.uid, name: displayName, email: user.email || "",
        ...values, meta, consent: true, status: "pending", createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, "recruitThreads", ref.id, "messages"), {
        uid: user.uid, name: displayName, text: meta, createdAt: serverTimestamp(),
      });
      createNotification({ targetRoles: ["manager", "bureau"], type: "recruit_new", extra: values.position.trim(), link: "/recrutement" });
      setSent({ position: values.position.trim() });
      reset(EMPTY_FORM); setConsent(false); setConsentTouched(false);
      toast.success(t("recruit.confirmation"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
    setSending(false);
  };

  const fields = [
    { key: "country", label: t("recruit.form.country"), as: "input", required: true, placeholder: "France / UTC+1", max: 60 },
    { key: "experience", label: t("recruit.form.experience"), as: "textarea", required: true, max: 1000, min: 20, counter: true },
    { key: "videos", label: t("recruit.form.videos"), as: "textarea", required: false, placeholder: "https://...", max: 500, hint: "Un lien par ligne ou séparés par une virgule." },
    { key: "availability", label: t("recruit.form.availability"), as: "textarea", required: true, max: 500, counter: true },
    { key: "discord", label: t("recruit.form.discord"), as: "input", required: true, placeholder: "pseudo#0000", max: 50 },
  ];

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20 relative">
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="recruit-title">{t("recruit.title")}</h1>
          <p className="text-[#c8c8c8] mt-4 tracking-wide">{t("recruit.sub")}</p>
        </div>
      </section>

      {/* POSTES OUVERTS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 pt-16">
        <div className="flex items-center gap-4 mb-8">
          <Briefcase className="text-[#D8CA82]" size={18} />
          <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">{t("recruit.positions")}</h2>
          <div className="flex-1 h-px bg-white/10" />
        </div>
        {positions.length === 0 ? (
          <EmptyState icon={CalendarX} text={t("recruit.positions.empty")} testId="recruit-positions-empty" />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="recruit-positions-grid">
            {positions.map((p) => (
              <div key={p.id} className="border border-white/10 bg-[#1A1A1A] p-6 flex flex-col gap-4 hover:border-[#D8CA82]/40 transition-colors" data-testid={`recruit-position-${p.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-display font-bold text-[#f7f7f7]">{p.title}</p>
                  <span className="text-[10px] font-display tracking-[0.25em] uppercase text-[#D8CA82] border border-[#D8CA82]/40 px-2 py-0.5 shrink-0">{p.game}</span>
                </div>
                {p.prerequisites && <p className="text-sm text-[#f7f7f7]/60"><span className="text-[#D8CA82]/80 text-xs uppercase tracking-wider">{t("recruit.prereq")} :</span> {p.prerequisites}</p>}
                {p.availability && <p className="text-sm text-[#f7f7f7]/60"><span className="text-[#D8CA82]/80 text-xs uppercase tracking-wider">{t("recruit.avail")} :</span> {p.availability}</p>}
                {p.processText && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-[#D8CA82]/80 mb-1.5">{t("recruit.process")}</p>
                    <ol className="text-sm text-[#f7f7f7]/60 space-y-1 list-decimal list-inside">
                      {p.processText.split("\n").filter(Boolean).map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                  </div>
                )}
                <div className="mt-auto pt-3 border-t border-white/10 flex items-center justify-between">
                  <span className="text-xs text-[#f7f7f7]/40">{p.deadline ? `${t("recruit.deadline")} : ${p.deadline}` : ""}</span>
                  <ActionButton variant="primary" size="sm" onClick={() => applyTo(p)} data-testid={`recruit-apply-${p.id}`}>
                    {t("recruit.apply")}
                  </ActionButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16 grid lg:grid-cols-12 gap-12" ref={formRef}>
        <div className="lg:col-span-5">
          <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#D8CA82] mb-6">{t("recruit.newApp")}</h2>
          {sent && (
            <div className="mb-6">
              <SuccessBanner
                testId="recruit-success"
                title="Candidature envoyée"
                message={`Votre candidature pour « ${sent.position} » a bien été transmise. Suivez son statut et échangez avec le staff dans le fil ci-contre.`}
                onDismiss={() => setSent(null)}
              />
            </div>
          )}
          {!user ? (
            <LoginPrompt messageKey="recruit.loginRequired" prefix="recruit" />
          ) : (
            <form onSubmit={submit} className="space-y-5 border border-white/10 bg-[#1A1A1A] p-6" data-testid="recruit-form" noValidate>
              <FormErrorSummary
                errors={{ ...visibleErrors, ...(consentError ? { consent: consentError } : {}) }}
                testId="recruit-form-errors"
              />

              <Field id="recruit-pseudo" label={t("recruit.form.pseudo")} required max={40}
                testId="recruit-pseudo-input" {...fieldProps("pseudo")} />

              <Field id="recruit-position" label={t("recruit.form.position")} required max={80}
                testId="recruit-position-input" {...fieldProps("position")} />

              <Field id="recruit-ageRange" as="select" label={t("recruit.form.age")} required
                testId="recruit-ageRange-input" {...fieldProps("ageRange")}>
                <option value="">—</option>
                {AGE_RANGES.map((a) => <option key={a} value={a}>{a}</option>)}
              </Field>

              {fields.map((f) => (
                <Field
                  key={f.key}
                  id={`recruit-${f.key}`}
                  as={f.as}
                  rows={f.as === "textarea" ? 3 : undefined}
                  label={f.label}
                  required={f.required}
                  placeholder={f.placeholder}
                  hint={f.hint}
                  max={f.max}
                  min={f.min}
                  showCounter={Boolean(f.counter)}
                  testId={`recruit-${f.key}-input`}
                  {...fieldProps(f.key)}
                />
              ))}

              <div>
                <label htmlFor="recruit-consent" className="flex items-start gap-3 cursor-pointer" data-testid="recruit-consent-label">
                  <input
                    id="recruit-consent"
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => { setConsent(e.target.checked); setConsentTouched(true); }}
                    onBlur={() => setConsentTouched(true)}
                    aria-invalid={Boolean(consentError) || undefined}
                    aria-describedby={consentError ? "recruit-consent-error" : undefined}
                    data-testid="recruit-consent-checkbox"
                    className="mt-1 w-4 h-4 accent-[#D8CA82]"
                  />
                  <span className="text-xs text-[#c8c8c8] leading-relaxed">{t("recruit.form.consent")}</span>
                </label>
                {consentError && (
                  <p id="recruit-consent-error" role="alert" className="mt-1.5 text-xs text-[#ff9b95]">{consentError}</p>
                )}
              </div>

              <ActionButton
                type="submit"
                variant="primary"
                size="md"
                icon={Send}
                loading={sending}
                loadingLabel="Envoi en cours…"
                disabled={(!isValid && Object.keys(visibleErrors).length > 0) || Boolean(consentError)}
                disabledReason="Corrigez les champs signalés pour envoyer votre candidature"
                data-testid="recruit-submit-btn"
              >
                {t("recruit.form.submit")}
              </ActionButton>
            </form>
          )}
        </div>
        <div className="lg:col-span-7">
          {user && (
            <>
              <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#D8CA82] mb-6" data-testid="recruit-threads-title">
                {canSeeRecruit ? t("recruit.allApps") : t("recruit.myApps")}
              </h2>
              <ThreadsPanel collectionName="recruitThreads" canSeeAll={canSeeRecruit} emptyKey="recruit.noApps" titleField="position" prefix="recruit"
                statusOptions={["pending", "reviewing", "accepted", "rejected"]} canSetStatus={canSeeRecruit} />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
