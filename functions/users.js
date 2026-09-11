/**
 * Cycle de vie des comptes — purge automatique du planning.
 * ----------------------------------------------------------------------------
 * Quand un joueur perd son rôle (passage à « visiteur ») ou son affectation
 * (pôle/roster retiré), ses disponibilités, sa semaine type et ses absences
 * sont supprimées : le staff ne se retrouve plus avec des créneaux de joueurs
 * qui ne font plus partie de l'équipe. Le panel admin effectue déjà cette
 * purge côté client ; ce trigger couvre les modifications faites ailleurs
 * (console Firebase, futurs outils) et garantit la cohérence.
 */

const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const db = () => admin.firestore();

const PLANNING_COLLECTIONS = [
  "availabilities",
  "recurringAvailabilities",
  "absences",
];

const purgePlanningDocs = async (uid) => {
  let deleted = 0;
  await Promise.all(
    PLANNING_COLLECTIONS.map(async (col) => {
      try {
        const snap = await db().collection(col).where("uid", "==", uid).get();
        await Promise.all(snap.docs.map((d) => d.ref.delete()));
        deleted += snap.size;
      } catch (err) {
        logger.error(`purgePlanningDocs: ${col} uid=${uid}`, err);
      }
    })
  );
  // Retire aussi le joueur de l'annuaire privé (noms du planning/chat).
  try {
    await db().collection("profiles").doc(uid).delete();
  } catch (err) {
    logger.error(`purgePlanningDocs: profiles uid=${uid}`, err);
  }
  return deleted;
};

exports.onUserDemoted = onDocumentUpdated(
  { document: "users/{uid}", memory: "256MiB", timeoutSeconds: 60 },
  async (event) => {
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};
    const uid = event.params.uid;
    if (!uid) return null;

    const lostAccess = before.role !== "visitor" && after.role === "visitor";
    const lostGame = Boolean(before.game) && !after.game;
    const lostRoster = Boolean(before.roster) && !after.roster;

    if (!lostAccess && !lostGame && !lostRoster) return null;

    const deleted = await purgePlanningDocs(uid);
    logger.info(
      `onUserDemoted: uid=${uid} (rôle ${before.role || "?"}→${after.role || "?"}, ` +
        `pôle ${before.game || "—"}→${after.game || "—"}, roster ${before.roster || "—"}→${after.roster || "—"}) — ${deleted} doc(s) planning supprimé(s).`
    );
    return { deleted };
  }
);
