import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Newspaper, ChevronDown, Star } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { markdownToText } from "../lib/markdown";

export const CATEGORIES = ["announcement", "result", "recruitment", "behind", "interview", "partner"];
const PAGE_SIZE = 9;

export const ArticleCover = ({ src, className }) => {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className={`${className} bg-background/70 flex items-center justify-center`}>
        <img src="/brand/logo-icon-gold.png" alt="" className="w-16 opacity-30" />
      </div>
    );
  }
  return <img src={src} alt="" onError={() => setErr(true)} className={`${className} object-cover`} />;
};

export default function News() {
  const { t, lang } = useLang();
  const [articles, setArticles] = useState(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [cat, setCat] = useState("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setError(false); setArticles(null);
    const q = query(collection(db, "articles"), where("status", "==", "published"));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.publishedAt?.seconds || b.createdAt?.seconds || 0) - (a.publishedAt?.seconds || a.createdAt?.seconds || 0));
      setArticles(list);
    }, (e) => { console.error(e); setError(true); });
  }, [retryKey]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [cat]);

  const filtered = (articles || []).filter((a) => cat === "all" || a.category === cat);
  const featured = filtered.find((a) => a.featured) || null;
  const rest = featured ? filtered.filter((a) => a.id !== featured.id) : filtered;

  const dateLabel = (a) =>
    (a.publishedAt || a.createdAt)?.toDate
      ? (a.publishedAt || a.createdAt).toDate().toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "long", year: "numeric" })
      : "";

  const excerpt = (a) => (a.excerpt?.trim() || markdownToText(a.content)).slice(0, 140);

  return (
    <div className="min-h-[70vh] bg-transparent">
      <section className="relative overflow-hidden pt-6 sm:pt-10">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb className="opacity-80" items={[{ label: t("news.title") }]} />
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl uppercase leading-[0.95] text-gold" data-testid="news-title">{t("news.title")}</h1>
          <p className="text-foreground/50 mt-4 tracking-wide">{t("news.sub")}</p>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        <div className="flex flex-wrap gap-2 mb-10" data-testid="news-category-filters">
          {["all", ...CATEGORIES].map((c) => (
            <button key={c} onClick={() => setCat(c)} data-testid={`news-cat-${c}`}
              className={`clip-blade-sm font-label text-[0.68rem] font-semibold uppercase tracking-[0.18em] border px-3 py-1.5 transition-colors ${cat === c ? "border-primary text-primary bg-primary/10" : "border-border/30 text-muted-foreground hover:text-foreground"}`}>
              {c === "all" ? t("media.all") : t(`news.cat.${c}`)}
            </button>
          ))}
        </div>
        {error ? (
          <ErrorState onRetry={() => setRetryKey((k) => k + 1)} testId="news-error" />
        ) : articles === null ? (
          <LoadingState testId="news-loading" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Newspaper} text={t("news.empty")} testId="news-empty" />
        ) : (
          <>
            {/* Article « à la une » */}
            {featured && (
              <Link key={featured.id} to={`/actus/${featured.id}`} data-testid={`news-featured-${featured.id}`}
                className="group relative panel clip-blade border-primary/40 hover:border-primary transition-colors overflow-hidden flex flex-col sm:flex-row mb-8 min-h-[260px]">
                <div className="sm:w-1/2 relative overflow-hidden">
                  <ArticleCover src={featured.coverUrl} className="absolute inset-0 w-full h-full" />
                </div>
                <div className="sm:w-1/2 p-8 flex flex-col justify-center relative">
                  <span className="eyebrow flex items-center gap-2">
                    <Star size={11} className="fill-primary" aria-hidden="true" /> {t("news.featured")}
                    <span aria-hidden="true">·</span> {t(`news.cat.${featured.category}`)}
                  </span>
                  <p className="font-display font-black text-2xl sm:text-3xl text-foreground mt-3 group-hover:text-primary transition-colors leading-tight">{featured.title}</p>
                  <p className="text-sm text-foreground/50 mt-3 line-clamp-3">{excerpt(featured)}{excerpt(featured).length >= 140 ? "…" : ""}</p>
                  <div className="mt-5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{dateLabel(featured)}</span>
                    <span className="text-xs uppercase tracking-widest text-primary">{t("news.readMore")} →</span>
                  </div>
                </div>
              </Link>
            )}

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="news-grid">
              {rest.slice(0, visibleCount).map((a) => (
                <Link key={a.id} to={`/actus/${a.id}`} data-testid={`news-card-${a.id}`}
                  className="group panel clip-blade-sm hover:border-primary/60 transition-colors overflow-hidden flex flex-col">
                  <ArticleCover src={a.coverUrl} className="w-full h-44" />
                  <div className="p-5 flex-1 flex flex-col">
                    <span className="text-xs font-display tracking-[0.25em] uppercase text-primary">{t(`news.cat.${a.category}`)}</span>
                    <p className="font-display font-bold text-foreground mt-2 group-hover:text-primary transition-colors">{a.title}</p>
                    <p className="text-sm text-foreground/50 mt-2 line-clamp-3">{excerpt(a)}{excerpt(a).length >= 140 ? "…" : ""}</p>
                    <div className="mt-auto pt-4 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{dateLabel(a)}</span>
                      <span className="text-xs uppercase tracking-widest text-primary/70">{t("news.readMore")} →</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {rest.length > visibleCount && (
              <div className="mt-10 flex flex-col items-center gap-3" data-testid="news-load-more">
                <button
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  data-testid="news-load-more-btn"
                  className="clip-blade-sm border border-primary/50 text-primary font-display text-xs font-bold uppercase tracking-widest px-8 py-3 flex items-center gap-2 hover:bg-primary/10 transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <ChevronDown size={14} aria-hidden="true" /> {t("news.loadMore")}
                </button>
                <p className="text-xs text-muted-foreground">
                  {Math.min(visibleCount, rest.length)} {t("news.loaded")} {rest.length}
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
