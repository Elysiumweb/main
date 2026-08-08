import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { app, db } from "./firebase";

const VAPID_KEY = process.env.REACT_APP_FIREBASE_VAPID_KEY;

const tokenDocId = (uid, token) => {
  const suffix = btoa(unescape(encodeURIComponent(token))).replace(/[^a-zA-Z0-9_-]/g, "").slice(-80);
  return `${uid}_${suffix}`;
};

export const isPushConfigured = () => Boolean(VAPID_KEY);

export const canUsePush = async () => {
  if (!isPushConfigured()) return false;
  if (typeof window === "undefined") return false;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
  try { return await isSupported(); }
  catch { return false; }
};

export const subscribeToPush = async ({ uid }) => {
  if (!uid) throw new Error("Utilisateur requis pour activer les notifications push.");
  if (!isPushConfigured()) throw new Error("Clé VAPID manquante (REACT_APP_FIREBASE_VAPID_KEY).");

  const supported = await canUsePush();
  if (!supported) throw new Error("Notifications push non supportées par ce navigateur.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permission de notification refusée.");

  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Jeton FCM indisponible.");

  await setDoc(doc(db, "pushTokens", tokenDocId(uid, token)), {
    uid,
    token,
    enabled: true,
    platform: "web",
    userAgent: navigator.userAgent || "",
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }, { merge: true });

  return token;
};

export const listenForegroundPush = async (handler) => {
  if (!(await canUsePush())) return () => {};
  const messaging = getMessaging(app);
  return onMessage(messaging, handler);
};
