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

function getZonedParts(dateObj, timeZone = "Europe/Paris") {
  let safeTz = timeZone || "Europe/Paris";
  try {
    Intl.DateTimeFormat("en-CA", { timeZone: safeTz });
  } catch {
    safeTz = "Europe/Paris";
  }
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map = {};
  for (const part of dtf.formatToParts(dateObj)) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour === 24 ? 0 : map.hour,
    minute: map.minute,
    second: map.second,
  };
}

function zonedDateTimeToUtcMs(isoDate, timeHm, timeZone = "Europe/Paris") {
  const [year, month, day] = isoDate.split("-").map(Number);
  const [hour, minute] = timeHm.split(":").map(Number);
  const targetUtcAsIfZoned = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = targetUtcAsIfZoned;
  for (let i = 0; i < 2; i += 1) {
    const parts = getZonedParts(new Date(guess), timeZone);
    const observedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      0
    );
    guess += targetUtcAsIfZoned - observedAsUtc;
  }
  return guess;
}

function parseMatchWindow(match) {
  if (!match.date || !/^\d{4}-\d{2}-\d{2}$/.test(match.date)) return null;
  const tz = match.timezone || "Europe/Paris";
  const time = match.time ? match.time.slice(0, 5) : "20:00";
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const startAtMs = zonedDateTimeToUtcMs(match.date, time, tz);
  if (!Number.isFinite(startAtMs)) return null;

  const endRaw = match.endTime ? String(match.endTime).slice(0, 5) : "";
  if (/^\d{2}:\d{2}$/.test(endRaw)) {
    let endDate = match.date;
    if (endRaw <= time) {
      const [y, m, d] = match.date.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d + 1));
      endDate = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    }
    const endAtMs = zonedDateTimeToUtcMs(endDate, endRaw, tz);
    if (Number.isFinite(endAtMs) && endAtMs > startAtMs) {
      return { startAtMs, endAtMs };
    }
  }
  return { startAtMs, endAtMs: startAtMs + 2 * 3600000 };
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
      const win = parseMatchWindow(m);
      if (!win) continue;

      const ts = win.startAtMs;
      const diffMinutes = (ts - now) / 60000;
      const inScheduledWindow = now >= win.startAtMs && now < win.endAtMs;

      if (m.status === "upcoming") {
        // Dès que le match est en cours (entre heure de début et heure de fin), il passe en "En direct" ("live").
        // Si Twitch est également en live peu avant le début, il peut aussi basculer.
        const shouldBeLive =
          inScheduledWindow ||
          (twitchLive === true && diffMinutes >= -60 && diffMinutes <= 30);

        if (shouldBeLive) {
          await docSnap.ref.update({ status: "live", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          switchedToLive++;
          await notifyLive(m);
          logger.info(`Match ${m.id} switched to live (inWindow=${inScheduledWindow}, twitchLive=${twitchLive}, diffMin=${diffMinutes.toFixed(1)})`);
        }
      } else if (m.status === "live") {
        // Si match live depuis plus de 4h (et après son heure de fin), on le repasse en finished par sécurité
        const liveDurationHours = (now - ts) / 3600000;
        const pastEnd = now >= win.endAtMs;
        const shouldFinish = pastEnd && (liveDurationHours > 4 || (twitchLive === false && liveDurationHours > 2));
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
