import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export const CONTACT_EMAIL = "contact@elysium-esport.fr";

export const createNotification = async ({ targetUid = null, targetRoles = null, targetGame = null, type, extra = "", message = "", link = "/" }) => {
  try {
    const payload = {
      targetUid, targetRoles, targetGame, type, extra, link, readBy: [], createdAt: serverTimestamp(),
    };
    // `message` n'est renseigné que pour les annonces (corps de l'email).
    if (message) payload.message = String(message).slice(0, 800);
    await addDoc(collection(db, "notifications"), payload);
  } catch (e) { console.error("notify", e); }
};

export const logActivity = async ({ game, type, label, byUid, byName }) => {
  try {
    await addDoc(collection(db, "activity"), {
      game: game || "global", type, label, byUid, byName, createdAt: serverTimestamp(),
    });
  } catch (e) { console.error("activity", e); }
};

export const logAdminAction = async ({ action, label = "", actor, target = {}, details = {} }) => {
  try {
    await addDoc(collection(db, "admin_audit"), {
      action,
      label,
      actorUid: actor?.uid || null,
      actorName: actor?.name || actor?.displayName || "",
      actorEmail: actor?.email || "",
      targetCollection: target?.collection || "",
      targetId: target?.id || "",
      details,
      createdAt: serverTimestamp(),
    });
  } catch (e) { console.error("admin_audit", e); }
};
