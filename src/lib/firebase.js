import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB5hOyqmo4FCLrvDuWP88OLIPYRkqCNh2I",
  authDomain: "elysium-9220d.firebaseapp.com",
  projectId: "elysium-9220d",
  storageBucket: "elysium-9220d.firebasestorage.app",
  messagingSenderId: "122785030418",
  appId: "1:122785030418:web:e56ca2c42a0136847fd3cb",
  measurementId: "G-CTLVE5V5XN"
};

const app = getApps()[0] || initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
