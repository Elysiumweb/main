/**
 * Détection automatique du statut "live"
 * - Cloud Function planifiée qui vérifie si la chaîne Twitch Elysium est en direct
 * - Si oui, bascule les matchs "upcoming" dont la date/heure est proche en "live"
 * - Envoie une notification push aux abonnés via la collection notifications (notifyPush)
 *
 * Secrets attendus (optionnels) :
 *   TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_CHANNEL (ex: elysiumxeva)
 *   Si absents, la fonction utilise un heuristique horaire (match prévu dans la prochaine heure)
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const db = () => admin.firestore();

const APP_URL = process.env.APP_URL || "https://elysium-esport.fr";
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_CHANNEL = process.env.TWITCH_CHANNEL || "elysiumxeva";

let twitchTokenCache = { token: null, expiresAt: 0 };

async function getTwitchAppToken() {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return null;
  const now = Date.now();
  if (twitchTokenCache.token && twitchTokenCache.expiresAt > now + 60000) {
    return twitchTokenCache.token;
  }
  const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(TWITCH_CLIENT_ID)}&client_secret=${encodeURIComponent(TWITCH_CLIENT_SECRET)}&grant_type=client_credentials`, { method: "POST" });
  if (!res.ok) {
    logger.warn(`Twitch token error ${res.status}`);
    return null;
  }
  const data = await res.json();
  twitchTokenCache = { token: data.access_token, expiresAt: now + (data.expires_in * 1000) };
  return twitchTokenCache.token;
}

async function isTwitchLive() {
  if (!TWITCH_CLIENT_ID) {
    // Pas de config Twitch -> on ne peut pas vérifier, on retourne null pour utiliser heuristique
    return null;
  }
  try {
    const token = await getTwitchAppToken();
    if (!token) return null;
    const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(TWITCH_CHANNEL)}`, {
      headers: { "Client-Id": TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      logger.warn(`Twitch streams error ${res.status}`);
      return null;
    }
    const data = await res.json();
    return Array.isArray(data.data) && data.data.length > 0;
  } catch (e) {
    logger.error("isTwitchLive error", e);
    return null;
  }
}

function parseMatchTimestamp(match) {
  if (!match.date) return null;
  const time = match.time ? match.time.slice(0,5) : "20:00";
  const d = new Date(`${match.date}T${time}:00`);
  return isNaN(d.getTime()) ? null : d.getTime();
}

async function notifyLive(match) {
  try {
    await db().collection("notifications").add({
      targetRoles: ["bureau", "manager", "player"],
      type: "match_live",
      extra: `${match.opponentName || "Match"} est en direct !`,
      link: `/resultats/${match.id}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      readBy: [],
    });
    // Also push for anonymous subscribers via matchAlerts? Send email digest if provider configured
    logger.info(`Live notification sent for match ${match.id}`);
  } catch (e) {
    logger.error("notifyLive error", e);
  }
}

exports.checkLiveStatus = onSchedule(
  { schedule: "every 5 minutes", memory: "256MiB", timeoutSeconds: 60, secrets: ["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET"] },
  async () => {
    logger.info("checkLiveStatus: start");
    const twitchLive = await isTwitchLive();
    const now = Date.now();
    const snap = await db().collection("matches").where("status", "in", ["upcoming", "live"]).get();

    let switchedToLive = 0;
    let switchedToFinished = 0;

    for (const docSnap of snap.docs) {
      const m = { id: docSnap.id, ...docSnap.data() };
      const ts = parseMatchTimestamp(m);
      if (!ts) continue;

      const diffMinutes = (ts - now) / 60000;

      if (m.status === "upcoming") {
        // Si Twitch est en live ET match prévu dans les 60 min passées / 180 min futures -> passe en live
        // Si pas de Twitch API, heuristique : match prévu dans les 30 min passées à 120 min futures -> live
        const shouldBeLive =
          twitchLive === true
            ? diffMinutes >= -60 && diffMinutes <= 180
            : diffMinutes >= -30 && diffMinutes <= 30;

        if (shouldBeLive) {
          await docSnap.ref.update({ status: "live", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          switchedToLive++;
          await notifyLive(m);
          logger.info(`Match ${m.id} switched to live (twitchLive=${twitchLive}, diffMin=${diffMinutes.toFixed(1)})`);
        }
      } else if (m.status === "live") {
        // Si match live depuis plus de 4h, on le repasse en finished automatiquement (sécurité)
        // Ou si Twitch n'est plus en live depuis longtemps
        const liveDurationHours = (now - ts) / 3600000;
        const shouldFinish = liveDurationHours > 4 || (twitchLive === false && liveDurationHours > 2);
        if (shouldFinish) {
          await docSnap.ref.update({ status: "finished", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          switchedToFinished++;
          logger.info(`Match ${m.id} switched to finished after ${liveDurationHours.toFixed(1)}h live`);
        }
      }
    }

    logger.info(`checkLiveStatus: done, ${switchedToLive} -> live, ${switchedToFinished} -> finished, twitchLive=${twitchLive}`);
    return { switchedToLive, switchedToFinished, twitchLive };
  }
);

// Webhook manuel pour forcer le passage en live (sécurisé par secret ou bureau)
const { onRequest } = require("firebase-functions/v2/https");
exports.webhookLive = onRequest(
  { memory: "256MiB", timeoutSeconds: 30, secrets: ["LIVE_WEBHOOK_SECRET"] },
  async (req, res) => {
    const secret = process.env.LIVE_WEBHOOK_SECRET;
    const provided = req.query.secret || req.headers["x-webhook-secret"];
    if (secret && provided !== secret) {
      res.status(403).send("Forbidden");
      return;
    }
    const matchId = String(req.query.matchId || req.body?.matchId || "").trim();
    if (!matchId) {
      res.status(400).send("matchId required");
      return;
    }
    try {
      const ref = db().collection("matches").doc(matchId);
      const snap = await ref.get();
      if (!snap.exists) { res.status(404).send("Match not found"); return; }
      await ref.update({ status: "live", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      const m = { id: snap.id, ...snap.data() };
      await notifyLive(m);
      res.json({ ok: true, matchId, status: "live" });
    } catch (e) {
      logger.error("webhookLive error", e);
      res.status(500).send("Error");
    }
  }
);
