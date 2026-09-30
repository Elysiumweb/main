/**
 * Publication planifiée des articles.
 * ----------------------------------------------------------------------------
 * `AdminArticles` peut enregistrer un article avec le statut `scheduled` et
 * une date `publishAt`. Cette tâche planifiée (même mécanisme que
 * retention.js) bascule automatiquement les articles échus en `published`
 * toutes les 15 minutes :
 *
 *   status: "scheduled" + publishAt <= maintenant
 *     → status: "published", publishedAt: publishAt
 *
 * La date de publication retenue est la date *planifiée* (et non l'heure
 * d'exécution du cron) pour que l'affichage public reste fidèle à ce qui a
 * été programmé en admin.
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const db = () => admin.firestore();
const BATCH = 200;

exports.publishScheduledArticles = onSchedule(
  { schedule: "every 15 minutes", timeZone: "Europe/Paris", memory: "256MiB", timeoutSeconds: 120 },
  async () => {
    const nowMs = Date.now();
    // Requête sur le seul champ `status` (index simple automatique) : le filtre
    // `publishAt <= now` est appliqué en code pour ne pas exiger d'index
    // composite — les articles planifiés sont en pratique très peu nombreux.
    const snap = await db()
      .collection("articles")
      .where("status", "==", "scheduled")
      .limit(BATCH)
      .get();

    let published = 0;
    for (const d of snap.docs) {
      const { publishAt } = d.data();
      if (!publishAt || typeof publishAt.toMillis !== "function" || publishAt.toMillis() > nowMs) continue;
      try {
        await d.ref.update({
          status: "published",
          publishedAt: publishAt,
          publishedBySchedule: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        published += 1;
      } catch (err) {
        logger.error(`publishScheduledArticles: échec article ${d.id}`, err);
      }
    }

    if (published > 0) {
      logger.info(`publishScheduledArticles: ${published} article(s) publié(s) automatiquement.`);
    }
    return null;
  }
);
