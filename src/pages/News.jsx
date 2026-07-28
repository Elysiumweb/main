import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Newspaper } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { ErrorState, EmptyState } from "../components/States";
import { SkeletonGrid, SkeletonArticleCard } from "../components/Skeletons";
import { Pagination, usePagination } from "../components/Pagination";
import { BrandImage, RATIOS } from "../components/BrandImage";
import { PageBreadcrumb } from "../components/PageBreadcrumb";

export const CATEGORIES = ["announcement", "result", "recruitment", "behind", "interview", "partner"];

/**
 * Couverture d'article — ratio fixe (16/9 par défaut), recadrage uniforme
 * et image de repli marque si l'URL est absente ou cassée.
 */
export const ArticleCover = ({ src, className = "", ratio = RATIOS.card, alt = "" }) => (
  <BrandImage src={src} alt={alt} ratio={ratio} className={`w-full ${className}`} />
);

export default function News() {
  const { t } = useLang();
  const [articles, setArticles] = useState(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [cat, setCat] = useState("all");

  useEffect(() => {
    setError(false); setArticles(null);
    const q = query(collection(db, "articles"), where("status", "==", "published"));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.publishedAt?.seconds || b.createdAt?.seconds || 0) - (a.publishedAt?.seconds || a.createdAt?.seconds || 0));
      setArticles(list);
    }, (e) => { console.error(e); setError(true); });
  }, [retryKey]);

  const filtered = (articles || []).filter((a) => cat === "all" || a.category === cat);
  const pager = usePagination(filtered, 9, cat);

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("news.title") }]} />
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="news-title">{t("news.title")}</h1>
          <p className="text-[#f7f7f7]/50 mt-4 tracking-wide">{t("news.sub")}</p>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        <div className="flex flex-wrap gap-2 mb-10" data-testid="news-category-filters">
          {["all", ...CATEGORIES].map((c) => (
            <button key={c} onClick={() => setCat(c)} data-testid={`news-cat-${c}`}
              aria-pressed={cat === c}
              className={`text-[11px] uppercase tracking-[0.2em] border px-3.5 py-2 min-h-[40px] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D8CA82] ${cat === c ? "border-[#D8CA82] text-[#D8CA82] bg-[#D8CA82]/10 font-semibold" : "border-white/15 text-[#c8c8c8] hover:text-[#f7f7f7] hover:border-white/40"}`}>
              {c === "all" ? t("media.all") : t(`news.cat.${c}`)}
            </button>
          ))}
        </div>
        {error ? (
          <ErrorState onRetry={() => setRetryKey((k) => k + 1)} testId="news-error" />
        ) : articles === null ? (
          <SkeletonGrid count={6} Card={SkeletonArticleCard} testId="news-loading" label={t("common.loading")} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Newspaper} text={t("news.empty")} testId="news-empty" />
        ) : (
          <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="news-grid">
            {pager.items.map((a) => (
              <Link key={a.id} to={`/actus/${a.id}`} data-testid={`news-card-${a.id}`}
                className="group border border-white/10 bg-[#1A1A1A] hover:border-[#D8CA82]/60 transition-colors overflow-hidden flex flex-col">
                <ArticleCover src={a.coverUrl} alt="" />
                <div className="p-5 flex-1 flex flex-col">
                  <span className="text-[10px] font-display tracking-[0.25em] uppercase text-[#D8CA82]">{t(`news.cat.${a.category}`)}</span>
                  <p className="font-display font-bold text-[#f7f7f7] mt-2 group-hover:text-[#D8CA82] transition-colors">{a.title}</p>
                  <p className="text-sm text-[#f7f7f7]/50 mt-2 line-clamp-3">{a.content}</p>
                  <div className="mt-auto pt-4 flex items-center justify-between">
                    <span className="text-xs text-[#f7f7f7]/30">
                      {(a.publishedAt || a.createdAt)?.toDate ? (a.publishedAt || a.createdAt).toDate().toLocaleDateString("fr-FR") : ""}
                    </span>
                    <span className="text-[10px] uppercase tracking-widest text-[#D8CA82]/70">{t("news.readMore")} →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <Pagination {...pager} testId="news-pagination" label="articles" />
          </>
        )}
      </section>
    </div>
  );
}
