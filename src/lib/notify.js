import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

export const CONTACT_EMAIL = "contact@elysium-esport.fr";

/**
 * Création d'une notification.
 *
 * Les règles Firestore n'autorisent la création directe que pour deux actions
 * métier strictes : `chat_mention` (vers un autre membre) et `match_reminder`
 * (sur soi-même). Toutes les autres notifications (event_new, support_new,
 * recruit_new, thread_reply…) passent par la Cloud Function `createNotification`
 * qui valide l'auteur et la cible côté serveur.
 */
let notificationCallable = null;
const getNotificationCallable = () => {
  if (!notificationCallable) notificationCallable = httpsCallable(functions, "createNotification");
  return notificationCallable;
};

export const createNotification = async ({ targetUid = null, targetRoles = null, targetGame = null, type, extra = "", link = "/" }) => {
  try {
    const res = await getNotificationCallable()({ targetUid, targetRoles, targetGame, type, extra, link });
    return res.data;
  } catch (err) {
    // Repli direct UNIQUEMENT pour les actions autorisées par les règles
    // (utile quand les Cloud Functions ne sont pas déployées, ex. émulateur).
    if (type === "chat_mention" || type === "match_reminder") {
      try {
        await addDoc(collection(db, "notifications"), {
          targetUid: targetUid || null,
          type,
          extra: extra || "",
          link: link || "/",
          readBy: [],
          createdAt: serverTimestamp(),
        });
        return { ok: true };
      } catch (e) {
        console.error("notify", e);
      }
    } else {
      console.error("notify", err);
    }
  }
  return null;
};

export const logActivity = async ({ game, type, label, byUid, byName }) => {
  try {
    await addDoc(collection(db, "activity"), {
      game: game || "global", type, label, byUid, byName, createdAt: serverTimestamp(),
    });
  } catch (e) { console.error("activity", e); }
};

/**
 * À appeler quand une opération sensible échoue avec permission-denied :
 * réouvre l'écran de double authentification (session MFA serveur expirée).
 */
export const requireMfaOnDenied = (err) => {
  const message = String(err?.code || err?.message || "");
  if (/permission-denied/i.test(message)) {
    window.dispatchEvent(new CustomEvent("elysium:mfa-required"));
  }
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
