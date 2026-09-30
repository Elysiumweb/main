import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { Mail, ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { useSEO } from "../lib/useSEO";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { PageBreadcrumb } from "../components/PageBreadcrumb";

/**
 * Archives publiques de la newsletter.
 * ----------------------------------------------------------------------------
 * Chaque digest envoyé via `sendNewsletterDigest` est archivé (version
 * assainie : sujet, contenu, nombre de destinataires) dans la collection
 * publique `newsletterArchive`. Cette page rend cet historique lisible en
 * ligne — utile pour le SEO et pour rassurer les futurs abonnés sur le
 * contenu réel de la newsletter.
 */
export default function NewsletterArchives() {
  const { t, lang } = useLang();
  const [digests, setDigests] = useState(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    setError(false); setDigests(null);
    return onSnapshot(collection(db, "newsletterArchive"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.sentAt?.seconds || b.createdAt?.seconds || 0) - (a.sentAt?.seconds || a.createdAt?.seconds || 0));
      setDigests(list);
    }, (e) => { console.error(e); setError(true); });
  }, [retryKey]);

  useSEO({
    title: `${t("newsletter.archives.title")} — ELYSIUM Esport`,
    description: t("newsletter.archives.sub"),
    url: "/newsletter/archives",
  });

  const fmtDate = (d) => {
    const ts = d.sentAt || d.createdAt;
    return ts?.toDate
      ? ts.toDate().toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "long", year: "numeric" })
      : "";
  };

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-4xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("newsletter.title"), to: "/newsletter" }, { label: t("newsletter.archives.title") }]} />
          <div className="flex items-center gap-3">
            <Mail className="text-[#D8CA82]" size={26} aria-hidden="true" />
            <h1 className="font-display font-black text-3xl sm:text-4xl lg:text-5xl text-[#f7f7f7] uppercase" data-testid="newsletter-archives-title">
              {t("newsletter.archives.title")}
            </h1>
          </div>
          <p className="text-[#c8c8c8] mt-4 tracking-wide max-w-2xl">{t("newsletter.archives.sub")}</p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 sm:px-8 py-12">
        {error ? (
          <ErrorState onRetry={() => setRetryKey((k) => k + 1)} testId="newsletter-archives-error" />
        ) : digests === null ? (
          <LoadingState testId="newsletter-archives-loading" />
        ) : digests.length === 0 ? (
          <EmptyState icon={Mail} text={t("newsletter.archives.empty")} testId="newsletter-archives-empty" />
        ) : (
          <ul className="space-y-3" data-testid="newsletter-archives-list">
            {digests.map((d) => {
              const open = openId === d.id;
              const sent = typeof d.sent === "number" ? d.sent : null;
              return (
                <li
                  key={d.id}
                  className={`border transition-colors ${open ? "border-[#D8CA82]/40 bg-[#1A1A1A]" : "border-white/10 bg-[#1A1A1A] hover:border-[#D8CA82]/30"}`}
                  data-testid={`newsletter-archive-${d.id}`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : d.id)}
                    aria-expanded={open}
                    data-testid={`newsletter-archive-toggle-${d.id}`}
                    className="w-full flex items-center gap-3 px-4 sm:px-6 py-4 text-left"
                  >
                    {open ? (
                      <ChevronDown size={14} className="text-[#D8CA82] shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronRight size={14} className="text-[#D8CA82] shrink-0" aria-hidden="true" />
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block font-display font-bold text-[#f7f7f7] truncate">{d.subject}</span>
                      <span className="block text-xs text-[#c8c8c8] mt-1">
                        {fmtDate(d)}
                        {sent !== null && ` · ${t("newsletter.archives.recipients", { count: sent })}`}
                      </span>
                    </span>
                  </button>
                  {open && (
                    <div className="px-4 sm:px-6 pb-5 border-t border-white/10 pt-4" data-testid={`newsletter-archive-body-${d.id}`}>
                      <p className="text-sm text-[#f7f7f7]/75 whitespace-pre-line break-words">{d.body}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-12">
          <Link
            to="/newsletter"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#f7f7f7]/50 hover:text-[#D8CA82] transition-colors"
            data-testid="newsletter-archives-back"
          >
            <ArrowLeft size={14} aria-hidden="true" /> {t("newsletter.archives.back")}
          </Link>
        </div>
      </section>
    </div>
  );
}
