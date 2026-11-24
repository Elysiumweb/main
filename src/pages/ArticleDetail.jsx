import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { ArrowLeft } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { useArticleSEO, SITE_URL } from "../lib/useSEO";
import { LoadingState } from "../components/States";
import { ArticleCover } from "./News";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { Markdown } from "../lib/markdown";
import { ShareButtons } from "../components/ShareButtons";

export default function ArticleDetail() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const [article, setArticle] = useState(undefined);

  useEffect(() => {
    return onSnapshot(doc(db, "articles", id),
      (s) => setArticle(s.exists() ? { id: s.id, ...s.data() } : null),
      (e) => { console.error(e); setArticle(null); });
  }, [id]);

  useArticleSEO(article && article.id ? article : null);

  if (article === undefined) return <LoadingState testId="article-loading" />;
  if (article === null || article.status === "deleted") return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6">
      <p className="text-foreground/50" data-testid="article-not-found">{t("news.notFound")}</p>
      <Link to="/actus" className="text-primary text-sm uppercase tracking-widest hover:underline">← {t("news.back")}</Link>
    </div>
  );

  return (
    <div className="min-h-[70vh] bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-6">
        <PageBreadcrumb className="opacity-80" items={[{ label: t("nav.news"), to: "/actus" }, { label: article.title }]} />
      </div>
      <section className="relative overflow-hidden pt-6 sm:pt-10">
        <ArticleCover src={article.coverUrl} className="w-full h-64 sm:h-80 opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute bottom-0 inset-x-0">
          <div className="max-w-4xl mx-auto px-4 sm:px-8 pb-10">
            <Link to="/actus" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-foreground/60 hover:text-primary transition-colors mb-4" data-testid="article-back-link">
              <ArrowLeft size={14} /> {t("news.back")}
            </Link>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-display tracking-[0.25em] uppercase text-primary border border-primary/40 px-2 py-0.5">{t(`news.cat.${article.category}`)}</span>
              {article.status === "draft" && (
                <span className="text-xs font-display tracking-[0.25em] uppercase text-orange-300 border border-orange-300/40 px-2 py-0.5" data-testid="article-draft-badge">{t("news.draftBadge")}</span>
              )}
              <span className="text-xs text-muted-foreground">
                {(article.publishedAt || article.createdAt)?.toDate ? (article.publishedAt || article.createdAt).toDate().toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "long", year: "numeric" }) : ""}
              </span>
            </div>
            <h1 className="font-display font-black text-3xl sm:text-4xl lg:text-5xl text-foreground mt-3" data-testid="article-title">{article.title}</h1>
          </div>
        </div>
      </section>
      <section className="max-w-4xl mx-auto px-4 sm:px-8 py-12">
        <div className="text-foreground/85 leading-relaxed text-base sm:text-lg" data-testid="article-content">
          <Markdown source={article.content} />
        </div>
        <div className="mt-12 pt-6 border-t border-border/25 flex items-center justify-between gap-4 flex-wrap" data-testid="article-share">
          <ShareButtons
            url={`${SITE_URL}/actus/${article.id}`}
            text={article.title}
            title={`Partager : ${article.title}`}
            testId="article-share-buttons"
          />
          <Link to="/actus" className="text-xs uppercase tracking-widest text-foreground/50 hover:text-primary transition-colors">
            ← {t("news.back")}
          </Link>
        </div>
      </section>
    </div>
  );
}
