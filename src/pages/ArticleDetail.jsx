import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, onSnapshot, collection, query, where } from "firebase/firestore";
import { ArrowLeft, Clock, ListTree, Languages } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { useArticleSEO, SITE_URL } from "../lib/useSEO";
import { LoadingState } from "../components/States";
import { ArticleCover } from "./News";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { Markdown, extractHeadings } from "../lib/markdown";
import { ShareButtons } from "../components/ShareButtons";
import { ArticleComments } from "../components/ArticleComments";
import {
  localizedArticle,
  readingTimeMinutes,
  relatedArticles,
  articleAuthor,
  articleDate,
} from "../lib/articles";

/** Sommaire de l'article : sticky sur desktop, repliable sur mobile. */
const TableOfContents = ({ headings }) => {
  const { t } = useLang();
  if (headings.length === 0) return null;
  return (
    <nav aria-label={t("news.toc")} data-testid="article-toc" className="border border-white/10 bg-[#1A1A1A]">
      <p className="flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-[#D8CA82] px-4 py-3 border-b border-white/10">
        <ListTree size={13} aria-hidden="true" /> {t("news.toc")}
      </p>
      <ul className="p-2">
        {headings.map((h) => (
          <li key={h.id} className={h.level === 3 ? "pl-4" : ""}>
            <a
              href={`#${h.id}`}
              className="block text-sm text-[#f7f7f7]/60 hover:text-[#D8CA82] transition-colors px-2 py-1.5 truncate"
              title={h.text}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default function ArticleDetail() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const { role, isOfficial } = useAuth();
  const isBureau = isOfficial || role === "bureau";
  const [article, setArticle] = useState(undefined);
  const [allArticles, setAllArticles] = useState([]);

  useEffect(() => {
    return onSnapshot(doc(db, "articles", id),
      (s) => setArticle(s.exists() ? { id: s.id, ...s.data() } : null),
      (e) => { console.error(e); setArticle(null); });
  }, [id]);

  // Articles liés : on écoute les articles publiés pour le bloc « À lire ensuite ».
  useEffect(() => {
    if (!article || article.status !== "published") return;
    return onSnapshot(query(collection(db, "articles"), where("status", "==", "published")),
      (snap) => setAllArticles(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {});
  }, [article?.status, article?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const localized = article ? localizedArticle(article, lang) : null;
  const headings = article ? extractHeadings(localized.content) : [];
  const minutes = article ? readingTimeMinutes(localized.content) : 0;
  const related = article ? relatedArticles(article, allArticles, { limit: 3 }) : [];
  const author = article ? articleAuthor(article, t("news.defaultAuthor")) : "";

  useArticleSEO(article && article.id ? article : null);

  if (article === undefined) return <LoadingState testId="article-loading" />;
  if (article === null || article.status === "deleted") return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6">
      <p className="text-[#f7f7f7]/50" data-testid="article-not-found">{t("news.notFound")}</p>
      <Link to="/actus" className="text-[#D8CA82] text-sm uppercase tracking-widest hover:underline">← {t("news.back")}</Link>
    </div>
  );

  const publishedTs = articleDate(article);

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-6">
        <PageBreadcrumb items={[{ label: t("nav.news"), to: "/actus" }, { label: localized.title }]} />
      </div>
      <section className="relative border-b border-white/10 overflow-hidden">
        <ArticleCover src={article.coverUrl} className="w-full h-64 sm:h-80 opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#111111] via-[#111111]/40 to-transparent" />
        <div className="absolute bottom-0 inset-x-0">
          <div className="max-w-4xl mx-auto px-4 sm:px-8 pb-10">
            <Link to="/actus" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#f7f7f7]/60 hover:text-[#D8CA82] transition-colors mb-4" data-testid="article-back-link">
              <ArrowLeft size={14} /> {t("news.back")}
            </Link>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-display tracking-[0.25em] uppercase text-[#D8CA82] border border-[#D8CA82]/40 px-2 py-0.5">{t(`news.cat.${article.category}`)}</span>
              {article.status === "draft" && (
                <span className="text-xs font-display tracking-[0.25em] uppercase text-orange-300 border border-orange-300/40 px-2 py-0.5" data-testid="article-draft-badge">{t("news.draftBadge")}</span>
              )}
              {article.status === "scheduled" && (
                <span className="text-xs font-display tracking-[0.25em] uppercase text-sky-300 border border-sky-300/40 px-2 py-0.5" data-testid="article-scheduled-badge">{t("news.scheduledBadge")}</span>
              )}
              {lang === "en" && !localized.translated && (
                <span className="inline-flex items-center gap-1 text-xs font-display tracking-[0.25em] uppercase text-orange-300 border border-orange-300/40 px-2 py-0.5" data-testid="article-untranslated-badge">
                  <Languages size={11} aria-hidden="true" /> {t("news.untranslatedBadge")}
                </span>
              )}
            </div>
            <h1 className="font-display font-black text-3xl sm:text-4xl lg:text-5xl text-[#f7f7f7] mt-3" data-testid="article-title">{localized.title}</h1>
            {/* Byline : auteur, date, temps de lecture */}
            <div className="flex items-center gap-x-4 gap-y-2 flex-wrap mt-4 text-xs text-[#c8c8c8]" data-testid="article-byline">
              <span className="uppercase tracking-widest">{t("news.by")} <span className="text-[#f7f7f7]/80">{author}</span></span>
              {publishedTs?.toDate && (
                <span>
                  {publishedTs.toDate().toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                  {article.status === "scheduled" && ` · ${t("news.scheduledFor")} ${publishedTs.toDate().toLocaleString(lang === "en" ? "en-US" : "fr-FR", { dateStyle: "medium", timeStyle: "short" })}`}
                </span>
              )}
              {minutes > 0 && (
                <span className="inline-flex items-center gap-1.5" data-testid="article-reading-time">
                  <Clock size={12} aria-hidden="true" /> {t("news.readingTime", { min: minutes })}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {lang === "en" && !localized.translated && (
        <div className="max-w-4xl mx-auto px-4 sm:px-8 mt-6">
          <p className="border border-orange-300/30 bg-orange-300/5 text-orange-200/80 text-xs px-4 py-3" data-testid="article-untranslated-note">
            {t("news.untranslatedNote")}
          </p>
        </div>
      )}

      <section className="max-w-6xl mx-auto px-4 sm:px-8 py-12">
        <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] gap-12">
          {/* Sommaire : sticky sur grand écran, avant le contenu sur mobile */}
          {headings.length > 0 && (
            <aside className="mb-8 lg:mb-0">
              <div className="lg:sticky lg:top-24">
                <TableOfContents headings={headings} />
              </div>
            </aside>
          )}
          <div>
            <div className="max-w-4xl text-[#f7f7f7]/85 leading-relaxed text-base sm:text-lg" data-testid="article-content">
              <Markdown source={localized.content} />
            </div>

            {(Array.isArray(article.tags) ? article.tags : []).length > 0 && (
              <div className="max-w-4xl mt-8 flex flex-wrap items-center gap-2" data-testid="article-tags">
                <span className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/40">{t("news.tags")}</span>
                {article.tags.map((tg) => (
                  <Link
                    key={tg}
                    to={`/actus?tag=${encodeURIComponent(tg)}`}
                    className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/60 border border-white/10 px-2 py-1 hover:border-[#D8CA82]/50 hover:text-[#D8CA82] transition-colors"
                  >
                    #{tg}
                  </Link>
                ))}
              </div>
            )}

            <div className="max-w-4xl mt-12 pt-6 border-t border-white/10 flex items-center justify-between gap-4 flex-wrap" data-testid="article-share">
              <ShareButtons
                url={`${SITE_URL}/actus/${article.id}`}
                text={localized.title}
                title={`${t("share.label")} : ${localized.title}`}
                testId="article-share-buttons"
              />
              <Link to="/actus" className="text-xs uppercase tracking-widest text-[#f7f7f7]/50 hover:text-[#D8CA82] transition-colors">
                ← {t("news.back")}
              </Link>
            </div>

            {/* Réactions / commentaires modérés */}
            {article.status === "published" && (
              <div className="max-w-4xl mt-12">
                <ArticleComments articleId={article.id} canModerate={isBureau} />
              </div>
            )}

            {/* Articles liés */}
            {related.length > 0 && (
              <div className="max-w-4xl mt-16" data-testid="article-related">
                <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82] mb-6">{t("news.related")}</p>
                <div className="grid sm:grid-cols-3 gap-5">
                  {related.map((a) => {
                    const rl = localizedArticle(a, lang);
                    return (
                      <Link
                        key={a.id}
                        to={`/actus/${a.id}`}
                        data-testid={`article-related-${a.id}`}
                        className="group border border-white/10 bg-[#1A1A1A] hover:border-[#D8CA82]/60 transition-colors overflow-hidden flex flex-col"
                      >
                        <ArticleCover src={a.coverUrl} className="w-full h-32" />
                        <div className="p-4 flex-1 flex flex-col">
                          <span className="text-[10px] font-display tracking-[0.25em] uppercase text-[#D8CA82]">{t(`news.cat.${a.category}`)}</span>
                          <p className="text-sm font-display font-bold text-[#f7f7f7] mt-2 group-hover:text-[#D8CA82] transition-colors line-clamp-3">{rl.title}</p>
                          {readingTimeMinutes(rl.content) > 0 && (
                            <span className="mt-auto pt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[#c8c8c8]">
                              <Clock size={10} aria-hidden="true" /> {readingTimeMinutes(rl.content)} {t("news.readingTimeShort")}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
