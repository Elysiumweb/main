import { useState } from "react";
import { toast } from "sonner";
import { HelpCircle, LifeBuoy } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { ThreadsPanel, LoginPrompt } from "../components/ThreadsPanel";
import { CONTACT_EMAIL } from "../lib/notify";
import { getHoneypotProps, isHoneypotFilled, checkSessionRateLimit, rateLimitMessage } from "../lib/antiSpam";
import { callProtected, protectedErrorMessage } from "../lib/secureForms";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { Button } from "../components/ui/button";

const CATS = ["account", "technical", "team", "other"];
const PRIOS = ["low", "normal", "high"];

/* Groupes de questions de la FAQ (clés i18n `support.faq.q{n}` / `a{n}`). */
const FAQ_GROUPS = [
  { key: "account", from: 1, to: 3 },
  { key: "apply", from: 4, to: 6 },
  { key: "donate", from: 7, to: 9 },
  { key: "player", from: 10, to: 12 },
  { key: "discord", from: 13, to: 15 },
];

export default function Support() {
  const { user, canSeeSupport } = useAuth();
  const { t } = useLang();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState("normal");
  const [attachment, setAttachment] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (isHoneypotFilled(fd.get("website"))) return;
    // Pré-filtre UX local ; la vraie limite (quota IP/compte + CAPTCHA adaptatif)
    // est appliquée côté serveur par la Cloud Function.
    const limit = checkSessionRateLimit("support_ticket", { max: 3, windowMs: 10 * 60 * 1000 });
    if (!limit.allowed) { toast.error(rateLimitMessage(limit.retryAt)); return; }
    if (!subject.trim() || !description.trim()) return;
    if (attachment && !/^https?:\/\/.+/.test(attachment)) { toast.error(t("support.invalidAttachment")); return; }
    setSending(true);
    try {
      await callProtected("submitSupportTicket", {
        subject: subject.trim(),
        description: description.trim(),
        category,
        priority,
        attachment: attachment.trim(),
      });
      setSubject(""); setDescription(""); setAttachment(""); setCategory("other"); setPriority("normal");
      toast.success(t("common.saved"));
    } catch (err) {
      console.error(err);
      toast.error(protectedErrorMessage(err, t("common.error")));
    }
    setSending(false);
  };

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("support.title") }]} />
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="support-title">{t("support.title")}</h1>
          <p className="text-[#c8c8c8] mt-4 tracking-wide">{t("support.sub")}</p>
        </div>
      </section>

      {/* FAQ — auto-assistance */}
      <section className="max-w-5xl mx-auto px-4 sm:px-8 py-16" aria-labelledby="support-faq-h2" data-testid="support-faq">
        <div className="flex items-center gap-3 mb-3">
          <HelpCircle className="text-[#D8CA82]" size={20} aria-hidden="true" />
          <h2 id="support-faq-h2" className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">{t("support.faq.title")}</h2>
        </div>
        <p className="text-sm text-[#f7f7f7]/50 mb-8">{t("support.faq.sub")}</p>

        <div className="grid md:grid-cols-2 gap-x-10 gap-y-8">
          {FAQ_GROUPS.map((group) => (
            <div key={group.key} data-testid={`support-faq-group-${group.key}`}>
              <h3 className="text-xs font-display uppercase tracking-[0.3em] text-[#D8CA82] border-b border-white/10 pb-3 mb-2">
                {t(`support.faq.${group.key}`)}
              </h3>
              <Accordion type="single" collapsible className="w-full">
                {Array.from({ length: group.to - group.from + 1 }, (_, i) => group.from + i).map((n) => (
                  <AccordionItem key={n} value={`q-${n}`} className="border-white/10" data-testid={`support-faq-item-${n}`}>
                    <AccordionTrigger className="text-sm text-[#f7f7f7]/90 hover:text-[#D8CA82] hover:no-underline text-left">
                      {t(`support.faq.q${n}`)}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-[#c8c8c8] leading-relaxed">
                      {t(`support.faq.a${n}`)}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}
        </div>

        <div className="mt-10 border border-[#D8CA82]/25 bg-[#D8CA82]/5 px-6 py-4 flex items-center gap-3">
          <LifeBuoy size={18} className="text-[#D8CA82] shrink-0" aria-hidden="true" />
          <p className="text-sm text-[#c8c8c8]">
            {t("support.contact")} <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#D8CA82] hover:underline">{CONTACT_EMAIL}</a>
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16 grid lg:grid-cols-12 gap-12">
        <div className="lg:col-span-5">
          <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#D8CA82] mb-6">{t("support.newTicket")}</h2>
          {!user ? (
            <LoginPrompt messageKey="support.loginRequired" prefix="support" />
          ) : (
            <form onSubmit={submit} className="space-y-5 border border-white/10 bg-[#1A1A1A] p-6" data-testid="support-form" noValidate>
              <label htmlFor="support-website" className="sr-only">Site web</label>
              <input id="support-website" type="text" {...getHoneypotProps("website")} data-testid="support-honeypot" />
              <p id="support-form-error" role="alert" aria-live="polite" className="sr-only" />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="support-category" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("support.form.category")}</label>
                  <select id="support-category" value={category} onChange={(e) => setCategory(e.target.value)} data-testid="support-category-select"
                    className="w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]">
                    {CATS.map((c) => <option key={c} value={c}>{t(`support.cat.${c}`)}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="support-priority" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("support.form.priority")}</label>
                  <select id="support-priority" value={priority} onChange={(e) => setPriority(e.target.value)} data-testid="support-priority-select"
                    className="w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]">
                    {PRIOS.map((p) => <option key={p} value={p}>{t(`support.prio.${p}`)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="support-subject" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("support.form.subject")}</label>
                <input id="support-subject" value={subject} onChange={(e) => setSubject(e.target.value)} required data-testid="support-subject-input"
                  className="w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
              </div>
              <div>
                <label htmlFor="support-desc" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("support.form.desc")}</label>
                <textarea id="support-desc" value={description} onChange={(e) => setDescription(e.target.value)} required rows={5} data-testid="support-desc-input"
                  className="w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
              </div>
              <div>
                <label htmlFor="support-attachment" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("support.form.attachment")}</label>
                <input id="support-attachment" type="url" value={attachment} onChange={(e) => setAttachment(e.target.value)} placeholder="https://..." data-testid="support-attachment-input"
                  className="w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
              </div>
              <Button type="submit" disabled={sending} data-testid="support-submit-btn" variant="gold" size="md">
                {t("support.form.submit")}
              </Button>
              <p className="text-xs text-[#c8c8c8]">
                {t("support.contact")} <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#D8CA82] hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]" data-testid="support-contact-email">{CONTACT_EMAIL}</a>
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
