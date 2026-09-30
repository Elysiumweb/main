/**
 * Helpers éditoriaux pour les articles (purs, testables sans Firebase).
 * ----------------------------------------------------------------------------
 * - readingTimeMinutes : temps de lecture estimé (mots / 200 par minute).
 * - parseTags          : normalise une saisie « tags » (string CSV ou tableau).
 * - relatedArticles    : score de proximité (tags, catégorie, jeu, roster).
 * - localizedArticle   : bascule FR/EN avec repli sur la version française.
 * - extractHeadings    : titres du contenu Markdown (table des matières).
 *   → la génération des ancres (slugify) vit dans lib/markdown.jsx pour rester
 *     la source de vérité unique des ids rendus par <Markdown/>.
 */

import { markdownToText, extractHeadings } from "./markdown";

/** Vitesse de lecture moyenne d'un contenu web (mots/minute). */
export const WORDS_PER_MINUTE = 200;

/** Temps de lecture estimé, arrondi au supérieur (minimum 1 minute). */
export const readingTimeMinutes = (content, wordsPerMinute = WORDS_PER_MINUTE) => {
  const words = markdownToText(content).split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.max(1, Math.ceil(words / wordsPerMinute));
};

export const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 30;

/**
 * Normalise des tags : accepte « "lan, Finale , eva" » ou ["lan","Finale"].
 * - trim, déduplication insensible à la casse, garde la première graphie ;
 * - maximum MAX_TAGS tags de MAX_TAG_LENGTH caractères ;
 * - les « # » de tête sont retirés (saisie type hashtag).
 */
export const parseTags = (input) => {
  const raw = Array.isArray(input) ? input : String(input || "").split(",");
  const seen = new Set();
  const tags = [];
  for (const item of raw) {
    const tag = String(item || "")
      .trim()
      .replace(/^#/, "")
      .trim()
      .slice(0, MAX_TAG_LENGTH)
      .trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
};

/** Article visible publiquement (les brouillons/planifiés/corbeille restent privés). */
export const isPubliclyVisible = (article) =>
  !!article && article.status === "published";

/** Date de référence d'un article (publication planifiée incluse). */
export const articleDate = (article) =>
  article?.publishedAt || article?.publishAt || article?.createdAt || null;

const toArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

/**
 * Score de proximité entre deux articles : tags partagés (poids fort),
 * même catégorie, même jeu, même roster. Retourne un nombre ≥ 0.
 */
const relatednessScore = (a, b) => {
  const aTags = new Set(toArray(a.tags).map((t) => String(t).toLowerCase()));
  const bTags = toArray(b.tags).map((t) => String(t).toLowerCase());
  const sharedTags = bTags.filter((t) => aTags.has(t)).length;
  let score = sharedTags * 3;
  if (a.category && a.category === b.category) score += 2;
  if (a.game && a.game === b.game) score += 1;
  if (a.roster && a.roster === b.roster) score += 1;
  return score;
};

/**
 * Articles liés : publiés, triés par score de proximité puis par date.
 * Repli sur les plus récents si aucun point commun n'est trouvé, pour que la
 * section « À lire ensuite » reste utile même avec peu de contenu.
 */
export const relatedArticles = (current, articles, { limit = 3 } = {}) => {
  if (!current) return [];
  const candidates = (articles || []).filter(
    (a) => isPubliclyVisible(a) && a.id && a.id !== current.id
  );
  const scored = candidates.map((a) => ({
    article: a,
    score: relatednessScore(current, a),
    date: articleDate(a)?.seconds || 0,
  }));
  scored.sort((x, y) => y.score - x.score || y.date - x.date);
  const related = scored.filter((s) => s.score > 0).slice(0, limit);
  if (related.length > 0) return related.map((s) => s.article);
  return scored.slice(0, limit).map((s) => s.article);
};

/** L'article dispose-t-il d'une version anglaise complète (titre + contenu) ? */
export const isTranslated = (article) =>
  Boolean(article && String(article.contentEn || "").trim() && String(article.titleEn || "").trim());

/**
 * Champs localisés d'un article avec repli français.
 * En mode EN sans traduction, on sert la version FR et `translated: false`
 * permet d'afficher le badge « non traduit ».
 */
export const localizedArticle = (article, lang) => {
  const useEn = lang === "en" && isTranslated(article);
  return {
    title: useEn ? article.titleEn : article?.title || "",
    excerpt: useEn && String(article.excerptEn || "").trim() ? article.excerptEn : article?.excerpt || "",
    content: useEn ? article.contentEn : article?.content || "",
    translated: lang !== "en" || isTranslated(article),
  };
};

/** Auteur affiché (byline) : champ auteur ou rédaction Elysium par défaut. */
export const articleAuthor = (article, fallback = "Rédaction Elysium") =>
  String(article?.author || "").trim() || fallback;

/**
 * Recherche « plein texte » tolérante : minuscules + sans accents, pour que
 * « finale » trouve « Finale » et «elan» trouve « élan ».
 */
export const normalizeForSearch = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Un article correspond-il à la requête (titre, extrait, contenu, tags) ? */
export const articleMatchesQuery = (article, query) => {
  const q = normalizeForSearch(query);
  if (!q) return true;
  const haystack = normalizeForSearch(
    [
      article.title,
      article.titleEn,
      article.excerpt,
      article.excerptEn,
      article.content,
      article.contentEn,
      toArray(article.tags).join(" "),
    ].join(" ")
  );
  return q.split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
};

/** Titres du sommaire (h2/h3 par défaut, comme la table des matières). */
export { extractHeadings };
