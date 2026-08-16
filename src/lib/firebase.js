import { initializeApp, getApps } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

export const app = getApps()[0] || initializeApp(firebaseConfig);

/* ---- App Check (reCAPTCHA v3) ----
   Atteste que les requêtes proviennent bien de l'application. Activé dès que
   REACT_APP_FIREBASE_APPCHECK_SITE_KEY est défini ; en développement, un jeton
   de debug peut être fourni via REACT_APP_APPCHECK_DEBUG_TOKEN. */
const APPCHECK_SITE_KEY = process.env.REACT_APP_FIREBASE_APPCHECK_SITE_KEY;
if (typeof window !== "undefined" && APPCHECK_SITE_KEY) {
  if (process.env.NODE_ENV !== "production" && process.env.REACT_APP_APPCHECK_DEBUG_TOKEN) {
    window.FIREBASE_APPCHECK_DEBUG_TOKEN = process.env.REACT_APP_APPCHECK_DEBUG_TOKEN;
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(APPCHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.error("App Check init", err);
  }
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, process.env.REACT_APP_FIREBASE_FUNCTIONS_REGION || "us-central1");
export const googleProvider = new GoogleAuthProvider();
