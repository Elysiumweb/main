import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { setAnalyticsSink } from "./analytics";

/**
 * Branche la destination Firestore des événements analytics.
 * Appelé une seule fois au démarrage de l'application (App.js). Les
 * composants continuent d'appeler `trackEvent` sans connaître Firestore.
 *
 * Règles Firestore : création publique validée, lecture réservée au bureau
 * (`analytics_events`, onglet Analytics).
 */
export const registerFirestoreAnalyticsSink = () => {
  setAnalyticsSink((event) => addDoc(collection(db, "analytics_events"), {
    ...event,
    createdAt: serverTimestamp(),
  }));
};
