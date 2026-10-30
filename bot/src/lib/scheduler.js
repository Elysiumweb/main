import {
  sendMatchEndPrompt,
  sendMatchStartAnnouncement,
} from "../handlers/askResult.js";
import { listScheduledMatches, saveScheduledMatch } from "./store.js";

let intervalHandle = null;
let runningTick = false;

/**
 * Exécute une passe de vérification des matchs planifiés :
 * - À `startAtMs` : envoie les identifiants du lobby + présentation dans le salon cible.
 * - À `endAtMs`   : demande tous les replays + le score dans le salon cible.
 */
export const runSchedulerTick = async (client, nowMs = Date.now()) => {
  if (runningTick) return;
  runningTick = true;

  try {
    const jobs = listScheduledMatches();
    for (const job of jobs) {
      if (job.completed) continue;

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
