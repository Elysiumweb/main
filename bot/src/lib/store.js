import fs from "node:fs";
import path from "node:path";
import {
  DATA_DIR,
  MATCH_FILES_DIR,
  STATE_FILE_PATH,
  TICKET_FILES_DIR,
} from "../config.js";
import {
  loadAllowedUsersFromFirestore,
  saveAllowedUsersToFirestore,
} from "./firebase.js";

const DEFAULT_STATE = () => ({
  allowedUsers: [],
  scheduledMatches: {},
  scrimRequests: {},
  ticketPanels: {},
  tickets: {},
  dmSessions: {},
  counters: {
    panel: 0,
    ticket: 0,
    match: 0,
    scrim: 0,
  },
});

let state = null;
let stateFileOverride = null;

const getActiveStateFile = () => stateFileOverride || STATE_FILE_PATH;

export const ensureDirectories = () => {
  for (const dir of [DATA_DIR, TICKET_FILES_DIR, MATCH_FILES_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export const __setStateFileForTests = (customPath) => {
  stateFileOverride = customPath;
  state = null;
};

export const getState = () => {
  if (state) return state;
  ensureDirectories();
  const filePath = getActiveStateFile();
  if (fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      state = {
        ...DEFAULT_STATE(),
        ...parsed,
        scrimRequests: parsed.scrimRequests || {},
        counters: { ...DEFAULT_STATE().counters, ...(parsed.counters || {}) },
      };
      return state;
    } catch (err) {
      console.error("[Store] Fichier d'état corrompu, réinitialisation prudente :", err.message);
    }
  }
  state = DEFAULT_STATE();
  return state;
};

/** Écriture atomique sur disque pour éviter toute corruption en cas d'arrêt brutal. */
export const saveState = () => {
  const current = getState();
  const filePath = getActiveStateFile();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(current, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
  return current;
};

/** Fusionne au démarrage les permissions stockées dans Firestore avec l'état local. */
export const syncPermissionsWithFirestore = async () => {
  const current = getState();
  const remote = await loadAllowedUsersFromFirestore();
  if (Array.isArray(remote)) {
    const merged = [...new Set([...current.allowedUsers, ...remote])];
    current.allowedUsers = merged;
    saveState();
    if (merged.length !== remote.length) {
      await saveAllowedUsersToFirestore(merged);
    }
  }
};

export const nextCounter = (key) => {
  const current = getState();
  current.counters[key] = (current.counters[key] || 0) + 1;
  saveState();
  return current.counters[key];
};

// --- Gestion des permissions (/command-allowed) ---
export const getAllowedUsers = () => [...getState().allowedUsers];

export const addAllowedUser = async (userId) => {
  const id = String(userId || "").trim();
  if (!id) return false;
  const current = getState();
  const already = current.allowedUsers.includes(id);
  if (!already) {
    current.allowedUsers.push(id);
    saveState();
    await saveAllowedUsersToFirestore(current.allowedUsers);
  }
  return !already;
};

export const removeAllowedUser = async (userId) => {
  const id = String(userId || "").trim();
  const current = getState();
  const before = current.allowedUsers.length;
  current.allowedUsers = current.allowedUsers.filter((u) => u !== id);
  const changed = current.allowedUsers.length !== before;
  if (changed) {
    saveState();
    await saveAllowedUsersToFirestore(current.allowedUsers);
  }
  return changed;
};

// --- Gestion des matchs planifiés (/ask-result) ---
export const saveScheduledMatch = (matchJob) => {
  const current = getState();
  current.scheduledMatches[matchJob.id] = matchJob;
  saveState();
  return matchJob;
};

export const getScheduledMatch = (id) => getState().scheduledMatches[id] || null;

export const listScheduledMatches = () => Object.values(getState().scheduledMatches);

const normKey = (v) => String(v || "").trim().toLowerCase();

const matchesRosterIdentity = (item, { game, roster }) => {
  if (normKey(item?.game) !== normKey(game)) return false;
  const targetRoster = normKey(roster);
  const itemRoster = normKey(item?.roster);
  return targetRoster ? itemRoster === targetRoster : !itemRoster;
};

/** Retourne les matchs en attente de replays/résultat dans un salon donné. */
export const getPendingResultMatchesInChannel = (channelId) =>
  listScheduledMatches()
    .filter(
      (m) =>
        m.channelId === String(channelId) &&
        m.endPromptSent === true &&
        m.completed !== true &&
        m.cancelled !== true
    )
    .sort((a, b) => (b.activeUploadAt || b.endAtMs || 0) - (a.activeUploadAt || a.endAtMs || 0));

/** Annule dans le planificateur local les matchs non terminés prévus pour un roster à une date donnée. */
export const cancelScheduledMatchesForRosterDate = ({
  game,
  roster,
  date,
  cancelledBy = "",
  nowMs = Date.now(),
}) => {
  const current = getState();
  const cancelledJobs = [];
  for (const job of Object.values(current.scheduledMatches)) {
    if (job.completed || job.cancelled) continue;
    if (job.date !== date) continue;
    if (!matchesRosterIdentity(job, { game, roster })) continue;
    job.cancelled = true;
    job.cancelledAt = nowMs;
    job.cancelledBy = String(cancelledBy || "");
    cancelledJobs.push(job);
  }
  if (cancelledJobs.length > 0) saveState();
  return cancelledJobs;
};

// --- Gestion des demandes de scrim (/scrim & /cancel) ---
export const saveScrimRequest = (scrimReq) => {
  const current = getState();
  if (!current.scrimRequests) current.scrimRequests = {};
  current.scrimRequests[scrimReq.id] = scrimReq;
  saveState();
  return scrimReq;
};

export const listScrimRequests = () => Object.values(getState().scrimRequests || {});

export const getActiveScrimRequestsForRosterDate = ({ game, roster, date }) =>
  listScrimRequests()
    .filter(
      (r) =>
        r.status === "active" &&
        r.date === date &&
        matchesRosterIdentity(r, { game, roster })
    )
    .sort((a, b) => (a.startAtMs || 0) - (b.startAtMs || 0));

export const cancelScrimRequestsForRosterDate = ({
  game,
  roster,
  date,
  cancelledBy = "",
  nowMs = Date.now(),
}) => {
  const current = getState();
  if (!current.scrimRequests) current.scrimRequests = {};
  const cancelledList = [];
  for (const req of Object.values(current.scrimRequests)) {
    if (req.status !== "active") continue;
    if (req.date !== date) continue;
    if (!matchesRosterIdentity(req, { game, roster })) continue;
    req.status = "cancelled";
    req.cancelledAt = nowMs;
    req.cancelledBy = String(cancelledBy || "");
    cancelledList.push(req);
  }
  if (cancelledList.length > 0) saveState();
  return cancelledList.sort((a, b) => (a.startAtMs || 0) - (b.startAtMs || 0));
};

// --- Gestion des panneaux /send-message & des tickets ---
export const saveTicketPanel = (panel) => {
  const current = getState();
  current.ticketPanels[panel.id] = panel;
  saveState();
  return panel;
};

export const getTicketPanel = (panelId) => getState().ticketPanels[panelId] || null;
export const listTicketPanels = () => Object.values(getState().ticketPanels);

export const saveTicket = (ticket) => {
  const current = getState();
  current.tickets[ticket.id] = ticket;
  saveState();
  return ticket;
};

export const getTicket = (ticketId) => getState().tickets[ticketId] || null;

export const getTicketByChannelId = (channelId) =>
  Object.values(getState().tickets).find((t) => t.channelId === String(channelId)) || null;

export const setDmSession = (ownerId, session) => {
  const current = getState();
  current.dmSessions[String(ownerId)] = session;
  saveState();
  return session;
};

export const getDmSession = (ownerId) => getState().dmSessions[String(ownerId)] || null;
