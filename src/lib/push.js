import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { app, db } from "./firebase";

const VAPID_KEY = process.env.REACT_APP_FIREBASE_VAPID_KEY;

/**
 * firebase/messaging n'est chargé qu'à la demande : sans clé VAPID le module
 * est inerte, et même configuré il ne sert qu'aux utilisateurs qui activent
 * les notifications. L'import dynamique le sort du bundle principal.
 */
const loadMessaging = () => import("firebase/messaging");

const tokenDocId = (uid, token) => {
  const suffix = btoa(unescape(encodeURIComponent(token))).replace(/[^a-zA-Z0-9_-]/g, "").slice(-80);
  return `${uid}_${suffix}`;
};

export const isPushConfigured = () => Boolean(VAPID_KEY);

export const canUsePush = async () => {
  if (!isPushConfigured()) return false;
  if (typeof window === "undefined") return false;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
  try {
    const { isSupported } = await loadMessaging();
    return await isSupported();
  } catch { return false; }
};

export const subscribeToPush = async ({ uid }) => {
  if (!uid) throw new Error("Utilisateur requis pour activer les notifications push.");
  if (!isPushConfigured()) throw new Error("Clé VAPID manquante (REACT_APP_FIREBASE_VAPID_KEY).");

  const supported = await canUsePush();
  if (!supported) throw new Error("Notifications push non supportées par ce navigateur.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permission de notification refusée.");

  const registration = await navigator.serviceWorker.ready;
  const { getMessaging, getToken } = await loadMessaging();
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
  const { getMessaging, onMessage } = await loadMessaging();
  const messaging = getMessaging(app);
  return onMessage(messaging, handler);
};
