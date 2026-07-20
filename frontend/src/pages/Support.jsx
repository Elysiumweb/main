import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { ThreadsPanel, LoginPrompt } from "../components/ThreadsPanel";

export default function Support() {
  const { user, displayName, canSeeSupport } = useAuth();
  const { t } = useLang();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;
    setSending(true);
    try {
      const ref = await addDoc(collection(db, "supportThreads"), {
        uid: user.uid, name: displayName, email: user.email || "",
        subject: subject.trim(), meta: description.trim(),
        status: "open", createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, "supportThreads", ref.id, "messages"), {
        uid: user.uid, name: displayName, text: description.trim(), createdAt: serverTimestamp(),
      });
      setSubject(""); setDescription("");
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
    setSending(false);
  };

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20 relative">
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="support-title">{t("support.title")}</h1>
          <p className="text-[#f7f7f7]/50 mt-4 tracking-wide">{t("support.sub")}</p>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16 grid lg:grid-cols-12 gap-12">
        <div className="lg:col-span-5">
          <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#D8CA82] mb-6">{t("support.newTicket")}</h2>
          {!user ? (
            <LoginPrompt messageKey="support.loginRequired" prefix="support" />
          ) : (
            <form onSubmit={submit} className="space-y-5 border border-white/10 bg-[#1A1A1A] p-6" data-testid="support-form">
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("support.form.subject")}</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} required data-testid="support-subject-input"
                  className="w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("support.form.desc")}</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={5} data-testid="support-desc-input"
                  className="w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
              </div>
              <button type="submit" disabled={sending} data-testid="support-submit-btn"
                className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 disabled:opacity-50 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
                {t("support.form.submit")}
              </button>
            </form>
          )}
        </div>
        <div className="lg:col-span-7">
          {user && (
            <>
              <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#D8CA82] mb-6" data-testid="support-threads-title">
                {canSeeSupport ? t("support.allTickets") : t("support.myTickets")}
              </h2>
              <ThreadsPanel collectionName="supportThreads" canSeeAll={canSeeSupport} emptyKey="support.noTickets" titleField="subject" prefix="support" />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
