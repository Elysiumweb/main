import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyDummyApiKeyForElysiumEsportPlatform00",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "elysium-esport.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "elysium-esport",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "elysium-esport.appspot.com",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "123456789012",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:123456789012:web:abcdef1234567890",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-XXXXXXXXXX",
};

const app = getApps()[0] || initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
