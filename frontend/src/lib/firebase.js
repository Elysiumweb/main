import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const requiredEnv = [
  "REACT_APP_FIREBASE_API_KEY",
  "REACT_APP_FIREBASE_AUTH_DOMAIN",
  "REACT_APP_FIREBASE_PROJECT_ID",
];

const missingEnv = requiredEnv.filter((k) => !process.env[k]);
export const isFirebaseConfigured = missingEnv.length === 0;
if (!isFirebaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    "[firebase] Configuration incomplète, variables manquantes:",
    missingEnv.join(", "),
    "- Utilisation d'une config factice pour éviter un crash au runtime. Configure les variables d'environnement sur Vercel."
  );
}

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "fake-api-key",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "fake-project.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "fake-project",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "fake-project.appspot.com",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:000000000000:web:fake",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-FAKE",
};

let app;
try {
  app = getApps()[0] || initializeApp(firebaseConfig);
} catch (e) {
  console.error("[firebase] initializeApp failed:", e);
  app = null;
}

let authInstance = null;
let dbInstance = null;
let googleProviderInstance = null;

if (app) {
  try {
    authInstance = getAuth(app);
  } catch (e) {
    console.error("[firebase] getAuth failed:", e);
  }
  try {
    dbInstance = getFirestore(app);
  } catch (e) {
    console.error("[firebase] getFirestore failed:", e);
  }
  try {
    googleProviderInstance = new GoogleAuthProvider();
  } catch (e) {
    console.error("[firebase] GoogleAuthProvider failed:", e);
  }
} else {
  console.error("[firebase] App non initialisée, auth/db resteront null.");
}

// On attache un flag _isFake si la config est manquante pour permettre aux composants de bypass rapidement
if (!isFirebaseConfigured) {
  if (authInstance) {
    try { authInstance._isFake = true; } catch {}
  }
  if (dbInstance) {
    try { dbInstance._isFake = true; } catch {}
  }
}

// On exporte même si fake, pour éviter les crashs à l'import
// Les appels réseau échoueront mais seront catchés par les composants
export const auth = authInstance || { _isFake: true };
export const db = dbInstance || { _isFake: true, _isFakeDb: true };
export const googleProvider = googleProviderInstance || { _isFake: true };
