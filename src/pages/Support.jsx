import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { ThreadsPanel, LoginPrompt } from "../components/ThreadsPanel";
import { createNotification, CONTACT_EMAIL } from "../lib/notify";

const CATS = ["account", "technical", "team", "other"];
const PRIOS = ["low", "normal", "high"];

export default function Support() {
  const { user, displayName, canSeeSupport } = useAuth();
  const { t } = useLang();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState("normal");
  const [attachment, setAttachment] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;
    if (attachment && !/^https?:\/\/.+/.test(attachment)) { toast.error("URL de pièce jointe invalide"); return; }
    setSending(true);
    try {
      const meta = `[${t(`support.cat.${category}`)} · ${t(`support.prio.${priority}`)}]\n${description.trim()}${attachment ? `\n📎 ${attachment}` : ""}`;
      const ref = await addDoc(collection(db, "supportThreads"), {
        uid: user.uid, name: displayName, email: user.email || "",
        subject: subject.trim(), meta, category, priority, attachment: attachment.trim(),
        status: "open", createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, "supportThreads", ref.id, "messages"), {
        uid: user.uid, name: displayName, text: meta, createdAt: serverTimestamp(),
      });
      createNotification({ targetRoles: ["bureau"], type: "support_new", extra: subject.trim(), link: "/support" });
      setSubject(""); setDescription(""); setAttachment(""); setCategory("other"); setPriority("normal");
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("support.form.category")}</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="support-category-select"
                    className="w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]">
                    {CATS.map((c) => <option key={c} value={c}>{t(`support.cat.${c}`)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("support.form.priority")}</label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value)} data-testid="support-priority-select"
                    className="w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]">
                    {PRIOS.map((p) => <option key={p} value={p}>{t(`support.prio.${p}`)}</option>)}
                  </select>
                </div>
              </div>
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
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("support.form.attachment")}</label>
                <input value={attachment} onChange={(e) => setAttachment(e.target.value)} placeholder="https://..." data-testid="support-attachment-input"
                  className="w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
              </div>
              <button type="submit" disabled={sending} data-testid="support-submit-btn"
                className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 disabled:opacity-50 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
                {t("support.form.submit")}
              </button>
              <p className="text-xs text-[#f7f7f7]/40">
                {t("support.contact")} <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#D8CA82] hover:underline" data-testid="support-contact-email">{CONTACT_EMAIL}</a>
              </p>
            </form>
          )}
        </div>
        <div className="lg:col-span-7">
          {user && (
            <>
              <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#D8CA82] mb-6" data-testid="support-threads-title">
                {canSeeSupport ? t("support.allTickets") : t("support.myTickets")}
              </h2>
              <ThreadsPanel collectionName="supportThreads" canSeeAll={canSeeSupport} emptyKey="support.noTickets" titleField="subject" prefix="support"
                statusOptions={["open", "in_progress", "resolved"]} canSetStatus={canSeeSupport} />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
