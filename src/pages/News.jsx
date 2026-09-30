import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Newspaper, ChevronDown, Star, Clock, Languages } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { GAMES } from "../lib/constants";
import { useRosters } from "../hooks/useRosters";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { FiltersBar } from "../components/FiltersBar";
import { markdownToText } from "../lib/markdown";
import {
  localizedArticle,
  readingTimeMinutes,
  articleMatchesQuery,
  articleDate,
} from "../lib/articles";

export const CATEGORIES = ["announcement", "result", "recruitment", "behind", "interview", "partner"];
const PAGE_SIZE = 9;

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
  const { t, lang } = useLang();
  const { allNames: rosterNames } = useRosters();
  const [searchParams, setSearchParams] = useSearchParams();
  const [articles, setArticles] = useState(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [cat, setCat] = useState("all");
  const [search, setSearch] = useState("");
  const [game, setGame] = useState("all");
  const [roster, setRoster] = useState("all");
  // Le filtre par tag est partageable via l'URL (/actus?tag=lan) : les cartes
  // d'article et le pied d'article pointent ici directement filtrées.
  const urlTag = searchParams.get("tag");
  const [tag, setTag] = useState(urlTag || "all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => { setTag(urlTag || "all"); }, [urlTag]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [cat, search, game, roster, tag]);

  const onTagChange = (next) => {
    setTag(next);
    setSearchParams(next && next !== "all" ? { tag: next } : {}, { replace: true });
  };

  const allTags = useMemo(() => {
    const counts = new Map();
    (articles || []).forEach((a) =>
      (Array.isArray(a.tags) ? a.tags : []).forEach((tg) => {
        const key = String(tg);
        counts.set(key, (counts.get(key) || 0) + 1);
      })
    );
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([name]) => name);
  }, [articles]);

  const filtered = (articles || []).filter((a) => {
    if (cat !== "all" && a.category !== cat) return false;
    if (game !== "all" && a.game !== game) return false;
    if (roster !== "all" && a.roster !== roster) return false;
    if (tag !== "all" && !(Array.isArray(a.tags) ? a.tags : []).includes(tag)) return false;
    return articleMatchesQuery(a, search);
  });
  const featured = filtered.find((a) => a.featured) || null;
  const rest = featured ? filtered.filter((a) => a.id !== featured.id) : filtered;

  const dateLabel = (a) => {
    const ts = articleDate(a);
    return ts?.toDate
      ? ts.toDate().toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "long", year: "numeric" })
      : "";
  };

  const localized = (a) => localizedArticle(a, lang);
  const excerpt = (a) => {
    const l = localized(a);
    return (l.excerpt.trim() || markdownToText(l.content)).slice(0, 140);
  };
  const minutes = (a) => readingTimeMinutes(localized(a).content);

  const hasActiveFilters =
    cat !== "all" || game !== "all" || roster !== "all" || tag !== "all" || search.trim() !== "";
  const resetFilters = () => {
    setCat("all"); setSearch(""); setGame("all"); setRoster("all");
    onTagChange("all");
  };

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
        <div className="flex flex-wrap gap-2 mb-6" data-testid="news-category-filters">
          {["all", ...CATEGORIES].map((c) => (
            <button key={c} onClick={() => setCat(c)} data-testid={`news-cat-${c}`}
              className={`text-xs uppercase tracking-[0.2em] border px-3 py-1.5 transition-colors ${cat === c ? "border-[#D8CA82] text-[#D8CA82] bg-[#D8CA82]/10" : "border-white/15 text-[#f7f7f7]/50 hover:text-[#f7f7f7]"}`}>
              {c === "all" ? t("media.all") : t(`news.cat.${c}`)}
            </button>
          ))}
        </div>

        {/* Barre de filtres commune (D-08) : recherche, jeu/roster, tags */}
        <FiltersBar
          testId="news-filters"
          search={{ value: search, onChange: setSearch, placeholder: t("news.search") }}
          selects={[
            {
              testId: "news-filter-game",
              label: t("news.filter.game"),
              value: game,
              onChange: setGame,
              options: [
                { value: "all", label: `${t("news.filter.game")} : ${t("media.all")}` },
                ...GAMES.map((g) => ({ value: g, label: g })),
              ],
            },
            {
              testId: "news-filter-roster",
              label: t("news.filter.roster"),
              value: roster,
              onChange: setRoster,
              options: [
                { value: "all", label: `${t("news.filter.roster")} : ${t("media.all")}` },
                ...rosterNames.map((r) => ({ value: r, label: r })),
              ],
            },
          ]}
          tags={{ items: allTags, active: tag, onChange: onTagChange, label: t("news.tags") }}
          resultLabel={`${filtered.length} ${t("news.resultsCount")}`}
          hasActiveFilters={hasActiveFilters}
          onReset={resetFilters}
          resetLabel={t("news.filters.reset")}
        />

        {error ? (
          <ErrorState onRetry={() => setRetryKey((k) => k + 1)} testId="news-error" />
        ) : articles === null ? (
          <LoadingState testId="news-loading" />
        ) : filtered.length === 0 ? (
          hasActiveFilters ? (
            <EmptyState icon={Newspaper} text={t("news.noResults")} testId="news-no-results" />
          ) : (
            <EmptyState icon={Newspaper} text={t("news.empty")} testId="news-empty" />
          )
        ) : (
          <>
            {/* Article « à la une » */}
            {featured && (
              <Link key={featured.id} to={`/actus/${featured.id}`} data-testid={`news-featured-${featured.id}`}
                className="group relative border border-[#D8CA82]/40 bg-[#1A1A1A] hover:border-[#D8CA82] transition-colors overflow-hidden flex flex-col sm:flex-row mb-8 min-h-[260px]">
                <div className="sm:w-1/2 relative overflow-hidden">
                  <ArticleCover src={featured.coverUrl} className="absolute inset-0 w-full h-full" />
                </div>
                <div className="sm:w-1/2 p-8 flex flex-col justify-center relative">
                  <span className="text-xs font-display tracking-[0.25em] uppercase text-[#D8CA82] flex items-center gap-2 flex-wrap">
                    <Star size={11} className="fill-[#D8CA82]" aria-hidden="true" /> {t("news.featured")}
                    <span aria-hidden="true">·</span> {t(`news.cat.${featured.category}`)}
                    {lang === "en" && !localized(featured).translated && (
                      <span className="inline-flex items-center gap-1 border border-orange-300/40 text-orange-300 px-1.5" title={t("news.untranslatedNote")}>
                        <Languages size={10} aria-hidden="true" /> {t("news.untranslatedBadge")}
                      </span>
                    )}
                  </span>
                  <p className="font-display font-black text-2xl sm:text-3xl text-[#f7f7f7] mt-3 group-hover:text-[#D8CA82] transition-colors leading-tight">{localized(featured).title}</p>
                  <p className="text-sm text-[#f7f7f7]/50 mt-3 line-clamp-3">{excerpt(featured)}{excerpt(featured).length >= 140 ? "…" : ""}</p>
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <span className="text-xs text-[#c8c8c8] flex items-center gap-3 flex-wrap">
                      {dateLabel(featured)}
                      <span className="inline-flex items-center gap-1"><Clock size={11} aria-hidden="true" /> {minutes(featured)} {t("news.readingTimeShort")}</span>
                    </span>
                    <span className="text-xs uppercase tracking-widest text-[#D8CA82]">{t("news.readMore")} →</span>
                  </div>
                </div>
              </Link>
            )}

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="news-grid">
              {rest.slice(0, visibleCount).map((a) => (
                <Link key={a.id} to={`/actus/${a.id}`} data-testid={`news-card-${a.id}`}
                  className="group border border-white/10 bg-[#1A1A1A] hover:border-[#D8CA82]/60 transition-colors overflow-hidden flex flex-col">
                  <ArticleCover src={a.coverUrl} className="w-full h-44" />
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-display tracking-[0.25em] uppercase text-[#D8CA82]">{t(`news.cat.${a.category}`)}</span>
                      {lang === "en" && !localized(a).translated && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest border border-orange-300/40 text-orange-300 px-1.5 py-0.5" title={t("news.untranslatedNote")} data-testid={`news-untranslated-${a.id}`}>
                          <Languages size={10} aria-hidden="true" /> {t("news.untranslatedBadge")}
                        </span>
                      )}
                    </div>
                    <p className="font-display font-bold text-[#f7f7f7] mt-2 group-hover:text-[#D8CA82] transition-colors">{localized(a).title}</p>
                    <p className="text-sm text-[#f7f7f7]/50 mt-2 line-clamp-3">{excerpt(a)}{excerpt(a).length >= 140 ? "…" : ""}</p>
                    {(Array.isArray(a.tags) ? a.tags : []).length > 0 && (
                      <p className="mt-3 flex flex-wrap gap-1.5" data-testid={`news-tags-${a.id}`}>
                        {(Array.isArray(a.tags) ? a.tags : []).slice(0, 3).map((tg) => (
                          <span key={tg} className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/40 border border-white/10 px-1.5 py-0.5">#{tg}</span>
                        ))}
                      </p>
                    )}
                    <div className="mt-auto pt-4 flex items-center justify-between gap-3">
                      <span className="text-xs text-[#c8c8c8] flex items-center gap-2">
                        {dateLabel(a)}
                        <span className="inline-flex items-center gap-1"><Clock size={11} aria-hidden="true" /> {minutes(a)} {t("news.readingTimeShort")}</span>
                      </span>
                      <span className="text-xs uppercase tracking-widest text-[#D8CA82]/70">{t("news.readMore")} →</span>
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
                  className="border border-[#D8CA82]/50 text-[#D8CA82] text-xs font-display font-bold uppercase tracking-widest px-8 py-3 flex items-center gap-2 hover:bg-[#D8CA82]/10 transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
                >
                  <ChevronDown size={14} aria-hidden="true" /> {t("news.loadMore")}
                </button>
                <p className="text-xs text-[#c8c8c8]">
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
