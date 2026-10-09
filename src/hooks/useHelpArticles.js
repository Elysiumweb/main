import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { HELP_ARTICLES, normalizeHelpArticle, sortHelpArticles } from "../lib/helpDefaults";

/**
 * Centre d'aide — articles publiés dans Firestore (`helpArticles`).
 * ----------------------------------------------------------------------------
 * Les 15 questions historiques vivaient dans `i18n.js` : les corriger imposait un
 * redéploiement. Elles sont désormais des documents, éditables depuis l'admin
 * (rubrique + jeu + ordre + brouillon/publication).
 *
 * Tant que la collection est vide — site fraîchement déployé, hors-ligne, ou
 * droits de lecture manquants — on retombe sur `HELP_ARTICLES` (le contenu
 * historique) pour ne jamais afficher un centre d'aide vide.
 *
 * @returns {{ articles: object[], loading: boolean, isFallback: boolean }}
 */
export const useHelpArticles = () => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [received, setReceived] = useState(false);

  useEffect(() => {
    return onSnapshot(
      collection(db, "helpArticles"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...normalizeHelpArticle(d.data()) }));
        setArticles(sortHelpArticles(list));
        setReceived(true);
        setLoading(false);
      },
      (err) => {
        // Lecture refusée (non connecté sur un projet verrouillé, hors-ligne…) :
        // on bascule sur le contenu de secours plutôt que d'afficher une page vide.
        console.error("helpArticles sync", err);
        setReceived(true);
        setLoading(false);
      }
    );
  }, []);

  return useMemo(() => {
    const published = articles.filter((a) => a.published && a.question);
    if (published.length === 0 && received) {
      // Repli : le contenu historique, avec des identifiants stables pour les
      // clés React et les tests (les documents Firestore ont, eux, leur id).
      const fallback = HELP_ARTICLES.map((raw, i) => ({ id: `default-${i + 1}`, ...normalizeHelpArticle(raw) }));
      return { articles: sortHelpArticles(fallback), loading, isFallback: true };
    }
    return { articles: published, loading, isFallback: false };
  }, [articles, loading, received]);
};