import { useEffect } from "react";

/**
 * ScrollToTop — scrolle vers #main-content à chaque changement de route.
 *
 * Requis car React Router ne restaure pas automatiquement la position de
 * scroll (pas de ScrollRestoration natif dans l'application). Sans cela,
 * changer de page en restant en bas d'une longue page laisse le visiteur
 * au milieu du contenu précédent.
 *
 * Le lien d'évitement `#main-content` bénéficie aussi de ce comportement.
 */
export const ScrollToTop = () => {
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main) {
      // scrollIntoView({ block: "start" }) est mieux qu'un window.scrollTo
      // car il respecte les marges éventuelles et fonctionne aussi pour
      // le lien d'évitement #main-content.
      main.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return null;
};
