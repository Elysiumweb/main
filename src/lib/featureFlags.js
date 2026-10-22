import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Feature flags / mode staging
 * ============================================================================
 * Aucun mécanisme n'existait : publier une fonctionnalité en cours de
 * développement revenait à la déployer pour tout le monde.
 *
 * Les drapeaux sont stockés dans la collection Firestore `featureFlags`
 * (lecture publique, écriture bureau) et peuvent être surchargés par
 * variables d'environnement pour un déploiement de préproduction :
 *   - REACT_APP_STAGING=true          → force `stagingMode`
 *   - REACT_APP_FEATURE_FLAGS='{"recruitmentOpen":false}' → surcharge ponctuelle
 *
 * Le hook écoute la collection une seule fois (store partagé) : ajouter un
 * drapeau dans un composant ne crée pas un listener supplémentaire.
 */

export const FLAG_DEFINITIONS = [
  {
    id: "publicAnnouncements",
    label: "Bannière d'annonces publique",
    description: "Affiche les annonces actives en haut du site public.",
    default: true,
  },
  {
    id: "donationsEnabled",
    label: "Dons activés",
    description: "Masque les boutons de don (PayPal) sans retirer les pages.",
    default: true,
  },
  {
    id: "recruitmentOpen",
    label: "Candidatures ouvertes",
    description: "Désactivé : la page recrutement affiche une période fermée.",
    default: true,
  },
  {
    id: "analyticsDashboard",
    label: "Dashboard analytics",
    description: "Affiche l'onglet Analytics dans l'admin.",
    default: true,
  },
  {
    id: "newInbox",
    label: "Boîte de réception admin",
    description: "Vue centralisée Support + Candidatures dans /admin.",
    default: true,
  },
  {
    id: "stagingMode",
    label: "Mode staging",
    description: "Affiche un bandeau de préproduction et désactive l'indexation.",
    default: false,
  },
];

const envOverrides = (() => {
  const out = {};
  try {
    if (process.env.REACT_APP_FEATURE_FLAGS) {
      const parsed = JSON.parse(process.env.REACT_APP_FEATURE_FLAGS);
      Object.entries(parsed).forEach(([key, value]) => { out[key] = !!value; });
    }
  } catch (_) {
    // Une variable d'environnement malformée ne doit jamais casser le site.
  }
  if (process.env.REACT_APP_STAGING === "true") out.stagingMode = true;
  return out;
})();

const DEFAULT_VALUES = FLAG_DEFINITIONS.reduce((acc, flag) => {
  acc[flag.id] = flag.default;
  return acc;
}, {});

let state = { ...DEFAULT_VALUES, ...envOverrides };
let started = false;
let unsubscribe = null;
const listeners = new Set();

const emit = () => listeners.forEach((listener) => listener(state));

const start = () => {
  if (started) return;
  started = true;
  unsubscribe = onSnapshot(
    collection(db, "featureFlags"),
    (snap) => {
      const values = { ...DEFAULT_VALUES, ...envOverrides };
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data() || {};
        if (typeof data.enabled === "boolean") values[docSnap.id] = data.enabled;
      });
      state = values;
      emit();
    },
    (err) => {
      // Lecture refusée / hors-ligne : on conserve les valeurs par défaut.
      console.error("featureFlags sync", err);
    },
  );
};

/** Valeur courante sans hook (utile hors composant). */
export const getFeatureFlag = (id) => state[id] ?? DEFAULT_VALUES[id] ?? false;

/** Surcharge explicite (tests, aperçu admin). */
export const __setFeatureFlagsForTests = (values = {}) => {
  state = { ...DEFAULT_VALUES, ...values };
  emit();
};

export const useFeatureFlag = (id) => {
  const [value, setValue] = useState(() => getFeatureFlag(id));

  useEffect(() => {
    start();
    const listener = (next) => setValue(next[id] ?? DEFAULT_VALUES[id] ?? false);
    listeners.add(listener);
    listener(state);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && unsubscribe) {
        unsubscribe();
        unsubscribe = null;
        started = false;
      }
    };
  }, [id]);

  return value;
};

/** Tous les drapeaux (écran admin). */
export const useFeatureFlags = () => {
  const [, force] = useState(0);
  useEffect(() => {
    start();
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && unsubscribe) {
        unsubscribe();
        unsubscribe = null;
        started = false;
      }
    };
  }, []);
  return { ...state };
};

export const flagDefinition = (id) =>
  FLAG_DEFINITIONS.find((flag) => flag.id === id) || {
    id,
    label: id,
    description: "Drapeau personnalisé.",
    default: false,
  };
