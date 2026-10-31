import {
  sendMatchEndPrompt,
  sendMatchStartAnnouncement,
} from "../handlers/askResult.js";
import {
  markMatchLiveOnSite,
  syncUpcomingSiteMatchesToLive,
} from "./firebase.js";
import { listScheduledMatches, saveScheduledMatch } from "./store.js";

let intervalHandle = null;
let runningTick = false;
let lastSiteLiveSyncAt = null;

/** Réinitialise le throttle interne pour les tests unitaires. */
export const __resetSchedulerForTests = () => {
  lastSiteLiveSyncAt = null;
};

/**
 * Exécute une passe de vérification des matchs planifiés :
 * - À `startAtMs` : passe le match en "En direct" (`status: "live"`) sur le site + envoie les identifiants du lobby dans le salon cible.
 * - Synchronise également en "En direct" les éventuels matchs `upcoming` créés directement depuis l'admin du site lorsqu'ils sont en cours.
 * - À `endAtMs`   : demande tous les replays + le score dans le salon cible.
 */
export const runSchedulerTick = async (client, nowMs = Date.now()) => {
  if (runningTick) return;
  runningTick = true;

  try {
    const jobs = listScheduledMatches();
    for (const job of jobs) {
      if (job.completed || job.cancelled) continue;

      if (!job.liveStatusSet && nowMs >= job.startAtMs) {
        try {
          if (job.siteMatchId) {
            await markMatchLiveOnSite({ matchId: job.siteMatchId });
          }
          job.liveStatusSet = true;
          job.liveStatusSetAt = nowMs;
          saveScheduledMatch(job);
        } catch (err) {
          console.error(`[Scheduler] Échec passage En direct match ${job.id} :`, err.message);
        }
      }

      if (!job.startSent && nowMs >= job.startAtMs) {
        try {
          await sendMatchStartAnnouncement(client, job);
          job.startSent = true;
          job.startSentAt = nowMs;
          saveScheduledMatch(job);
        } catch (err) {
          console.error(`[Scheduler] Échec annonce début match ${job.id} :`, err.message);
        }
      }

      if (!job.endPromptSent && nowMs >= job.endAtMs) {
        try {
          await sendMatchEndPrompt(client, job);
          job.endPromptSent = true;
          job.endPromptSentAt = nowMs;
          saveScheduledMatch(job);
        } catch (err) {
          console.error(`[Scheduler] Échec demande fin match ${job.id} :`, err.message);
        }
      }
    }

    // Synchronise aussi les matchs créés directement depuis l'admin du site (toutes les 45 s)
    if (lastSiteLiveSyncAt === null || Math.abs(nowMs - lastSiteLiveSyncAt) >= 45_000) {
      lastSiteLiveSyncAt = nowMs;
      try {
        await syncUpcomingSiteMatchesToLive({ nowMs });
      } catch (err) {
        console.error("[Scheduler] Échec synchro matchs live site :", err.message);
      }
    }
  } finally {
    runningTick = false;
  }
};

export const startMatchScheduler = (client, pollMs = 15_000) => {
  if (intervalHandle) clearInterval(intervalHandle);
  runSchedulerTick(client).catch((err) => console.error("[Scheduler init]", err));
  intervalHandle = setInterval(() => {
    runSchedulerTick(client).catch((err) => console.error("[Scheduler tick]", err));
  }, pollMs);
  return intervalHandle;
};

export const stopMatchScheduler = () => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};
