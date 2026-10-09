import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, ClipboardCheck, HelpCircle, LifeBuoy, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { ThreadsPanel, LoginPrompt } from "../components/ThreadsPanel";
import { CONTACT_EMAIL } from "../lib/notify";
import { DISCORD_INVITE_URL } from "../lib/constants";
import { getHoneypotProps, isHoneypotFilled, checkSessionRateLimit, rateLimitMessage } from "../lib/antiSpam";
import { callProtected, protectedErrorMessage } from "../lib/secureForms";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { Button } from "../components/ui/button";
import { useHelpArticles } from "../hooks/useHelpArticles";
import { HELP_CATEGORIES, HELP_GAMES, helpArticleText } from "../lib/helpDefaults";
import { SocialIcon } from "../components/SocialIcon";

const CATS = ["account", "technical", "team", "other"];
const PRIOS = ["low", "normal", "high"];

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const selectCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

/* Recherche insensible aux accents et à la casse (« don » trouve « dons »). */
const fold = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export default function Support() {
  const { user, canSeeSupport } = useAuth();
  const { t, lang } = useLang();
  const { articles, isFallback } = useHelpArticles();

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState("normal");
  const [attachment, setAttachment] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [guestResult, setGuestResult] = useState(null);

  const [gameFilter, setGameFilter] = useState("all");
  const [query, setQuery] = useState("");

  /* ---- Centre d'aide : filtre par jeu + recherche plein texte ---- */
  const filtered = useMemo(() => {
    const q = fold(query.trim());
    return articles.filter((a) => {
      if (gameFilter !== "all" && a.game !== gameFilter && a.game !== "all") return false;
      if (!q) return true;
      const { question, answer } = helpArticleText(a, lang);
      return fold(question).includes(q) || fold(answer).includes(q);
    });
  }, [articles, gameFilter, query, lang]);

  const grouped = useMemo(
    () =>
      HELP_CATEGORIES.map((cat) => ({
        ...cat,
        items: filtered.filter((a) => a.category === cat.id),
      })).filter((g) => g.items.length > 0),
    [filtered]
  );

  const trackUrl = (token) => `${window.location.origin}/suivi-demande?token=${encodeURIComponent(token)}`;

  /* ---- Ticket invité : un visiteur sans compte doit pouvoir écrire ---- */
  const submitGuest = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (isHoneypotFilled(fd.get("website"))) return;
    // Miroir des bornes serveur (lib/validate.js).
    const sLen = subject.trim().length, dLen = description.trim().length;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { toast.error(t("support.guest.form.emailInvalid")); return; }
    if (sLen < 3 || sLen > 140) { toast.error(`${t("support.form.subject")} : 3–140 ${t("form.minChars")}`); return; }
    if (dLen < 10 || dLen > 3500) { toast.error(`${t("support.form.desc")} : 10–3500 ${t("form.minChars")}`); return; }
    if (attachment && !/^https?:\/\/.+/.test(attachment.trim())) { toast.error(t("support.invalidAttachment")); return; }
    const limit = checkSessionRateLimit("support_ticket_guest", { max: 3, windowMs: 10 * 60 * 1000 });
    if (!limit.allowed) { toast.error(rateLimitMessage(limit.retryAt)); return; }

    setSending(true);
    try {
      const result = await callProtected("submitSupportTicketGuest", {
        email: email.trim(),
        subject: subject.trim(),
        description: description.trim(),
        category,
        priority,
        attachment: attachment.trim(),
      });
      setGuestResult(result);
      setSubject(""); setDescription(""); setAttachment(""); setCategory("other"); setPriority("normal");
      toast.success(t("support.guest.sent"));
    } catch (err) {
      console.error(err);
      toast.error(protectedErrorMessage(err, t("common.error")));
    }
    setSending(false);
  };

  const copyTrackLink = async () => {
    if (!guestResult?.trackToken) return;
    try {
      await navigator.clipboard.writeText(trackUrl(guestResult.trackToken));
      toast.success(t("support.guest.copied"));
    } catch {
      toast.error(trackUrl(guestResult.trackToken));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (isHoneypotFilled(fd.get("website"))) return;
    // Pré-filtre UX local ; la vraie limite (quota IP/compte + CAPTCHA adaptatif)
    // est appliquée côté serveur par la Cloud Function.
    // Validation locale AVANT le quota (miroir des bornes serveur).
    const sLen = subject.trim().length, dLen = description.trim().length;
    if (sLen < 3) { toast.error(`${t("support.form.subject")} : 3 ${t("form.minChars")}`); return; }
    if (sLen > 140) { toast.error(`${t("support.form.subject")} : 140 ${t("form.maxChars")}`); return; }
    if (dLen < 10) { toast.error(`${t("support.form.desc")} : 10 ${t("form.minChars")}`); return; }
    if (dLen > 3500) { toast.error(`${t("support.form.desc")} : 3500 ${t("form.maxChars")}`); return; }
    if (attachment && !/^https?:\/\/.+/.test(attachment)) { toast.error(t("support.invalidAttachment")); return; }
    const limit = checkSessionRateLimit("support_ticket", { max: 3, windowMs: 10 * 60 * 1000 });
    if (!limit.allowed) { toast.error(rateLimitMessage(limit.retryAt)); return; }
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

      {/* DISCORD MIS EN AVANT — réponse la plus rapide, sans compte ni formulaire */}
      <section className="border-b border-white/10 bg-[#0c0c0c]" data-testid="support-discord-cta" aria-label={t("support.discord.title")}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <div className="flex-1">
            <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">{t("support.discord.title")}</p>
            <p className="text-sm text-[#c8c8c8] mt-1">{t("support.discord.sub")}</p>
          </div>
          <Button variant="gold" size="md" asChild>
            <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" data-testid="support-discord-btn">
              <SocialIcon name="discord" size={16} aria-hidden="true" /> discord.gg/RH3ZZkMJsw
            </a>
          </Button>
        </div>
      </section>

      {/* CENTRE D'AIDE — base de connaissances éditable, structurée par jeu */}
      <section className="max-w-5xl mx-auto px-4 sm:px-8 py-16" aria-labelledby="support-faq-h2" data-testid="support-faq">
        <div className="flex items-center gap-3 mb-3">
          <HelpCircle className="text-[#D8CA82]" size={20} aria-hidden="true" />
          <h2 id="support-faq-h2" className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">{t("support.faq.title")}</h2>
        </div>
        <p className="text-sm text-[#f7f7f7]/50 mb-6">{t("support.faq.sub")}</p>

        {/* Filtres : par jeu + recherche */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-8">
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("support.help.allGames")} data-testid="support-help-game-filter">
            {HELP_GAMES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGameFilter(g)}
                aria-pressed={gameFilter === g}
                data-testid={`support-help-game-${g.replace(/\s+/g, "-")}`}
                className={`focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82] text-xs font-display uppercase tracking-[0.2em] border px-3 py-1.5 transition-colors ${
                  gameFilter === g
                    ? "border-[#D8CA82] bg-[#D8CA82]/10 text-[#D8CA82]"
                    : "border-white/15 text-[#c8c8c8] hover:border-[#D8CA82]/50 hover:text-[#f7f7f7]"
                }`}
              >
                {g === "all" ? t("support.help.allGames") : g}
              </button>
            ))}
          </div>
          <div className="relative sm:w-72">
            <label htmlFor="support-help-search" className="sr-only">{t("support.help.search")}</label>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#c8c8c8]/60" aria-hidden="true" />
            <input
              id="support-help-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("support.help.searchPlaceholder")}
              data-testid="support-help-search"
              className={`${inputCls} pl-9`}
            />
          </div>
        </div>

        <p className="text-xs text-[#c8c8c8]/50 mb-6" data-testid="support-help-count">
          {filtered.length} {t("support.help.results")}
          {isFallback && ` · ${t("support.help.fallbackHint")}`}
        </p>

        {grouped.length === 0 ? (
          <p className="text-[#c8c8c8] py-6" data-testid="support-help-empty">{t("support.help.noResults")}</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-x-10 gap-y-8">
            {grouped.map((group) => (
              <div key={group.id} data-testid={`support-faq-group-${group.id}`}>
                <h3 className="text-xs font-display uppercase tracking-[0.3em] text-[#D8CA82] border-b border-white/10 pb-3 mb-2">
                  {t(group.labelKey)}
                </h3>
                <Accordion type="single" collapsible className="w-full">
                  {group.items.map((a) => {
                    const { question, answer } = helpArticleText(a, lang);
                    return (
                      <AccordionItem key={a.id} value={`a-${a.id}`} className="border-white/10" data-testid={`support-faq-item-${a.id}`}>
                        <AccordionTrigger className="text-sm text-[#f7f7f7]/90 hover:text-[#D8CA82] hover:no-underline text-left">
                          {question}
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-[#c8c8c8] leading-relaxed whitespace-pre-line">
                          {answer}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>
            ))}
          </div>
        )}

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
            <>
              {/* Un visitor sans compte n'est pas un cas marginal : c'est
                  souvent la raison de sa venue. On garde l'invitation à se
                  connecter (suivi en direct) ET on ouvre le ticket invité. */}
              <div className="mb-6">
                <LoginPrompt messageKey="support.loginRequired" prefix="support" />
              </div>

              <div className="border border-[#D8CA82]/30 bg-[#1A1A1A] p-6" data-testid="support-guest-block">
                <p className="font-display text-sm uppercase tracking-[0.25em] text-[#D8CA82] mb-3">{t("support.guest.title")}</p>
                <p className="text-sm text-[#c8c8c8] mb-5 leading-relaxed">{t("support.guest.sub")}</p>

                {guestResult ? (
                  <div className="border border-emerald-300/40 bg-emerald-300/5 p-5" role="status" data-testid="support-guest-confirm">
                    <p className="font-display text-sm uppercase tracking-[0.2em] text-emerald-300 flex items-center gap-2">
                      <ClipboardCheck size={16} aria-hidden="true" /> {t("support.guest.sent")}
                    </p>
                    <p className="text-xs text-[#c8c8c8] mt-2 leading-relaxed">
                      {guestResult.emailSent ? t("support.guest.sentSub") : t("support.guest.emailNotSent")}
                    </p>
                    <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[#c8c8c8]/60">
                      {t("support.track.reference")} : <span className="text-[#f7f7f7] font-display">{guestResult.reference}</span>
                    </p>
                    <div className="mt-3 flex flex-col gap-2">
                      <code className="text-[11px] text-[#f7f7f7]/70 bg-[#111111] border border-white/10 px-3 py-2 break-all" data-testid="support-guest-track-url">
                        {trackUrl(guestResult.trackToken)}
                      </code>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={copyTrackLink} data-testid="support-guest-copy">
                          {t("support.guest.copy")}
                        </Button>
                        <Link to={`/suivi-demande?token=${encodeURIComponent(guestResult.trackToken)}`}
                          className="inline-flex items-center gap-2 text-xs font-display uppercase tracking-widest text-[#D8CA82] hover:underline" data-testid="support-guest-track-link">
                          {t("support.guest.tracking")} <ArrowRight size={12} aria-hidden="true" />
                        </Link>
                        <button type="button" onClick={() => setGuestResult(null)}
                          className="focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82] text-xs font-display uppercase tracking-widest text-[#c8c8c8]/70 hover:text-[#f7f7f7]">
                          {t("support.guest.another")}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={submitGuest} className="space-y-4" data-testid="support-guest-form" noValidate>
                    <label htmlFor="support-guest-website" className="sr-only">Site web</label>
                    <input id="support-guest-website" type="text" {...getHoneypotProps("website")} data-testid="support-guest-honeypot" />
                    <div>
                      <label htmlFor="support-guest-email" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">
                        {t("support.guest.form.email")} <span className="text-[#D8CA82]">*</span>
                      </label>
                      <input id="support-guest-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                        placeholder="vous@exemple.fr" data-testid="support-guest-email"
                        className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="support-guest-category" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("support.form.category")}</label>
                        <select id="support-guest-category" value={category} onChange={(e) => setCategory(e.target.value)} data-testid="support-guest-category"
                          className={selectCls}>
                          {CATS.map((c) => <option key={c} value={c}>{t(`support.cat.${c}`)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="support-guest-priority" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("support.form.priority")}</label>
                        <select id="support-guest-priority" value={priority} onChange={(e) => setPriority(e.target.value)} data-testid="support-guest-priority"
                          className={selectCls}>
                          {PRIOS.map((p) => <option key={p} value={p}>{t(`support.prio.${p}`)}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="support-guest-subject" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("support.form.subject")}</label>
                      <input id="support-guest-subject" value={subject} onChange={(e) => setSubject(e.target.value)} required data-testid="support-guest-subject"
                        className={inputCls} />
                    </div>
                    <div>
                      <label htmlFor="support-guest-desc" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("support.form.desc")}</label>
                      <textarea id="support-guest-desc" value={description} onChange={(e) => setDescription(e.target.value)} required rows={5} data-testid="support-guest-desc"
                        className={inputCls} />
                    </div>
                    <div>
                      <label htmlFor="support-guest-attachment" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">
                        {t("support.form.attachment")}
                      </label>
                      <input id="support-guest-attachment" type="url" value={attachment} onChange={(e) => setAttachment(e.target.value)} placeholder="https://..." data-testid="support-guest-attachment"
                        className={inputCls} />
                    </div>
                    <Button type="submit" variant="gold" size="md" disabled={sending} data-testid="support-guest-submit">
                      {t("support.guest.send")}
                    </Button>
                  </form>
                )}
              </div>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-5 border border-white/10 bg-[#1A1A1A] p-6" data-testid="support-form" noValidate>
              <label htmlFor="support-website" className="sr-only">Site web</label>
              <input id="support-website" type="text" {...getHoneypotProps("website")} data-testid="support-honeypot" />
              <p id="support-form-error" role="alert" aria-live="polite" className="sr-only" />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="support-category" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("support.form.category")}</label>
                  <select id="support-category" value={category} onChange={(e) => setCategory(e.target.value)} data-testid="support-category-select" className={selectCls}>
                    {CATS.map((c) => <option key={c} value={c}>{t(`support.cat.${c}`)}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="support-priority" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("support.form.priority")}</label>
                  <select id="support-priority" value={priority} onChange={(e) => setPriority(e.target.value)} data-testid="support-priority-select" className={selectCls}>
                    {PRIOS.map((p) => <option key={p} value={p}>{t(`support.prio.${p}`)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="support-subject" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("support.form.subject")}</label>
                <input id="support-subject" value={subject} onChange={(e) => setSubject(e.target.value)} required data-testid="support-subject-input" className={inputCls} />
              </div>
              <div>
                <label htmlFor="support-desc" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("support.form.desc")}</label>
                <textarea id="support-desc" value={description} onChange={(e) => setDescription(e.target.value)} required rows={5} data-testid="support-desc-input" className={inputCls} />
              </div>
              <div>
                <label htmlFor="support-attachment" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("support.form.attachment")}</label>
                <input id="support-attachment" type="url" value={attachment} onChange={(e) => setAttachment(e.target.value)} placeholder="https://..." data-testid="support-attachment-input" className={inputCls} />
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