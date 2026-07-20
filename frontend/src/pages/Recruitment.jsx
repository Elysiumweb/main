import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { ThreadsPanel, LoginPrompt } from "../components/ThreadsPanel";

export default function Recruitment() {
  const { user, displayName, canSeeRecruit } = useAuth();
  const { t } = useLang();
  const [form, setForm] = useState({ position: "", experience: "", age: "", availability: "" });
  const [sending, setSending] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const meta = `${t("recruit.form.experience")} ${form.experience}\n${t("recruit.form.age")} ${form.age}\n${t("recruit.form.availability")} ${form.availability}`;
      const ref = await addDoc(collection(db, "recruitThreads"), {
        uid: user.uid, name: displayName, email: user.email || "",
        position: form.position.trim(), experience: form.experience.trim(),
        age: form.age.trim(), availability: form.availability.trim(),
        meta, status: "open", createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, "recruitThreads", ref.id, "messages"), {
        uid: user.uid, name: displayName, text: meta, createdAt: serverTimestamp(),
      });
      setForm({ position: "", experience: "", age: "", availability: "" });
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
    setSending(false);
  };

  const fields = [
    { key: "position", label: t("recruit.form.position"), type: "text" },
    { key: "experience", label: t("recruit.form.experience"), type: "textarea" },
    { key: "age", label: t("recruit.form.age"), type: "number" },
    { key: "availability", label: t("recruit.form.availability"), type: "textarea" },
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
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16 grid lg:grid-cols-12 gap-12">
        <div className="lg:col-span-5">
          <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#D8CA82] mb-6">{t("recruit.newApp")}</h2>
          {!user ? (
            <LoginPrompt messageKey="recruit.loginRequired" prefix="recruit" />
          ) : (
            <form onSubmit={submit} className="space-y-5 border border-white/10 bg-[#1A1A1A] p-6" data-testid="recruit-form">
              {fields.map((f) => (
                <div key={f.key}>
                  <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{f.label}</label>
                  {f.type === "textarea" ? (
                    <textarea value={form[f.key]} onChange={set(f.key)} required rows={3} data-testid={`recruit-${f.key}-input`}
                      className="w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
                  ) : (
                    <input type={f.type} value={form[f.key]} onChange={set(f.key)} required data-testid={`recruit-${f.key}-input`}
                      className="w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
                  )}
                </div>
              ))}
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
              <ThreadsPanel collectionName="recruitThreads" canSeeAll={canSeeRecruit} emptyKey="recruit.noApps" titleField="position" prefix="recruit" />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
