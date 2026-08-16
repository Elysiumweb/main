/**
 * Export RGPD côté serveur — archive JSON complète des données liées au compte.
 * ----------------------------------------------------------------------------
 * Couvre, en plus du profil / tickets / candidatures déjà exportés côté client :
 * notes (+ versions), messages de chat, tableaux (canvas), disponibilités
 * (ponctuelles et récurrentes), absences, notifications, jetons push, journaux
 * d'activité et d'audit, abonnement newsletter et demandes de suppression.
 *
 * L'archive est produite avec le SDK Admin (aucune règle contournée côté
 * client) et retournée au client qui la télécharge en JSON.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const db = () => admin.firestore();

const toJson = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]));
  }
  return value;
};

const docJson = (snap) => ({ id: snap.id, ...toJson(snap.data()) });

const safeQuery = async (label, fn, errors) => {
  try {
    return await fn();
  } catch (err) {
    logger.error(`exportMyData: section ${label}`, err);
    errors.push({ section: label, error: String(err.message || err).slice(0, 200) });
    return null;
  }
};

const collectByField = async (col, field, value) => {
  const snap = await db().collection(col).where(field, "==", value).get();
  return snap.docs.map(docJson);
};

const collectThreads = async (col, uid) => {
  const snap = await db().collection(col).where("uid", "==", uid).get();
  return Promise.all(snap.docs.map(async (d) => {
    const messages = await d.ref.collection("messages").orderBy("createdAt", "asc").get()
      .catch(() => d.ref.collection("messages").get());
    return { ...docJson(d), messages: messages.docs.map(docJson) };
  }));
};

exports.exportMyData = onCall(
  { memory: "512MiB", timeoutSeconds: 120 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Connexion requise.");

    const errors = [];
    const email = (request.auth.token?.email || "").toLowerCase();

    const [
      authUser, userDoc, profileDoc, notes, supportTickets, applications,
      availabilities, recurringAvailabilities, absences,
      notificationsTargeted, notificationsAuthored, pushTokens,
      activityLogs, adminAuditLogs, chatMessages, canvases,
      newsletterSubscriptions, deletionRequests, mfaSecretDoc,
    ] = await Promise.all([
      safeQuery("auth", () => admin.auth().getUser(uid), errors),
      safeQuery("users", async () => {
        const s = await db().collection("users").doc(uid).get();
        return s.exists ? docJson(s) : null;
      }, errors),
      safeQuery("profiles", async () => {
        const s = await db().collection("profiles").doc(uid).get();
        return s.exists ? docJson(s) : null;
      }, errors),
      safeQuery("notes", async () => {
        const snap = await db().collection("notes").where("ownerUid", "==", uid).get();
        return Promise.all(snap.docs.map(async (d) => {
          const versions = await d.ref.collection("versions").get().catch(() => ({ docs: [] }));
          return { ...docJson(d), versions: versions.docs.map(docJson) };
        }));
      }, errors),
      safeQuery("supportThreads", () => collectThreads("supportThreads", uid), errors),
      safeQuery("recruitThreads", () => collectThreads("recruitThreads", uid), errors),
      safeQuery("availabilities", () => collectByField("availabilities", "uid", uid), errors),
      safeQuery("recurringAvailabilities", () => collectByField("recurringAvailabilities", "uid", uid), errors),
      safeQuery("absences", () => collectByField("absences", "uid", uid), errors),
      safeQuery("notifications(target)", () => collectByField("notifications", "targetUid", uid), errors),
      safeQuery("notifications(auteur)", () => collectByField("notifications", "uid", uid), errors),
      safeQuery("pushTokens", () => collectByField("pushTokens", "uid", uid), errors),
      safeQuery("activity", () => collectByField("activity", "byUid", uid), errors),
      safeQuery("admin_audit", () => collectByField("admin_audit", "actorUid", uid), errors),
      safeQuery("messages(chat)", async () => {
        const snap = await db().collectionGroup("messages").where("uid", "==", uid).get();
        return snap.docs.map((d) => ({ path: d.ref.path, ...toJson(d.data()) }));
      }, errors),
      safeQuery("canvases", () => collectByField("canvases", "createdBy", uid), errors),
      safeQuery("newsletter", async () => {
        if (!email) return [];
        const snap = await db().collection("newsletter").where("email", "==", email).get();
        // Le jeton de confirmation reste secret : on ne l'exporte pas.
        return snap.docs.map((d) => {
          const { confirmToken, ...rest } = d.data();
          return { id: d.id, ...toJson(rest), confirmToken: confirmToken ? "(masqué)" : null };
        });
      }, errors),
      safeQuery("accountDeletionRequests", async () => {
        const s = await db().collection("accountDeletionRequests").doc(uid).get();
        return s.exists ? docJson(s) : null;
      }, errors),
      safeQuery("mfaSecrets", async () => {
        const s = await db().collection("mfaSecrets").doc(uid).get();
        // Le secret TOTP n'est jamais exporté : seule son existence l'est.
        return s.exists ? { totpConfigured: true } : { totpConfigured: false };
      }, errors),
    ]);

    return {
      format: "elysium-gdpr-export/2",
      generatedAt: new Date().toISOString(),
      account: authUser ? {
        uid: authUser.uid,
        email: authUser.email || null,
        displayName: authUser.displayName || null,
        photoURL: authUser.photoURL || null,
        emailVerified: authUser.emailVerified,
        providers: (authUser.providerData || []).map((p) => p.providerId),
        createdAt: authUser.metadata?.creationTime || null,
        lastSignInAt: authUser.metadata?.lastSignInTime || null,
        mfaEnrolled: (authUser.multiFactor?.enrolledFactors || []).map((f) => f.factorId),
      } : null,
      profile: userDoc,
      playerDirectoryProfile: profileDoc,
      notes,
      supportTickets,
      applications,
      availabilities,
      recurringAvailabilities,
      absences,
      notifications: {
        received: notificationsTargeted,
        authored: notificationsAuthored,
      },
      pushTokens,
      activityLogs,
      adminAuditLogs,
      chatMessages,
      canvases,
      newsletterSubscriptions,
      accountDeletionRequest: deletionRequests,
      security: mfaSecretDoc,
      exportErrors: errors,
    };
  }
);
