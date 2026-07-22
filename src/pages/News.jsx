import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Newspaper } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { LoadingState, ErrorState, EmptyState } from "../components/States";

export const CATEGORIES = ["announcement", "result", "recruitment", "behind", "interview", "partner"];

export const ArticleCover = ({ src, className }) => {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className={`${className} bg-[#0d0d0d] flex items-center justify-center`}>
        <img src="/brand/logo-icon-gold.png" alt="" className="w-16 opacity-30" />
      </div>
    );
  }
  return <img src={src} alt="" onError={() => setErr(true)} className={`${className} object-cover`} />;
};

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

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20 relative">
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="news-title">{t("news.title")}</h1>
          <p className="text-[#f7f7f7]/50 mt-4 tracking-wide">{t("news.sub")}</p>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        <div className="flex flex-wrap gap-2 mb-10" data-testid="news-category-filters">
          {["all", ...CATEGORIES].map((c) => (
            <button key={c} onClick={() => setCat(c)} data-testid={`news-cat-${c}`}
              className={`text-[11px] uppercase tracking-[0.2em] border px-3 py-1.5 transition-colors ${cat === c ? "border-[#D8CA82] text-[#D8CA82] bg-[#D8CA82]/10" : "border-white/15 text-[#f7f7f7]/50 hover:text-[#f7f7f7]"}`}>
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="news-grid">
            {filtered.map((a) => (
              <Link key={a.id} to={`/actus/${a.id}`} data-testid={`news-card-${a.id}`}
                className="group border border-white/10 bg-[#1A1A1A] hover:border-[#D8CA82]/60 transition-colors overflow-hidden flex flex-col">
                <ArticleCover src={a.coverUrl} className="w-full h-44" />
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
        )}
      </section>
    </div>
  );
}
