import { useEffect, useRef, useState } from "react";
import { collection, addDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Briefcase, CalendarX } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { ThreadsPanel, LoginPrompt } from "../components/ThreadsPanel";
import { EmptyState } from "../components/States";
import { createNotification } from "../lib/notify";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const AGE_RANGES = ["-16", "16-17", "18-24", "25+"];
const EMPTY_FORM = { pseudo: "", position: "", ageRange: "", country: "", experience: "", videos: "", availability: "", discord: "" };

export default function Recruitment() {
  const { user, displayName, canSeeRecruit } = useAuth();
  const { t } = useLang();
  const [positions, setPositions] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const formRef = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    return onSnapshot(collection(db, "positions"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.open !== false);
      list.sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
      setPositions(list);
    }, console.error);
  }, []);

  const applyTo = (p) => {
    setForm((f) => ({ ...f, position: p.title }));
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!consent) { toast.error(t("recruit.consentRequired")); return; }
    setSending(true);
    try {
      const meta = [
        `${t("recruit.form.pseudo")}: ${form.pseudo}`,
        `${t("recruit.form.age")} ${form.ageRange}`,
        `${t("recruit.form.country")}: ${form.country}`,
        `${t("recruit.form.experience")} ${form.experience}`,
        form.videos ? `${t("recruit.form.videos")}: ${form.videos}` : null,
        `${t("recruit.form.availability")} ${form.availability}`,
        form.discord ? `${t("recruit.form.discord")}: ${form.discord}` : null,
      ].filter(Boolean).join("\n");
      const ref = await addDoc(collection(db, "recruitThreads"), {
        uid: user.uid, name: displayName, email: user.email || "",
        ...form, meta, consent: true, status: "pending", createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, "recruitThreads", ref.id, "messages"), {
        uid: user.uid, name: displayName, text: meta, createdAt: serverTimestamp(),
      });
      createNotification({ targetRoles: ["manager", "bureau"], type: "recruit_new", extra: form.position.trim(), link: "/recrutement" });
      setForm(EMPTY_FORM); setConsent(false);
      toast.success(t("recruit.confirmation"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
    setSending(false);
  };

  const fields = [
    { key: "pseudo", label: t("recruit.form.pseudo"), type: "text", required: true },
    { key: "position", label: t("recruit.form.position"), type: "text", required: true },
    { key: "country", label: t("recruit.form.country"), type: "text", required: true, placeholder: "France / UTC+1" },
    { key: "experience", label: t("recruit.form.experience"), type: "textarea", required: true },
    { key: "videos", label: t("recruit.form.videos"), type: "textarea", required: false, placeholder: "https://..." },
    { key: "availability", label: t("recruit.form.availability"), type: "textarea", required: true },
    { key: "discord", label: t("recruit.form.discord"), type: "text", required: true, placeholder: "pseudo#0000" },
  ];

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20 relative">
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="recruit-title">{t("recruit.title")}</h1>
          <p className="text-[#f7f7f7]/50 mt-4 tracking-wide">{t("recruit.sub")}</p>
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
                  <button onClick={() => applyTo(p)} data-testid={`recruit-apply-${p.id}`}
                    className="bg-[#D8CA82] text-[#111111] text-xs font-display font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_12px_rgba(216,202,130,0.4)] transition-shadow">
                    {t("recruit.apply")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16 grid lg:grid-cols-12 gap-12" ref={formRef}>
        <div className="lg:col-span-5">
          <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#D8CA82] mb-6">{t("recruit.newApp")}</h2>
          {!user ? (
            <LoginPrompt messageKey="recruit.loginRequired" prefix="recruit" />
          ) : (
            <form onSubmit={submit} className="space-y-5 border border-white/10 bg-[#1A1A1A] p-6" data-testid="recruit-form">
              {fields.slice(0, 2).map((f) => (
                <div key={f.key}>
                  <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{f.label}</label>
                  <input type="text" value={form[f.key]} onChange={set(f.key)} required={f.required} placeholder={f.placeholder} className={inputCls} data-testid={`recruit-${f.key}-input`} />
                </div>
              ))}
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("recruit.form.age")}</label>
                <select value={form.ageRange} onChange={set("ageRange")} required className={inputCls} data-testid="recruit-ageRange-input">
                  <option value="">—</option>
                  {AGE_RANGES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              {fields.slice(2).map((f) => (
                <div key={f.key}>
                  <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{f.label}</label>
                  {f.type === "textarea" ? (
                    <textarea value={form[f.key]} onChange={set(f.key)} required={f.required} rows={3} placeholder={f.placeholder} className={inputCls} data-testid={`recruit-${f.key}-input`} />
                  ) : (
                    <input type="text" value={form[f.key]} onChange={set(f.key)} required={f.required} placeholder={f.placeholder} className={inputCls} data-testid={`recruit-${f.key}-input`} />
                  )}
                </div>
              ))}
              <label className="flex items-start gap-3 cursor-pointer" data-testid="recruit-consent-label">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="recruit-consent-checkbox"
                  className="mt-1 accent-[#D8CA82]" />
                <span className="text-xs text-[#f7f7f7]/60 leading-relaxed">{t("recruit.form.consent")}</span>
              </label>
              <button type="submit" disabled={sending} data-testid="recruit-submit-btn"
                className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 disabled:opacity-50 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
                {t("recruit.form.submit")}
              </button>
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
