import fs from "node:fs";
import path from "node:path";
import admin from "firebase-admin";
import {
  BOT_ROOT,
  DEFAULT_SITE_GAMES,
  DEFAULT_TIMEZONE,
  LEGACY_REMOVED_GAMES,
  OFFICIAL_FIREBASE_UID,
} from "../config.js";
import {
  addDaysToIsoDate,
  parseMatchTime,
  zonedDateTimeToUtcMs,
} from "./dateTime.js";

let firestoreDb = null;
let initAttempted = false;
let initError = null;

const norm = (s) => String(s || "").trim().toLowerCase();

const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

/** Cherche automatiquement un fichier de compte de service Firebase dans bot/. */
const findLocalServiceAccountFile = () => {
  const explicit = (process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "").trim();
  if (explicit) {
    const resolved = path.isAbsolute(explicit) ? explicit : path.resolve(BOT_ROOT, explicit);
    if (fs.existsSync(resolved)) return resolved;
  }
  const defaultPath = path.join(BOT_ROOT, "serviceAccountKey.json");
  if (fs.existsSync(defaultPath)) return defaultPath;

  try {
    const entries = fs.readdirSync(BOT_ROOT);
    const match = entries.find((f) => /firebase-adminsdk.*\.json$/i.test(f));
    if (match) return path.join(BOT_ROOT, match);
  } catch {
    // ignore
  }
  return null;
};

/** Parse une chaîne JSON brute ou encodée en base64 contenant le compte de service Firebase. */
const parseServiceAccountJsonEnv = () => {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) return null;
  try {
    if (raw.startsWith("{")) return JSON.parse(raw);
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch (err) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON invalide : ${err.message}`);
  }
};

/** Initialise Firebase Admin SDK et retourne l'instance Firestore (ou null si non configuré). */
export const getFirestoreDb = () => {
  if (firestoreDb) return firestoreDb;
  if (initAttempted) return null;
  initAttempted = true;

  try {
    if (admin.apps.length > 0) {
      firestoreDb = admin.firestore();
      return firestoreDb;
    }

    let credentialObj = parseServiceAccountJsonEnv();

    if (!credentialObj) {
      const filePath = findLocalServiceAccountFile();
      if (filePath) {
        credentialObj = JSON.parse(fs.readFileSync(filePath, "utf8"));
      }
    }

    if (!credentialObj) {
      const projectId = (process.env.FIREBASE_PROJECT_ID || process.env.REACT_APP_FIREBASE_PROJECT_ID || "").trim();
      const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
      const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
      if (projectId && clientEmail && privateKey) {
        credentialObj = { projectId, clientEmail, privateKey };
      }
    }

    if (!credentialObj) {
      initError =
        "Compte de service Firebase non configuré. Placez `serviceAccountKey.json` dans `bot/` ou renseignez `FIREBASE_SERVICE_ACCOUNT_JSON` dans `bot/.env` (voir `docs/bot-discord.md`).";
      return null;
    }

    admin.initializeApp({
      credential: admin.credential.cert(credentialObj),
    });
    firestoreDb = admin.firestore();
    firestoreDb.settings({ ignoreUndefinedProperties: true });
    return firestoreDb;
  } catch (err) {
    initError = err.message || String(err);
    console.error("[Firebase] Erreur d'initialisation :", err);
    return null;
  }
};

export const isFirebaseConnected = () => Boolean(getFirestoreDb());
export const getFirebaseStatusMessage = () =>
  isFirebaseConnected() ? "Connecté à Firestore" : initError || "Non connecté";

/** Permet d'injecter un mock Firestore dans les tests unitaires. */
export const __setFirestoreForTests = (mockDb) => {
  firestoreDb = mockDb;
  initAttempted = true;
};

const requireDb = () => {
  const db = getFirestoreDb();
  if (!db) {
    throw new Error(
      initError ||
        "La connexion Firebase au site n'est pas encore configurée (`bot/serviceAccountKey.json` ou `FIREBASE_SERVICE_ACCOUNT_JSON`)."
    );
  }
  return db;
};

// Petit cache mémoire court (10 s) pour que l'autocomplétion Discord réponde en < 50 ms
const cache = new Map();
const cached = async (key, ttlMs, fn) => {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await fn();
  cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
};
export const invalidateSiteCache = () => cache.clear();

/** Liste les jeux actifs présents sur le site (ex: ["EVA", "Rocket League"]). */
export const getSiteGames = async () => {
  const db = getFirestoreDb();
  if (!db) return [...DEFAULT_SITE_GAMES];

  return cached("games", 10_000, async () => {
    const games = new Set(DEFAULT_SITE_GAMES);
    const [rostersSnap, membersSnap] = await Promise.all([
      db.collection("rosters").get(),
      db.collection("roster").get(),
    ]);
    rostersSnap.forEach((doc) => {
      const g = String(doc.data()?.game || "").trim();
      if (g && !LEGACY_REMOVED_GAMES.includes(g)) games.add(g);
    });
    membersSnap.forEach((doc) => {
      const g = String(doc.data()?.game || "").trim();
      if (g && !LEGACY_REMOVED_GAMES.includes(g)) games.add(g);
    });
    return [...games].sort((a, b) => a.localeCompare(b));
  });
};

/** Liste les rosters présents sur le site (filtrés par jeu si `game` est indiqué). */
export const getSiteRosters = async (game = "") => {
  const db = getFirestoreDb();
  if (!db) return [];

  const allRosters = await cached("rosters", 10_000, async () => {
    const [rostersSnap, membersSnap] = await Promise.all([
      db.collection("rosters").get(),
      db.collection("roster").get(),
    ]);
    const map = new Map();
    const add = (rGame, rName) => {
      const g = String(rGame || "").trim();
      const n = String(rName || "").trim();
      if (!g || !n || LEGACY_REMOVED_GAMES.includes(g)) return;
      const key = `${norm(g)}||${norm(n)}`;
      if (!map.has(key)) map.set(key, { game: g, name: n });
    };
    rostersSnap.forEach((d) => add(d.data()?.game, d.data()?.name));
    membersSnap.forEach((d) => add(d.data()?.game, d.data()?.roster));
    return [...map.values()].sort(
      (a, b) => a.game.localeCompare(b.game) || a.name.localeCompare(b.name)
    );
  });

  if (!game) return allRosters;
  return allRosters.filter((r) => norm(r.game) === norm(game));
};

/** Liste les fiches joueurs présentes sur le site (collection `roster`). */
export const getSitePlayers = async ({ game = "", roster = "", includeStaff = false } = {}) => {
  const db = requireDb();
  const allPlayers = await cached("players", 8_000, async () => {
    const snap = await db.collection("roster").get();
    return snap.docs
      .map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          uid: data.uid || null,
          pseudo: String(data.pseudo || "").trim(),
          game: String(data.game || "").trim(),
          roster: data.roster ? String(data.roster).trim() : "",
          status: data.status || "player",
          discordId: data.discordId ? String(data.discordId).trim() : null,
          discordUsername: data.discordUsername ? String(data.discordUsername).trim() : "",
          aliases: Array.isArray(data.aliases)
            ? data.aliases.map((a) => String(a || "").trim()).filter(Boolean)
            : [],
        };
      })
      .filter((p) => p.pseudo && !LEGACY_REMOVED_GAMES.includes(p.game))
      .sort((a, b) => a.pseudo.localeCompare(b.pseudo));
  });

  return allPlayers.filter((p) => {
    if (!includeStaff && p.status === "staff") return false;
    if (game && p.game && norm(p.game) !== norm(game)) return false;
    if (roster && p.roster && norm(p.roster) !== norm(roster)) return false;
    return true;
  });
};

/** Retourne la fiche joueur du site liée à un identifiant utilisateur Discord (hors staff), ou null. */
export const getPlayerByDiscordId = async (discordId) => {
  const cleanId = String(discordId || "").trim();
  if (!cleanId) return null;
  const players = await getSitePlayers({ includeStaff: false });
  return players.find((p) => p.discordId && p.discordId === cleanId) || null;
};

/**
 * Lie (ou délie) un compte Discord (`discordId` + `discordUsername`) à une fiche joueur du site (`roster/{playerId}`).
 * Garantit qu'un compte Discord n'est rattaché qu'à une seule fiche joueur à la fois.
 */
export const linkDiscordToPlayer = async ({
  discordId,
  discordUsername = "",
  playerId,
  remove = false,
}) => {
  const db = requireDb();
  const playerRef = db.collection("roster").doc(playerId);
  const playerSnap = await playerRef.get();
  if (!playerSnap.exists) {
    throw new Error("Joueur introuvable sur le site.");
  }

  const playerData = playerSnap.data() || {};
  const previousDiscordId = playerData.discordId ? String(playerData.discordId).trim() : null;

  if (remove) {
    await playerRef.update({
      discordId: null,
      discordUsername: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    invalidateSiteCache();
    return {
      action: "removed",
      player: {
        id: playerSnap.id,
        ...playerData,
        discordId: null,
        discordUsername: null,
      },
      movedFrom: null,
      previousDiscordId,
    };
  }

  const cleanDiscordId = String(discordId || "").trim();
  const cleanUsername = String(discordUsername || "").trim();
  if (!cleanDiscordId) {
    throw new Error("Identifiant Discord invalide.");
  }

  // Assure l'unicité : si ce compte Discord était lié à une autre fiche joueur, on le détache de l'ancienne
  let movedFrom = null;
  const allSnap = await db.collection("roster").get();
  for (const docSnap of allSnap.docs) {
    if (docSnap.id === playerId) continue;
    const otherData = docSnap.data() || {};
    if (otherData.discordId && String(otherData.discordId).trim() === cleanDiscordId) {
      await docSnap.ref.update({
        discordId: null,
        discordUsername: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      movedFrom = otherData.pseudo || docSnap.id;
    }
  }

  const alreadyLinkedSame = previousDiscordId === cleanDiscordId;

  await playerRef.update({
    discordId: cleanDiscordId,
    discordUsername: cleanUsername || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  invalidateSiteCache();

  return {
    action: alreadyLinkedSame ? "already_linked" : "linked",
    player: {
      id: playerSnap.id,
      ...playerData,
      discordId: cleanDiscordId,
      discordUsername: cleanUsername || "",
    },
    movedFrom,
    previousDiscordId: previousDiscordId && !alreadyLinkedSame ? previousDiscordId : null,
  };
};

/** Liste les équipes adverses déjà connues sur le site (pour autocomplétion et réutilisation). */
export const getKnownOpponents = async () => {
  const db = getFirestoreDb();
  if (!db) return [];

  return cached("opponents", 15_000, async () => {
    const [oppSnap, matchSnap] = await Promise.all([
      db.collection("opponents").get(),
      db.collection("matches").limit(200).get(),
    ]);
    const byName = new Map();
    oppSnap.forEach((d) => {
      const data = d.data() || {};
      const name = String(data.name || "").trim();
      if (name) byName.set(norm(name), { name, logo: data.logo || "" });
    });
    matchSnap.forEach((d) => {
      const data = d.data() || {};
      const name = String(data.opponentName || "").trim();
      if (name && !byName.has(norm(name))) {
        byName.set(norm(name), { name, logo: data.opponentLogo || "" });
      }
    });
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
};

/**
 * Relie (ou retire) un pseudo en jeu à une fiche joueur du site (`roster/{playerId}`).
 * Plusieurs pseudos peuvent être attribués à un même joueur via le tableau `aliases`.
 */
export const linkPseudoToPlayer = async ({ pseudo, playerId, remove = false }) => {
  const db = requireDb();
  const cleanPseudo = String(pseudo || "").trim();
  if (!cleanPseudo) throw new Error("Le pseudo ne peut pas être vide.");

  const playerRef = db.collection("roster").doc(playerId);
  const playerSnap = await playerRef.get();
  if (!playerSnap.exists) {
    throw new Error("Joueur introuvable sur le site.");
  }

  const playerData = playerSnap.data() || {};
  const existingAliases = Array.isArray(playerData.aliases)
    ? playerData.aliases.map((a) => String(a || "").trim()).filter(Boolean)
    : [];

  if (remove) {
    const nextAliases = existingAliases.filter((a) => norm(a) !== norm(cleanPseudo));
    await playerRef.update({
      aliases: nextAliases,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    invalidateSiteCache();
    return {
      action: "removed",
      player: { id: playerSnap.id, ...playerData, aliases: nextAliases },
      aliases: nextAliases,
      movedFrom: null,
    };
  }

  // Vérifie si ce pseudo était déjà attribué à un AUTRE joueur pour éviter les conflits
  let movedFrom = null;
  const allSnap = await db.collection("roster").get();
  for (const docSnap of allSnap.docs) {
    if (docSnap.id === playerId) continue;
    const otherData = docSnap.data() || {};
    const otherAliases = Array.isArray(otherData.aliases) ? otherData.aliases : [];
    if (otherAliases.some((a) => norm(a) === norm(cleanPseudo))) {
      const cleaned = otherAliases.filter((a) => norm(a) !== norm(cleanPseudo));
      await docSnap.ref.update({ aliases: cleaned });
      movedFrom = otherData.pseudo || docSnap.id;
    }
  }

  const alreadyHas = existingAliases.some((a) => norm(a) === norm(cleanPseudo));
  const nextAliases = alreadyHas ? existingAliases : [...existingAliases, cleanPseudo];

  await playerRef.update({
    aliases: nextAliases,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  invalidateSiteCache();

  return {
    action: alreadyHas ? "already_linked" : "linked",
    player: { id: playerSnap.id, ...playerData, aliases: nextAliases },
    aliases: nextAliases,
    movedFrom,
  };
};

/** Enregistre un logo compressé dans la collection `images` du site (comme ImageUpload côté admin). */
export const saveImageToSiteBank = async ({ dataUrl, mime = "image/webp", bytes = 0, folder = "matches" }) => {
  const db = requireDb();
  await db.collection("images").add({
    data: dataUrl,
    mime,
    bytes,
    folder: String(folder).slice(0, 40),
    ownerUid: OFFICIAL_FIREBASE_UID,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return dataUrl;
};

/** Ajoute ou complète la fiche adversaire sur le site (`opponents`) avec son logo. */
export const upsertOpponentOnSite = async ({ name, logoDataUrl }) => {
  const db = requireDb();
  const cleanName = String(name || "").trim();
  if (!cleanName || !logoDataUrl) return;
  const slug = slugify(cleanName);
  const snap = await db.collection("opponents").where("slug", "==", slug).limit(1).get();
  if (snap.empty) {
    await db.collection("opponents").add({
      name: cleanName,
      slug,
      logo: logoDataUrl,
      country: "",
      website: "",
      twitter: "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    const docSnap = snap.docs[0];
    if (!docSnap.data()?.logo) {
      await docSnap.ref.update({ logo: logoDataUrl });
    }
  }
  invalidateSiteCache();
};

/**
 * Crée un match à venir (`status: "upcoming"`) dans la collection `matches` du site.
 */
export const createUpcomingMatchOnSite = async ({
  game,
  roster,
  opponentName,
  opponentLogo,
  date,
  startTime,
  endTime,
  format,
  timezone = DEFAULT_TIMEZONE,
  initialStatus = "upcoming",
  actorDiscordId = "",
}) => {
  const db = requireDb();
  const siteRosters = await getSiteRosters(game);
  const normalizedRoster =
    roster && siteRosters.some((r) => norm(r.name) === norm(roster))
      ? siteRosters.find((r) => norm(r.name) === norm(roster)).name
      : roster && siteRosters.length === 0
        ? null
        : roster || null;

  const statusToSet = initialStatus === "live" ? "live" : "upcoming";

  const matchPayload = {
    game: String(game || "Rocket League").trim(),
    roster: normalizedRoster,
    opponentName: String(opponentName || "").trim(),
    opponentLogo: opponentLogo || "",
    scoreUs: "",
    scoreThem: "",
    date,
    time: startTime,
    endTime: endTime || "",
    timezone,
    competition: String(format || "").trim(),
    format: String(format || "").trim(),
    status: statusToSet,
    platform: "",
    watchUrl: "",
    vodUrl: "",
    mvp: "",
    maps: [],
    players: [],
    replays: [],
    replaySide: "",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const ref = await db.collection("matches").add(matchPayload);

  try {
    await db.collection("admin_audit").add({
      action: "match_created",
      label: `[Bot Discord] ${matchPayload.game} vs ${matchPayload.opponentName}`,
      actorUid: OFFICIAL_FIREBASE_UID,
      actorName: `Discord Bot (${actorDiscordId || "system"})`,
      target: { collection: "matches", id: ref.id },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch {
    // non bloquant
  }

  invalidateSiteCache();
  return { id: ref.id, ...matchPayload };
};

/**
 * Met à jour un match existant sur le site une fois terminé (`status: "finished"`),
 * avec ses replays, sa couleur d'équipe, les manches, les stats joueurs liées et le MVP.
 */
export const completeMatchOnSite = async ({
  matchId,
  scoreUs,
  scoreThem,
  declaredScoreUs,
  declaredScoreThem,
  replays = [],
  replaySide = "",
  maps = [],
  players = [],
  mvp = "",
  actorDiscordId = "",
}) => {
  const db = requireDb();
  const matchRef = db.collection("matches").doc(matchId);
  const snap = await matchRef.get();
  if (!snap.exists) {
    throw new Error(`Match introuvable sur le site (ID: ${matchId}).`);
  }

  const updatePayload = {
    status: "finished",
    scoreUs: Number(scoreUs),
    scoreThem: Number(scoreThem),
    declaredScoreUs: Number(declaredScoreUs),
    declaredScoreThem: Number(declaredScoreThem),
    replays,
    replaySide: replaySide || "",
    maps,
    players,
    mvp: mvp || "",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await matchRef.update(updatePayload);

  try {
    const prev = snap.data() || {};
    await db.collection("admin_audit").add({
      action: "match_updated",
      label: `[Bot Discord] Résultat ${scoreUs}-${scoreThem} vs ${prev.opponentName || matchId}`,
      actorUid: OFFICIAL_FIREBASE_UID,
      actorName: `Discord Bot (${actorDiscordId || "system"})`,
      target: { collection: "matches", id: matchId },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch {
    // non bloquant
  }

  invalidateSiteCache();
  return { id: matchId, ...(snap.data() || {}), ...updatePayload };
};

/**
 * Bascule un match du site en statut "En direct" (`status: "live"`) lorsqu'il est en cours.
 * Ne modifie pas un match déjà terminé (`finished`) ou annulé (`cancelled`).
 */
export const markMatchLiveOnSite = async ({ matchId, actorDiscordId = "scheduler" } = {}) => {
  const db = getFirestoreDb();
  if (!db || !matchId) return null;

  const matchRef = db.collection("matches").doc(matchId);
  const snap = await matchRef.get();
  if (!snap.exists) return null;

  const current = snap.data() || {};
  if (current.status !== "upcoming") {
    return { id: matchId, ...current, changed: false };
  }

  await matchRef.update({
    status: "live",
    liveStartedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  try {
    await db.collection("admin_audit").add({
      action: "match_live",
      label: `[Bot Discord] Match en direct vs ${current.opponentName || matchId}`,
      actorUid: OFFICIAL_FIREBASE_UID,
      actorName: `Discord Bot (${actorDiscordId})`,
      target: { collection: "matches", id: matchId },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch {
    // non bloquant
  }

  invalidateSiteCache();
  return { id: matchId, ...current, status: "live", changed: true };
};

/**
 * Vérifie sur Firestore tous les matchs `upcoming` et bascule automatiquement en `"live"`
 * ("En direct") ceux dont l'horaire est actuellement en cours (y compris les matchs créés depuis l'admin du site).
 */
export const syncUpcomingSiteMatchesToLive = async ({
  nowMs = Date.now(),
  defaultTimeZone = DEFAULT_TIMEZONE,
} = {}) => {
  const db = getFirestoreDb();
  if (!db) return [];

  const snap = await db.collection("matches").where("status", "==", "upcoming").get();
  const switched = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.date || ""))) continue;
    const startHm = parseMatchTime(data.time);
    if (!startHm) continue;

    const tz = data.timezone || defaultTimeZone;
    const startAtMs = zonedDateTimeToUtcMs(data.date, startHm, tz);
    if (!Number.isFinite(startAtMs)) continue;

    const endHm = data.endTime ? parseMatchTime(data.endTime) : null;
    let endAtMs = startAtMs + 2 * 60 * 60 * 1000;
    if (endHm) {
      const endDate = endHm <= startHm ? addDaysToIsoDate(data.date, 1) : data.date;
      const computedEnd = zonedDateTimeToUtcMs(endDate, endHm, tz);
      if (Number.isFinite(computedEnd) && computedEnd > startAtMs) {
        endAtMs = computedEnd;
      }
    }

    if (nowMs >= startAtMs && nowMs < endAtMs) {
      await docSnap.ref.update({
        status: "live",
        liveStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      switched.push({ id: docSnap.id, ...data, status: "live" });
    }
  }

  if (switched.length > 0) invalidateSiteCache();
  return switched;
};

/**
 * Passe en `"cancelled"` (Annulé) tous les matchs prévus/en cours sur le site pour un roster donné à une date ISO ("YYYY-MM-DD").
 */
export const cancelRosterMatchesForDateOnSite = async ({
  game,
  roster,
  date,
  actorDiscordId = "",
}) => {
  const db = requireDb();
  const targetGame = norm(game);
  const targetRoster = norm(roster);

  const snap = await db.collection("matches").where("date", "==", date).get();
  const cancelledMatches = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    if (norm(data.game) !== targetGame) continue;

    const docRoster = norm(data.roster);
    if (targetRoster ? docRoster !== targetRoster : Boolean(docRoster)) continue;

    const currentStatus = norm(data.status);
    if (currentStatus === "finished" || currentStatus === "cancelled") continue;

    await docSnap.ref.update({
      status: "cancelled",
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      cancelledByDiscordId: String(actorDiscordId || ""),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const updated = { id: docSnap.id, ...data, status: "cancelled" };
    cancelledMatches.push(updated);

    try {
      await db.collection("admin_audit").add({
        action: "match_cancelled",
        label: `[Bot Discord /cancel] ${data.game || game}${data.roster ? ` (${data.roster})` : ""} vs ${data.opponentName || docSnap.id}`,
        actorUid: OFFICIAL_FIREBASE_UID,
        actorName: `Discord Bot (${actorDiscordId || "player"})`,
        target: { collection: "matches", id: docSnap.id },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch {
      // non bloquant
    }
  }

  if (cancelledMatches.length > 0) invalidateSiteCache();
  return cancelledMatches;
};

/** Synchronise la liste des utilisateurs autorisés (/command-allowed) avec Firestore. */
export const loadAllowedUsersFromFirestore = async () => {
  const db = getFirestoreDb();
  if (!db) return null;
  try {
    const snap = await db.collection("discordBot").doc("permissions").get();
    if (!snap.exists) return [];
    const list = snap.data()?.allowedUsers;
    return Array.isArray(list) ? list.map(String) : [];
  } catch (err) {
    console.warn("[Firebase] Lecture permissions bot ignorée :", err.message);
    return null;
  }
};

export const saveAllowedUsersToFirestore = async (userIds = []) => {
  const db = getFirestoreDb();
  if (!db) return;
  try {
    await db.collection("discordBot").doc("permissions").set(
      {
        allowedUsers: [...new Set(userIds.map(String))],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn("[Firebase] Sauvegarde permissions bot ignorée :", err.message);
  }
};
