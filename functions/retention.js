/**
 * Tâches planifiées de rétention RGPD.
 * ----------------------------------------------------------------------------
 * Met en œuvre les durées annoncées dans la politique de confidentialité :
 *  - purgeNotesTrash        : corbeille Notes vidée après 30 jours (annoncé
 *    dans l'UI : « Les notes supprimées restent 30 jours en corbeille »).
 *  - purgeAgedThreads       : tickets support et candidatures archivés
 *    (statistiques anonymisées) puis supprimés 24 mois après leur création.
 *  - purgeStalePendingParentalConsent : candidatures de mineurs dont le
 *    consentement parental n'a pas été confirmé sous 30 jours.
 *  - cleanupRateLimits      : ménage technique des compteurs de quota expirés.
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const db = () => admin.firestore();
const DAY_MS = 24 * 60 * 60 * 1000;
const NOTES_TRASH_RETENTION_MS = 30 * DAY_MS;
const THREADS_RETENTION_MS = 730 * DAY_MS; // 24 mois
const PARENTAL_PENDING_MS = 30 * DAY_MS;
const BATCH = 200;

const recursiveDelete = async (ref) => {
  if (typeof db().recursiveDelete === "function") return db().recursiveDelete(ref);
  return ref.delete();
};

// ---- Corbeille Notes : purge après 30 jours ----
exports.purgeNotesTrash = onSchedule(
  { schedule: "every day 04:00", timeZone: "Europe/Paris", memory: "256MiB", timeoutSeconds: 300 },
  async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - NOTES_TRASH_RETENTION_MS);
    const snap = await db().collection("notes").where("deletedAt", "<=", cutoff).limit(BATCH).get();
    await Promise.all(snap.docs.map((d) => recursiveDelete(d.ref)));
    logger.info(`purgeNotesTrash: ${snap.size} note(s) purgée(s) (corbeille > 30 jours).`);
    return null;
  }
);

// ---- Support + candidatures : archivage anonymisé puis suppression à 24 mois ----
const archiveAndDeleteThreads = async (collectionName, keptFields) => {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - THREADS_RETENTION_MS);
  const snap = await db().collection(collectionName)
    .where("createdAt", "<=", cutoff).limit(BATCH).get();

  for (const d of snap.docs) {
    const data = d.data();
    // Archive strictement anonymisée : aucune donnée personnelle conservée.
    const archive = {
      sourceCollection: collectionName,
      sourceId: d.id,
      createdAt: data.createdAt || null,
      archivedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    keptFields.forEach((f) => { if (data[f] !== undefined) archive[f] = data[f]; });
    await db().collection("archivedThreads").doc(`${collectionName}_${d.id}`).set(archive);
    await recursiveDelete(d.ref);
  }
  logger.info(`purgeAgedThreads: ${snap.size} document(s) ${collectionName} archivé(s)/supprimé(s) (> 24 mois).`);
  return snap.size;
};

exports.purgeAgedThreads = onSchedule(
  { schedule: "every day 04:30", timeZone: "Europe/Paris", memory: "256MiB", timeoutSeconds: 540 },
  async () => {
    await archiveAndDeleteThreads("supportThreads", ["category", "priority", "status"]);
    await archiveAndDeleteThreads("recruitThreads", ["status", "ageRange"]);
    return null;
  }
);

// ---- Consentement parental non confirmé sous 30 jours : suppression ----
exports.purgeStalePendingParentalConsent = onSchedule(
  { schedule: "every day 05:00", timeZone: "Europe/Paris", memory: "256MiB", timeoutSeconds: 300 },
  async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - PARENTAL_PENDING_MS);
    const snap = await db().collection("recruitThreads")
      .where("status", "==", "pending_parental_consent").limit(BATCH).get();
    let purged = 0;
    for (const d of snap.docs) {
      const createdAt = d.data().createdAt;
      if (createdAt && createdAt.toMillis && createdAt.toMillis() <= cutoff.toMillis()) {
        await recursiveDelete(d.ref);
        purged += 1;
      }
    }
    logger.info(`purgeStalePendingParentalConsent: ${purged} candidature(s) supprimée(s) (consentement non confirmé > 30 jours).`);
    return null;
  }
);

// ---- Ménage technique : compteurs de quotas expirés ----
exports.cleanupRateLimits = onSchedule(
  { schedule: "every day 05:30", timeZone: "Europe/Paris", memory: "256MiB", timeoutSeconds: 300 },
  async () => {
    const now = admin.firestore.Timestamp.now();
    const snap = await db().collection("rateLimits").where("expiresAt", "<=", now).limit(500).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
    logger.info(`cleanupRateLimits: ${snap.size} compteur(s) expiré(s) supprimé(s).`);
    return null;
  }
);
