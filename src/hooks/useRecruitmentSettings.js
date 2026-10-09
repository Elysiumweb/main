import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { DEFAULT_STEP_DELAYS, normalizeStepDelays } from "../lib/recruitment";

/**
 * Délais moyens du parcours de candidature.
 * ----------------------------------------------------------------------------
 * Annoncer « Reçu → Test → Entretien → Décision » sans délai chiffré laisse le
 * candidat sans repère ; à l'inverse des délais figés dans le code become faux
 * dès que le staff change de rythme. Les valeurs vivent donc dans
 * `settings/recruitment` (écriture staff) et tombent sur les défauts du code si
 * le document est absent ou illisible — la frise reste toujours affichée.
 */
export const RECRUIT_SETTINGS_DOC = "recruitment";

export const useRecruitmentSettings = () => {
  const [delays, setDelays] = useState(DEFAULT_STEP_DELAYS);

  useEffect(() => {
    return onSnapshot(
      doc(db, "settings", RECRUIT_SETTINGS_DOC),
      (snap) => setDelays(normalizeStepDelays(snap.exists ? snap.data().stepDelays : null)),
      (err) => {
        console.error("settings/recruitment sync", err);
        setDelays(DEFAULT_STEP_DELAYS);
      }
    );
  }, []);

  return { delays };
};