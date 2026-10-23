import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export const CONTACT_EMAIL = "contact@elysium-esport.fr";

export const createNotification = async ({ targetUid = null, targetRoles = null, targetGame = null, type, extra = "", link = "/" }) => {
  try {
    await addDoc(collection(db, "notifications"), {
      targetUid, targetRoles, targetGame, type, extra, link, readBy: [], createdAt: serverTimestamp(),
    });
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
