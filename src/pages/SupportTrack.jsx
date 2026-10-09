import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { MessageSquare, Search } from "lucide-react";
import { useLang } from "../lib/i18n";
import { callProtected, protectedErrorMessage } from "../lib/secureForms";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { Button } from "../components/ui/button";
import { DISCORD_INVITE_URL } from "../lib/constants";
import { SocialIcon } from "../components/SocialIcon";

const STATUS_CLS = {
  open: "text-[#D8CA82] border-[#D8CA82]/40",
  in_progress: "text-sky-300 border-sky-300/40",
  resolved: "text-emerald-300 border-emerald-300/40",
  closed: "text-[#c8c8c8] border-white/20",
};

const fmt = (iso, lang) =>
  iso
    ? new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "fr-FR", {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

/**
 * Suivi d'une demande de support ouverte SANS compte.
 * ----------------------------------------------------------------------------
 * Le lien reçu par email contient un jeton secret : il est la seule clé
 * d'accès à la conversation (Cloud Function `getGuestSupportTicket`). Sans lui,
 * un visiteur bloqué avec son compte peut enfin lire les réponses du staff sans
 * devoir s'inscrire — l'inverse rendait la page Support inaccessible au moment
 * précis où elle sert.
 */
export default function SupportTrack() {
  const { t, lang } = useLang();
  const [searchParams, setSearchParams] = useSearchParams();
  const tokenParam = searchParams.get("token") || "";
  const [input, setInput] = useState(tokenParam);
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (rawToken) => {
      const token = String(rawToken || "").trim();
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const data = await callProtected("getGuestSupportTicket", { token });
        setTicket(data);
      } catch (err) {
        console.error(err);
        setTicket(null);
        const code = String(err?.code || "");
        setError(code.endsWith("not-found") ? t("support.track.notFound") : protectedErrorMessage(err, t("common.error")));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  // Ouverture automatique depuis le lien d'email (?token=…).
  useEffect(() => {
    if (tokenParam) load(tokenParam);
  }, [tokenParam, load]);

  const submit = (e) => {
    e.preventDefault();
    setSearchParams(input.trim() ? { token: input.trim() } : {});
    load(input);
  };

  const lastUpdate = ticket?.messages?.length
    ? ticket.messages[ticket.messages.length - 1].createdAt
    : ticket?.lastUpdateAt;

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("support.title") }, { label: t("support.track.title") }]} />
          <h1 className="font-display font-black text-3xl sm:text-4xl lg:text-5xl text-[#f7f7f7] uppercase" data-testid="support-track-title">
            {t("support.track.title")}
          </h1>
          <p className="text-[#c8c8c8] mt-4 tracking-wide">{t("support.track.sub")}</p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-8 py-16">
        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3" data-testid="support-track-form">
          <div className="flex-1">
            <label htmlFor="support-track-token" className="sr-only">{t("support.track.tokenLabel")}</label>
            <input
              id="support-track-token"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("support.track.tokenLabel")}
              data-testid="support-track-input"
              className="w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]"
            />
          </div>
          <Button type="submit" variant="gold" size="md" disabled={loading} data-testid="support-track-submit">
            <Search size={14} aria-hidden="true" /> {t("support.track.open")}
          </Button>
        </form>

        {error && (
          <p className="mt-6 border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-300" role="alert" data-testid="support-track-error">
            {error}
          </p>
        )}

        {ticket && (
          <article className="mt-10 border border-white/10 bg-[#1A1A1A]" data-testid="support-track-ticket">
            <header className="px-5 py-4 border-b border-white/10 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-display text-[#D8CA82] uppercase tracking-wider text-sm truncate" data-testid="support-track-subject">
                  {ticket.subject}
                </p>
                <p className="text-xs text-[#c8c8c8]/70 mt-1">
                  {t("support.track.reference")} : <span className="text-[#f7f7f7]">{ticket.reference}</span>
                  {" · "}
                  {t("support.track.openedOn")} {fmt(ticket.createdAt, lang)}
                </p>
              </div>
              <span className={`text-xs uppercase tracking-widest border px-2 py-0.5 ${STATUS_CLS[ticket.status] || STATUS_CLS.open}`} data-testid="support-track-status">
                {t(`status.${ticket.status}`)}
              </span>
            </header>

            <div className="px-5 py-4 border-b border-white/10 text-xs text-[#c8c8c8]/70">
              {t("support.track.lastUpdate")} : {fmt(lastUpdate, lang)}
              {ticket.status === "resolved" && <span className="block mt-1 text-emerald-300">{t("support.track.closed")}</span>}
            </div>

            <div className="px-5 py-5 space-y-4" data-testid="support-track-messages">
              <p className="text-xs uppercase tracking-[0.3em] text-[#D8CA82] flex items-center gap-2">
                <MessageSquare size={13} aria-hidden="true" /> {t("support.track.messages")}
              </p>
              {(ticket.messages || []).map((m, i) => (
                <div key={i} className={`max-w-[85%] border p-4 ${m.from === "staff" ? "border-[#D8CA82]/30 bg-[#141414] ml-auto" : "border-white/10 bg-[#111111]"}`}>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8]/60 mb-1.5">
                    {m.from === "staff" ? t("support.track.staff") : t("support.track.you")} · {fmt(m.createdAt, lang)}
                  </p>
                  <p className="text-sm text-[#f7f7f7]/90 whitespace-pre-line leading-relaxed">{m.text}</p>
                </div>
              ))}
            </div>
          </article>
        )}

        <div className="mt-10 border border-white/10 bg-[#141414] p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="font-display text-sm uppercase tracking-[0.25em] text-[#D8CA82]">{t("support.guest.discordCta")}</p>
            <p className="text-sm text-[#c8c8c8] mt-1">{t("support.guest.discordSub")}</p>
          </div>
          <Button variant="outline" size="md" asChild>
            <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" data-testid="support-track-discord">
              <SocialIcon name="discord" size={16} aria-hidden="true" /> Discord
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}