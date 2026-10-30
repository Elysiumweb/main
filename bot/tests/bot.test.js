import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const DATA_IMAGE_RE = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i;
const isImageValue = (s) => DATA_IMAGE_RE.test(String(s ?? "").trim());
import {
  ALLOWED_GUILD_IDS,
  COMMUNITY_GUILD_ID,
  DONATION_URL,
  GOODBYE_CHANNEL_ID,
  LOGO_PATH,
  MATCH_GUILD_ID,
  OWNER_USER_ID,
  WELCOME_CHANNEL_ID,
  deriveClientIdFromToken,
} from "../src/config.js";
import {
  handleAskResultAutocomplete,
  handleAskResultCommand,
  handleMatchResultInteraction,
} from "../src/handlers/askResult.js";
import { handleCommandAllowed } from "../src/handlers/commandAllowed.js";
import {
  handleLinkAutocomplete,
  handleLinkCommand,
} from "../src/handlers/linkPlayer.js";
import {
  handleSendMessageCommand,
  handleTicketAndDmMessage,
  handleTicketInteraction,
} from "../src/handlers/tickets.js";
import {
  handleGuildMemberAdd,
  handleGuildMemberRemove,
} from "../src/handlers/welcomeGoodbye.js";
import {
  computeMatchSchedule,
  parseMatchDate,
  parseMatchTime,
} from "../src/lib/dateTime.js";
import {
  BANNER_ATTACHMENT_NAME,
  LOGO_ATTACHMENT_NAME,
  buildElysiumPayload,
} from "../src/lib/embeds.js";
import { __setFirestoreForTests, invalidateSiteCache } from "../src/lib/firebase.js";
import { processOpponentLogoBuffer } from "../src/lib/imageProcessor.js";
import { isCommandAllowedUser, isOwnerUser } from "../src/lib/permissions.js";
import {
  parseReplayBuffer,
  resolveReplaySideAndSeries,
} from "../src/lib/replayProcessor.js";
import { runSchedulerTick } from "../src/lib/scheduler.js";
import {
  __setStateFileForTests,
  getScheduledMatch,
  getTicket,
  saveScheduledMatch,
} from "../src/lib/store.js";
import {
  getCommunityGuildCommandsJson,
  getMatchGuildCommandsJson,
} from "../src/register-commands.js";
import { createBotClient } from "../src/index.js";

// ============================================================================
// Helpers : Générateur binaire de fichier .replay UE3 + Mock Firestore + Mock Discord
// ============================================================================

class ReplayBinaryWriter {
  constructor() {
    this.parts = [];
  }
  u32(v) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v >>> 0, true);
    this.parts.push(b);
    return this;
  }
  i32(v) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setInt32(0, v, true);
    this.parts.push(b);
    return this;
  }
  u64(v) {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigUint64(0, BigInt(v), true);
    this.parts.push(b);
    return this;
  }
  str(s) {
    if (s === "") return this.i32(0);
    const bytes = [...s].map((c) => c.charCodeAt(0));
    this.i32(bytes.length + 1);
    this.parts.push(Uint8Array.from([...bytes, 0]));
    return this;
  }
  raw(bytes) {
    this.parts.push(Uint8Array.from(bytes));
    return this;
  }
  toBuffer() {
    const total = this.parts.reduce((n, p) => n + p.length, 0);
    const out = Buffer.alloc(total);
    let off = 0;
    this.parts.forEach((p) => {
      out.set(p, off);
      off += p.length;
    });
    return out;
  }
}

const buildSyntheticReplayBuffer = ({
  id = "0123456789ABCDEF0123456789ABCDEF",
  date = "2026-10-30 20-15-00",
  map = "Mannfield_P",
  blue = 3,
  orange = 1,
  players = [],
} = {}) => {
  const w = new ReplayBinaryWriter();
  w.u32(5000).u32(0).u32(868).u32(18).u32(0).str("TAGame.Replay_Soccar_TA");
  const intP = (k, v) => w.str(k).str("IntProperty").u64(4).i32(v);
  const strP = (k, v) => w.str(k).str("StrProperty").u64(v.length + 5).str(v);
  const nameP = (k, v) => w.str(k).str("NameProperty").u64(v.length + 5).str(v);
  intP("TeamSize", 3);
  strP("Id", id);
  strP("Date", date);
  nameP("MapName", map);
  nameP("MatchType", "Online");
  if (blue) intP("Team0Score", blue);
  if (orange) intP("Team1Score", orange);
  w.str("PlayerStats").str("ArrayProperty").u64(0).u32(players.length);
  for (const p of players) {
    strP("Name", p.name);
    const plat = "OnlinePlatform_Steam";
    w.str("Platform").str("ByteProperty").u64(plat.length + 5).str(plat);
    w.str("OnlineID").str("QWordProperty").u64(8).u64(p.onlineId || "76561198000000001");
    intP("Team", p.team);
    intP("Score", p.score ?? 400);
    intP("Goals", p.goals ?? 1);
    intP("Assists", p.assists ?? 0);
    intP("Saves", p.saves ?? 1);
    intP("Shots", p.shots ?? 3);
    w.str("bBot").str("BoolProperty").u64(0).raw([0]);
    w.str("None");
  }
  w.str("None");
  return w.toBuffer();
};

/** Mock léger en mémoire de Firestore pour tester toutes les lectures/écritures site. */
const createInMemoryFirestore = (seed = {}) => {
  const store = new Map();
  let autoId = 1;

  const ensureCol = (colName) => {
    if (!store.has(colName)) store.set(colName, new Map());
    return store.get(colName);
  };

  for (const [col, docs] of Object.entries(seed)) {
    const colMap = ensureCol(col);
    for (const [id, data] of Object.entries(docs)) {
      colMap.set(id, structuredClone(data));
    }
  }

  const makeDocRef = (colName, id) => ({
    id,
    async get() {
      const colMap = ensureCol(colName);
      const exists = colMap.has(id);
      return {
        id,
        exists,
        ref: makeDocRef(colName, id),
        data: () => (exists ? structuredClone(colMap.get(id)) : undefined),
      };
    },
    async set(data, opts = {}) {
      const colMap = ensureCol(colName);
      const prev = opts.merge && colMap.has(id) ? colMap.get(id) : {};
      colMap.set(id, { ...prev, ...structuredClone(data) });
    },
    async update(patch) {
      const colMap = ensureCol(colName);
      if (!colMap.has(id)) throw new Error(`Doc ${colName}/${id} not found`);
      colMap.set(id, { ...colMap.get(id), ...structuredClone(patch) });
    },
  });

  const makeQuery = (colName, filters = [], max = Infinity) => ({
    where(field, op, val) {
      return makeQuery(colName, [...filters, { field, op, val }], max);
    },
    limit(n) {
      return makeQuery(colName, filters, n);
    },
    async get() {
      const colMap = ensureCol(colName);
      let entries = [...colMap.entries()];
      for (const f of filters) {
        if (f.op === "==") {
          entries = entries.filter(([, data]) => data?.[f.field] === f.val);
        }
      }
      entries = entries.slice(0, max);
      const docs = entries.map(([id, data]) => ({
        id,
        exists: true,
        ref: makeDocRef(colName, id),
        data: () => structuredClone(data),
      }));
      return {
        empty: docs.length === 0,
        size: docs.length,
        docs,
        forEach: (cb) => docs.forEach(cb),
      };
    },
  });

  return {
    store,
    collection(colName) {
      return {
        ...makeQuery(colName),
        doc: (id) => makeDocRef(colName, id),
        async add(data) {
          const id = `doc_${autoId++}`;
          ensureCol(colName).set(id, structuredClone(data));
          return makeDocRef(colName, id);
        },
      };
    },
  };
};

// ============================================================================
// Tests
// ============================================================================

test("Configuration, extraction Client ID et définitions des 4 commandes Slash", () => {
  const syntheticToken = `${Buffer.from("1565640632779677796").toString("base64")}.test00.synthetic_unit_test_sig`;
  const clientId = deriveClientIdFromToken(syntheticToken);
  assert.equal(clientId, "1565640632779677796");
  assert.deepEqual(ALLOWED_GUILD_IDS, ["1565264995078508554", "1526866278462001202"]);

  const matchCmds = getMatchGuildCommandsJson();
  const communityCmds = getCommunityGuildCommandsJson();

  assert.deepEqual(
    matchCmds.map((c) => c.name),
    ["ask-result", "link", "command-allowed"]
  );
  assert.deepEqual(
    communityCmds.map((c) => c.name),
    ["send-message", "command-allowed"]
  );

  const askCmd = matchCmds.find((c) => c.name === "ask-result");
  const optNames = askCmd.options.map((o) => o.name);
  assert.deepEqual(optNames, [
    "jeu",
    "roster",
    "date",
    "heure_match",
    "heure_fin",
    "format",
    "nom_match",
    "mot_de_passe",
    "equipe_adverse",
    "logo_adversaire",
    "id_channel",
  ]);
});

test("Style Elysium : logo attaché et bannière systématiquement en bas des messages", () => {
  const simple = buildElysiumPayload({
    title: "Test Simple",
    description: "Contenu de test",
  });
  assert.equal(simple.embeds.length, 1);
  assert.equal(
    simple.embeds[0].data.image?.url,
    `attachment://${BANNER_ATTACHMENT_NAME}`
  );
  assert.equal(
    simple.embeds[0].data.author?.icon_url,
    `attachment://${LOGO_ATTACHMENT_NAME}`
  );

  // Avec des images de preview intermédiaires : la bannière reste sur le tout dernier embed en bas
  const withPreviews = buildElysiumPayload({
    title: "Preview Design",
    description: "Aperçu client",
    extraImages: [
      { attachment: LOGO_PATH, name: "preview_1.png" },
      { attachment: LOGO_PATH, name: "preview_2.png" },
    ],
  });
  assert.equal(withPreviews.embeds.length, 4); // 1 principal + 2 previews + 1 bannière finale
  assert.equal(withPreviews.embeds[1].data.image?.url, "attachment://preview_1.png");
  assert.equal(withPreviews.embeds[2].data.image?.url, "attachment://preview_2.png");
  assert.equal(
    withPreviews.embeds[3].data.image?.url,
    `attachment://${BANNER_ATTACHMENT_NAME}`
  );
});

test("Dates, heures et calcul de créneau Europe/Paris (y compris passage minuit)", () => {
  const refNow = new Date("2026-10-30T10:00:00Z");
  assert.equal(parseMatchDate("30/10/2026", { now: refNow }), "2026-10-30");
  assert.equal(parseMatchDate("2026-10-30", { now: refNow }), "2026-10-30");
  assert.equal(parseMatchDate("30/10", { now: refNow }), "2026-10-30");
  assert.equal(parseMatchDate("aujourd'hui", { now: refNow }), "2026-10-30");
  assert.equal(parseMatchDate("demain", { now: refNow }), "2026-10-31");
  assert.equal(parseMatchDate("31/02/2026", { now: refNow }), null);

  assert.equal(parseMatchTime("20:00"), "20:00");
  assert.equal(parseMatchTime("20h30"), "20:30");
  assert.equal(parseMatchTime("9h"), "09:00");
  assert.equal(parseMatchTime("25:00"), null);

  // 30 octobre 2026 = heure d'hiver à Paris (UTC+1) -> 20:00 Paris = 19:00 UTC
  const sched = computeMatchSchedule({
    dateInput: "30/10/2026",
    startTimeInput: "20:00",
    endTimeInput: "21:30",
    timeZone: "Europe/Paris",
    now: refNow,
  });
  assert.equal(sched.ok, true);
  assert.equal(new Date(sched.startAtMs).toISOString(), "2026-10-30T19:00:00.000Z");
  assert.equal(new Date(sched.endAtMs).toISOString(), "2026-10-30T20:30:00.000Z");

  // Match finissant après minuit (23:30 -> 00:30)
  const nightSched = computeMatchSchedule({
    dateInput: "30/10/2026",
    startTimeInput: "23:30",
    endTimeInput: "00:30",
    timeZone: "Europe/Paris",
    now: refNow,
  });
  assert.equal(nightSched.ok, true);
  assert.equal(nightSched.endDate, "2026-10-31");
  assert.ok(nightSched.endAtMs > nightSched.startAtMs);
});

test("Compression logo adverse compatible avec Firestore (< 600 Ko) et isImageValue du site", async () => {
  const rawBuffer = fs.readFileSync(LOGO_PATH);
  const processed = await processOpponentLogoBuffer(rawBuffer);
  assert.ok(processed.bytes > 0 && processed.bytes <= 600 * 1024);
  assert.equal(isImageValue(processed.dataUrl), true);
  assert.ok(processed.discordThumbnailBuffer.byteLength > 0);
});

test("Analyse .replay : inversion automatique des couleurs, doublons et multi-pseudos /link", () => {
  const members = [
    { id: "p1", pseudo: "ElysiumZen", aliases: ["Zen_Smurf", "RL_Zen"] },
    { id: "p2", pseudo: "ElysiumVatira", aliases: ["Vati_Alt"] },
  ];

  // Série de 5 games où l'équipe ORANGE (Team 1) gagne 4-1 contre BLEU (Team 0)
  const makeGame = (idx, blueGoals, orangeGoals) =>
    parseReplayBuffer(
      buildSyntheticReplayBuffer({
        id: `${String(idx).repeat(32)}`.slice(0, 32),
        date: `2026-10-30 20-0${idx}-00`,
        map: "DFHStadium_P",
        blue: blueGoals,
        orange: orangeGoals,
        players: [
          { name: "Adversaire1", onlineId: "1001", team: 0, score: 300, goals: blueGoals, assists: 0, saves: 1, shots: 3 },
          { name: "Zen_Smurf", onlineId: "2001", team: 1, score: 650, goals: orangeGoals, assists: 1, saves: 2, shots: 5 },
          { name: "Vati_Alt", onlineId: "2002", team: 1, score: 420, goals: 0, assists: orangeGoals, saves: 3, shots: 2 },
        ],
      }),
      `game_${idx}.replay`
    );

  const g1 = makeGame(1, 1, 3); // Orange W
  const g2 = makeGame(2, 2, 1); // Blue W
  const g3 = makeGame(3, 0, 2); // Orange W
  const g4 = makeGame(4, 1, 4); // Orange W
  const g5 = makeGame(5, 2, 3); // Orange W

  // Cas 1 : l'utilisateur déclare 4 Elysium - 1 Adversaire -> le bot inverse automatiquement sur "orange" !
  const inverted = resolveReplaySideAndSeries({
    games: [g1, g2, g3, g4, g5, g1], // g1 en double exact : dédoublonné automatiquement !
    declaredScoreUs: 4,
    declaredScoreThem: 1,
    members,
  });

  assert.equal(inverted.duplicateIdsRemoved, 1);
  assert.equal(inverted.side, "orange");
  assert.equal(inverted.scoreUs, 4);
  assert.equal(inverted.scoreThem, 1);
  assert.equal(inverted.players.length, 2);
  assert.equal(inverted.players.find((p) => p.playerId === "p1")?.pseudo, "ElysiumZen");
  assert.equal(inverted.mvp, "p1");

  // Cas 2 : replay supplémentaire / remake (scores pas exactement identiques : 5-1 dans les replays vs 4-1 déclaré)
  const g6Extra = makeGame(6, 0, 3); // Orange gagne une 5e game
  const withDuplicateGame = resolveReplaySideAndSeries({
    games: [g1, g2, g3, g4, g5, g6Extra],
    declaredScoreUs: 4,
    declaredScoreThem: 1,
    members,
  });
  assert.equal(withDuplicateGame.side, "orange");
  assert.ok(withDuplicateGame.scoreUs > withDuplicateGame.scoreThem); // La victoire va bien à Elysium !

  // Cas 3 : si un replay en double crée une égalité 1-1 dans les replays alors que 2-1 est déclaré
  const tiedByMistake = resolveReplaySideAndSeries({
    games: [g1, g2], // 1-1
    declaredScoreUs: 2,
    declaredScoreThem: 1,
    members,
  });
  assert.equal(tiedByMistake.side, "orange"); // détecté grâce aux pseudos /link !
  assert.equal(tiedByMistake.scoreUs, 2);
  assert.equal(tiedByMistake.scoreThem, 1);
});

test("Permissions (/command-allowed) et liaison multi-pseudos (/link) avec Firestore", async () => {
  const tmpState = path.join(os.tmpdir(), `elysium-bot-test-${Date.now()}.json`);
  __setStateFileForTests(tmpState);

  const mockDb = createInMemoryFirestore({
    rosters: {
      r1: { game: "Rocket League", name: "Black" },
      r2: { game: "EVA", name: "Gold" },
    },
    roster: {
      player_1: { pseudo: "Karmine", game: "Rocket League", roster: "Black", status: "player", aliases: [] },
    },
  });
  __setFirestoreForTests(mockDb);
  invalidateSiteCache();

  // Par défaut, seul OWNER_USER_ID est autorisé
  assert.equal(isOwnerUser(OWNER_USER_ID), true);
  assert.equal(isCommandAllowedUser(OWNER_USER_ID), true);
  assert.equal(isCommandAllowedUser("999999999999999999"), false);

  // Un utilisateur non-owner tente /command-allowed -> refusé
  let lastReply = null;
  await handleCommandAllowed({
    user: { id: "999999999999999999" },
    options: { getUser: () => ({ id: "888888888888888888" }), getString: () => "add" },
    reply: async (p) => { lastReply = p; },
  });
  assert.ok(lastReply.embeds[0].data.title.includes("Accès refusé"));
  assert.equal(isCommandAllowedUser("888888888888888888"), false);

  // L'owner 520496557146243072 ajoute l'utilisateur 888888888888888888 via /command-allowed
  await handleCommandAllowed({
    user: { id: OWNER_USER_ID },
    options: { getUser: () => ({ id: "888888888888888888" }), getString: () => null },
    reply: async (p) => { lastReply = p; },
  });
  assert.equal(isCommandAllowedUser("888888888888888888"), true);

  // L'utilisateur 888888888888888888 utilise /link pour relier DEUX pseudos au même joueur du site
  let autocompleteChoices = [];
  await handleLinkAutocomplete({
    user: { id: "888888888888888888" },
    options: { getFocused: () => "" },
    respond: async (c) => { autocompleteChoices = c; },
  });
  assert.equal(autocompleteChoices.length, 1);
  assert.equal(autocompleteChoices[0].value, "player_1");

  for (const alias of ["Pseudo_RL_1", "Pseudo_RL_2"]) {
    await handleLinkCommand({
      guildId: MATCH_GUILD_ID,
      user: { id: "888888888888888888" },
      deferred: false,
      replied: false,
      deferReply: async function () { this.deferred = true; },
      editReply: async (p) => { lastReply = p; },
      options: {
        getString: (k) => (k === "pseudo" ? alias : "player_1"),
        getBoolean: () => false,
      },
    });
  }

  const updatedPlayer = mockDb.store.get("roster").get("player_1");
  assert.deepEqual(updatedPlayer.aliases, ["Pseudo_RL_1", "Pseudo_RL_2"]);

  fs.rmSync(tmpState, { force: true });
});

test("Flux complet Match : /ask-result -> annonce début -> demande fin -> replays + score -> site terminé", async () => {
  const tmpState = path.join(os.tmpdir(), `elysium-match-test-${Date.now()}.json`);
  __setStateFileForTests(tmpState);

  const mockDb = createInMemoryFirestore({
    rosters: {
      r1: { game: "Rocket League", name: "Alpha" },
    },
    roster: {
      p_alpha: {
        pseudo: "Skywalker",
        game: "Rocket League",
        roster: "Alpha",
        status: "player",
        aliases: ["Sky_InGame"],
      },
    },
  });
  __setFirestoreForTests(mockDb);
  invalidateSiteCache();

  // Vérifie que l'autocomplétion de /ask-result propose les jeux et rosters du site
  let gameChoices = [];
  await handleAskResultAutocomplete({
    user: { id: OWNER_USER_ID },
    options: { getFocused: () => ({ name: "jeu", value: "" }) },
    respond: async (c) => { gameChoices = c; },
  });
  assert.ok(gameChoices.some((c) => c.value === "Rocket League"));
  assert.ok(gameChoices.some((c) => c.value === "EVA"));

  let rosterChoices = [];
  await handleAskResultAutocomplete({
    user: { id: OWNER_USER_ID },
    options: {
      getFocused: () => ({ name: "roster", value: "" }),
      getString: (k) => (k === "jeu" ? "Rocket League" : ""),
    },
    respond: async (c) => { rosterChoices = c; },
  });
  assert.deepEqual(rosterChoices, [{ name: "Alpha", value: "Alpha" }]);

  // Salon Discord simulé
  const sentMessages = [];
  const messageStore = new Map();
  const mockMatchChannel = {
    id: "1999999999999999999",
    name: "matchs-rl",
    isTextBased: () => true,
    send: async (payload) => {
      const msg = {
        id: `msg_${sentMessages.length + 1}`,
        payload,
        edit: async function (nextPayload) {
          this.payload = nextPayload;
          return this;
        },
      };
      sentMessages.push(msg);
      messageStore.set(msg.id, msg);
      return msg;
    },
    messages: {
      fetch: async (id) => messageStore.get(id) || null,
    },
  };

  // Serveur HTTP local éphémère ou data URL pour simuler le téléchargement du logo adverse Discord
  const logoDataUri = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString("base64")}`;

  let askResultReply = null;
  await handleAskResultCommand({
    guildId: MATCH_GUILD_ID,
    user: { id: OWNER_USER_ID },
    guild: {
      channels: {
        cache: new Map([[mockMatchChannel.id, mockMatchChannel]]),
        fetch: async (id) => (id === mockMatchChannel.id ? mockMatchChannel : null),
      },
    },
    deferred: false,
    replied: false,
    deferReply: async function () { this.deferred = true; },
    editReply: async (p) => { askResultReply = p; },
    options: {
      getString: (k) =>
        ({
          jeu: "Rocket League",
          roster: "Alpha",
          date: "30/10/2026",
          heure_match: "20:00",
          heure_fin: "21:00",
          format: "BO5",
          nom_match: "ELY_LOBBY_42",
          mot_de_passe: "SECRET99",
          equipe_adverse: "Vitality",
          id_channel: mockMatchChannel.id,
        })[k],
      getAttachment: () => ({
        name: "vitality.png",
        contentType: "image/png",
        url: logoDataUri,
      }),
    },
  });

  assert.ok(askResultReply.embeds[0].data.title.includes("Match programmé"));
  assert.equal(mockDb.store.get("matches").size, 1);
  const [siteMatchId, createdSiteMatch] = [...mockDb.store.get("matches").entries()][0];
  assert.equal(createdSiteMatch.status, "upcoming");
  assert.equal(createdSiteMatch.game, "Rocket League");
  assert.equal(createdSiteMatch.roster, "Alpha");
  assert.equal(createdSiteMatch.opponentName, "Vitality");
  assert.equal(createdSiteMatch.date, "2026-10-30");
  assert.equal(createdSiteMatch.time, "20:00");
  assert.ok(createdSiteMatch.opponentLogo.startsWith("data:image/webp;base64,"));

  const mockClient = {
    channels: {
      fetch: async (id) => (id === mockMatchChannel.id ? mockMatchChannel : null),
    },
  };

  // 1) À l'heure du début (20:00 Paris = 19:00 UTC) : le bot annonce le match + identifiants + "Elysium ouvre"
  const startMs = Date.parse("2026-10-30T19:00:05Z");
  await runSchedulerTick(mockClient, startMs);
  assert.equal(sentMessages.length, 1);
  const startEmbed = sentMessages[0].payload.embeds[0].data;
  assert.ok(startEmbed.description.includes("Elysium qui ouvre"));
  const allStartFields = startEmbed.fields.map((f) => `${f.name} ${f.value}`).join("\n");
  assert.ok(allStartFields.includes("ELY_LOBBY_42"));
  assert.ok(allStartFields.includes("SECRET99"));
  assert.ok(allStartFields.includes("BO5"));
  assert.ok(allStartFields.includes("Vitality"));

  // 2) À l'heure de fin (21:00 Paris = 20:00 UTC) : le bot demande tous les replays + le score
  const endMs = Date.parse("2026-10-30T20:00:05Z");
  await runSchedulerTick(mockClient, endMs);
  assert.equal(sentMessages.length, 2);
  const endPromptEmbed = sentMessages[1].payload.embeds[0].data;
  assert.ok(endPromptEmbed.title.includes("FIN DU MATCH"));

  // 3) Ajout de replays dans l'état du match (côté Orange gagnant 3-1) + saisie du score 3-1 + validation
  const scheduledJobId = [...Object.keys(JSON.parse(fs.readFileSync(tmpState, "utf8")).scheduledMatches)][0];
  const job = getScheduledMatch(scheduledJobId);

  for (let i = 1; i <= 4; i += 1) {
    const orangeWins = i !== 2;
    job.uploadedReplays.push(
      parseReplayBuffer(
        buildSyntheticReplayBuffer({
          id: `${String(i).repeat(32)}`.slice(0, 32),
          date: `2026-10-30 20-1${i}-00`,
          map: "ChampionsField_P",
          blue: orangeWins ? 1 : 3,
          orange: orangeWins ? 4 : 1,
          players: [
            { name: "Sky_InGame", onlineId: "9001", team: 1, score: 700, goals: 3, assists: 1, saves: 2, shots: 6 },
            { name: "ZenVitality", onlineId: "8001", team: 0, score: 350, goals: 1, assists: 0, saves: 1, shots: 3 },
          ],
        }),
        `match_g${i}.replay`
      )
    );
  }
  saveScheduledMatch(job);

  // Saisie du score via la modale (3 Elysium - 1 Vitality)
  await handleMatchResultInteraction({
    customId: `match_score_modal:${scheduledJobId}`,
    isButton: () => false,
    isModalSubmit: () => true,
    channel: mockMatchChannel,
    fields: {
      getTextInputValue: (k) => (k === "score_us" ? "3" : "1"),
    },
    reply: async () => {},
  });

  // Clic sur Envoyer -> mise à jour automatique du match sur le site
  await handleMatchResultInteraction({
    customId: `match_submit_result:${scheduledJobId}`,
    isButton: () => true,
    isModalSubmit: () => false,
    user: { id: "777777777777777777" },
    guild: { channels: { cache: new Map([[mockMatchChannel.id, mockMatchChannel]]) } },
    client: mockClient,
    deferred: false,
    replied: false,
    deferReply: async function () { this.deferred = true; },
    editReply: async () => {},
  });

  const finishedMatch = mockDb.store.get("matches").get(siteMatchId);
  assert.equal(finishedMatch.status, "finished");
  assert.equal(finishedMatch.replaySide, "orange"); // Couleur inversée automatiquement pour correspondre au 3-1 !
  assert.equal(finishedMatch.scoreUs, 3);
  assert.equal(finishedMatch.scoreThem, 1);
  assert.equal(finishedMatch.replays.length, 4);
  assert.equal(finishedMatch.players.length, 1);
  assert.equal(finishedMatch.players[0].playerId, "p_alpha");
  assert.equal(finishedMatch.players[0].pseudo, "Skywalker");
  assert.equal(finishedMatch.mvp, "p_alpha");

  fs.rmSync(tmpState, { force: true });
});

test("Serveur 1565264995078508554 : Bienvenue, Au revoir et cycle complet Ticket -> MP -> Modif -> Final + Donation PayPal", async () => {
  const tmpState = path.join(os.tmpdir(), `elysium-ticket-test-${Date.now()}.json`);
  __setStateFileForTests(tmpState);

  // 1) Test Bienvenue & Au revoir
  const welcomeSent = [];
  const goodbyeSent = [];
  const welcomeCh = { id: WELCOME_CHANNEL_ID, isTextBased: () => true, send: async (p) => welcomeSent.push(p) };
  const goodbyeCh = { id: GOODBYE_CHANNEL_ID, isTextBased: () => true, send: async (p) => goodbyeSent.push(p) };

  const fakeMember = {
    id: "111222333444555666",
    displayName: "NeoPlayer",
    user: { tag: "NeoPlayer#0001", displayAvatarURL: () => "" },
    guild: {
      id: COMMUNITY_GUILD_ID,
      name: "Elysium Community",
      memberCount: 250,
      channels: {
        cache: new Map([
          [WELCOME_CHANNEL_ID, welcomeCh],
          [GOODBYE_CHANNEL_ID, goodbyeCh],
        ]),
        fetch: async () => null,
      },
    },
  };

  await handleGuildMemberAdd(fakeMember);
  await handleGuildMemberRemove(fakeMember);

  assert.equal(welcomeSent.length, 1);
  assert.ok(welcomeSent[0].content.includes("111222333444555666"));
  assert.equal(welcomeSent[0].embeds[0].data.image?.url, `attachment://${BANNER_ATTACHMENT_NAME}`);

  assert.equal(goodbyeSent.length, 1);
  assert.ok(goodbyeSent[0].embeds[0].data.description.includes("NeoPlayer"));
  assert.equal(goodbyeSent[0].embeds[0].data.image?.url, `attachment://${BANNER_ATTACHMENT_NAME}`);

  // 2) Test /send-message avec 2 panneaux distincts -> noms de tickets non mélangés
  const panelMessages = [];
  const panelChannel = {
    id: "222222222222222222",
    name: "commandes-design",
    parentId: "",
    isTextBased: () => true,
    send: async (p) => {
      const m = { id: `pmsg_${panelMessages.length + 1}`, payload: p };
      panelMessages.push(m);
      return m;
    },
  };

  for (const [btnLabel, prefix] of [
    ["Commander un Logo", "logo"],
    ["Commander une Bannière", "banniere"],
  ]) {
    await handleSendMessageCommand({
      guildId: COMMUNITY_GUILD_ID,
      user: { id: OWNER_USER_ID },
      deferred: false,
      replied: false,
      deferReply: async function () { this.deferred = true; },
      editReply: async () => {},
      options: {
        getChannel: (k) => (k === "salon" ? panelChannel : null),
        getString: (k) =>
          ({
            texte: `Cliquez ci-dessous pour ${btnLabel}`,
            bouton: btnLabel,
            identifiant_ticket: prefix,
            titre: btnLabel,
          })[k] || null,
      },
    });
  }

  assert.equal(panelMessages.length, 2);
  const panel1CustomId = panelMessages[0].payload.components[0].components[0].data.custom_id;
  const panel2CustomId = panelMessages[1].payload.components[0].components[0].data.custom_id;

  // Création d'un ticket sur chaque panneau -> noms de salons clairement identifiables et distincts
  const createdChannels = [];
  const channelMessages = new Map();
  const ownerDms = [];

  const mockOwnerUser = {
    id: OWNER_USER_ID,
    send: async (p) => {
      const m = { id: `dm_${ownerDms.length + 1}`, payload: p, edit: async function (np) { this.payload = np; return this; } };
      ownerDms.push(m);
      return m;
    },
  };

  const mockClient = {
    user: { id: "1565640632779677796" },
    users: { fetch: async (id) => (id === OWNER_USER_ID ? mockOwnerUser : null) },
    channels: { fetch: async (id) => createdChannels.find((c) => c.id === id) || null },
  };

  const mockGuild = {
    id: COMMUNITY_GUILD_ID,
    members: { fetch: async () => ({ id: OWNER_USER_ID }) },
    channels: {
      cache: new Map(),
      fetch: async () => null,
      create: async (opts) => {
        const chId = `tch_${createdChannels.length + 1}`;
        const msgs = [];
        channelMessages.set(chId, msgs);
        const ch = {
          id: chId,
          name: opts.name,
          topic: opts.topic,
          isTextBased: () => true,
          send: async (p) => {
            const m = {
              id: `tmsg_${msgs.length + 1}`,
              payload: p,
              edit: async function (np) { this.payload = np; return this; },
            };
            msgs.push(m);
            return m;
          },
          messages: {
            fetch: async (mId) => msgs.find((x) => x.id === mId) || null,
          },
        };
        createdChannels.push(ch);
        return ch;
      },
    },
  };

  for (const cid of [panel1CustomId, panel2CustomId]) {
    await handleTicketInteraction({
      customId: cid,
      isButton: () => true,
      isModalSubmit: () => false,
      guildId: COMMUNITY_GUILD_ID,
      guild: mockGuild,
      client: mockClient,
      user: { id: "333333333333333333", username: "ClientTest", tag: "ClientTest#1234" },
      deferred: false,
      replied: false,
      deferReply: async function () { this.deferred = true; },
      editReply: async () => {},
    });
  }

  assert.equal(createdChannels.length, 2);
  assert.equal(createdChannels[0].name, "ticket-logo-001-clienttest");
  assert.equal(createdChannels[1].name, "ticket-banniere-001-clienttest");

  // 3) Le client remplit sa demande sur le ticket 1 et l'envoie
  const allTicketIds = Object.keys(JSON.parse(fs.readFileSync(tmpState, "utf8")).tickets);
  const ticketId = allTicketIds[0];
  const ticketChannel = createdChannels[0];

  await handleTicketInteraction({
    customId: `ticket_initial_modal:${ticketId}`,
    isButton: () => false,
    isModalSubmit: () => true,
    channel: ticketChannel,
    user: { id: "333333333333333333" },
    fields: {
      getTextInputValue: (k) =>
        k === "detailed_description"
          ? "Je voudrais un logo esport doré et noir minimaliste en haute résolution."
          : "https://example.com/inspiration-logo.png",
    },
    reply: async () => {},
  });

  let waitingMessagePayload = null;
  await handleTicketInteraction({
    customId: `ticket_submit_initial:${ticketId}`,
    isButton: () => true,
    isModalSubmit: () => false,
    client: mockClient,
    user: { id: "333333333333333333" },
    deferUpdate: async () => {},
    editReply: async (p) => { waitingMessagePayload = p; },
  });

  // Vérifie le message d'attente dans le ticket ET le MP envoyé à 520496557146243072 avec bouton "Répondre"
  assert.ok(waitingMessagePayload.embeds[0].data.description.includes("prise en charge"));
  assert.ok(waitingMessagePayload.embeds[0].data.description.includes("patienter"));
  assert.equal(ownerDms.length, 1);
  assert.equal(
    ownerDms[0].payload.components[0].components[0].data.label,
    "Répondre"
  );

  // 4) 520496557146243072 clique sur "Répondre" en MP -> obtient les 3 boutons Preview / Final / Envoyée
  let studioPayload = null;
  const dmMessagesMap = new Map();
  const dmChannel = {
    id: "dm_channel_owner",
    messages: { fetch: async (id) => dmMessagesMap.get(id) || null },
  };

  await handleTicketInteraction({
    customId: `ticket_dm_reply:${ticketId}`,
    isButton: () => true,
    isModalSubmit: () => false,
    user: { id: OWNER_USER_ID },
    channelId: dmChannel.id,
    deferReply: async () => {},
    editReply: async (p) => {
      studioPayload = p;
      const msg = { id: "studio_msg_1", payload: p, edit: async function (np) { studioPayload = np; return this; } };
      dmMessagesMap.set(msg.id, msg);
      return msg;
    },
  });

  const studioButtons = studioPayload.components[0].components.map((b) => b.data.label);
  assert.deepEqual(studioButtons, ["Preview", "Final", "Envoyée"]);

  // Import d'un fichier dans Preview en MP
  const sampleImgUri = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString("base64")}`;
  await handleTicketAndDmMessage({
    author: { id: OWNER_USER_ID, bot: false },
    inGuild: () => false,
    channelId: dmChannel.id,
    channel: dmChannel,
    id: "dm_upload_1",
    attachments: new Map([
      ["att1", { id: "att1", name: "preview_v1.png", contentType: "image/png", url: sampleImgUri }],
    ]),
    react: async () => {},
  });

  // Bascule sur le bouton "Final" puis import de 2 fichiers finaux en MP
  await handleTicketInteraction({
    customId: `ticket_dm_bucket:${ticketId}:final`,
    isButton: () => true,
    isModalSubmit: () => false,
    user: { id: OWNER_USER_ID },
    channelId: dmChannel.id,
    message: { id: "studio_msg_1" },
    update: async (p) => { studioPayload = p; },
  });

  await handleTicketAndDmMessage({
    author: { id: OWNER_USER_ID, bot: false },
    inGuild: () => false,
    channelId: dmChannel.id,
    channel: dmChannel,
    id: "dm_upload_2",
    attachments: new Map([
      ["att2", { id: "att2", name: "logo_final_hd.png", contentType: "image/png", url: sampleImgUri }],
      ["att3", { id: "att3", name: "logo_vecteur.png", contentType: "image/png", url: sampleImgUri }],
    ]),
    react: async () => {},
  });

  assert.equal(getTicket(ticketId).currentPreviewFiles.length, 1);
  assert.equal(getTicket(ticketId).currentFinalFiles.length, 2);

  // Clic sur "Envoyée" -> envoie le preview dans le ticket avec Accepter / Demander une modification
  await handleTicketInteraction({
    customId: `ticket_dm_send:${ticketId}`,
    isButton: () => true,
    isModalSubmit: () => false,
    user: { id: OWNER_USER_ID },
    client: mockClient,
    deferUpdate: async () => {},
    editReply: async () => {},
  });

  const ticketMsgsAfterPreview = channelMessages.get(ticketChannel.id);
  const previewMsgInTicket = ticketMsgsAfterPreview[ticketMsgsAfterPreview.length - 1];
  const clientBtns = previewMsgInTicket.payload.components[0].components.map((b) => b.data.label);
  assert.deepEqual(clientBtns, ["Accepter", "Demander une modification"]);

  // 5) Le client demande d'abord une modification -> renvoyée à 520496557146243072
  await handleTicketInteraction({
    customId: `ticket_mod_modal:${ticketId}`,
    isButton: () => false,
    isModalSubmit: () => true,
    user: { id: "333333333333333333" },
    fields: {
      getTextInputValue: () => "Pouvez-vous éclaircir légèrement le doré du texte ?",
    },
    deferReply: async () => {},
    editReply: async () => ({ id: "mod_draft_1" }),
  });

  await handleTicketInteraction({
    customId: `ticket_submit_mod:${ticketId}`,
    isButton: () => true,
    isModalSubmit: () => false,
    client: mockClient,
    user: { id: "333333333333333333" },
    deferUpdate: async () => {},
    editReply: async () => {},
  });

  assert.equal(ownerDms.length, 2); // L'admin a bien reçu la demande de modification en MP avec bouton Répondre !
  assert.ok(ownerDms[1].payload.embeds[0].data.title.includes("Modification demandée"));

  // 6) L'admin renvoie une V2 (Preview + 2 fichiers Final) et le client clique sur "Accepter"
  await handleTicketInteraction({
    customId: `ticket_dm_reply:${ticketId}`,
    isButton: () => true,
    isModalSubmit: () => false,
    user: { id: OWNER_USER_ID },
    channelId: dmChannel.id,
    deferReply: async () => {},
    editReply: async (p) => {
      const msg = { id: "studio_msg_2", payload: p, edit: async () => msg };
      dmMessagesMap.set(msg.id, msg);
      return msg;
    },
  });

  await handleTicketAndDmMessage({
    author: { id: OWNER_USER_ID, bot: false },
    inGuild: () => false,
    channelId: dmChannel.id,
    channel: dmChannel,
    id: "dm_upload_3",
    attachments: new Map([
      ["att4", { id: "att4", name: "preview_v2.png", contentType: "image/png", url: sampleImgUri }],
    ]),
    react: async () => {},
  });

  await handleTicketInteraction({
    customId: `ticket_dm_bucket:${ticketId}:final`,
    isButton: () => true,
    isModalSubmit: () => false,
    user: { id: OWNER_USER_ID },
    channelId: dmChannel.id,
    message: { id: "studio_msg_2" },
    update: async () => {},
  });

  await handleTicketAndDmMessage({
    author: { id: OWNER_USER_ID, bot: false },
    inGuild: () => false,
    channelId: dmChannel.id,
    channel: dmChannel,
    id: "dm_upload_4",
    attachments: new Map([
      ["att5", { id: "att5", name: "final_v2_logo.png", contentType: "image/png", url: sampleImgUri }],
      ["att6", { id: "att6", name: "final_v2_transparent.png", contentType: "image/png", url: sampleImgUri }],
    ]),
    react: async () => {},
  });

  await handleTicketInteraction({
    customId: `ticket_dm_send:${ticketId}`,
    isButton: () => true,
    isModalSubmit: () => false,
    user: { id: OWNER_USER_ID },
    client: mockClient,
    deferUpdate: async () => {},
    editReply: async () => {},
  });

  const countBeforeAccept = channelMessages.get(ticketChannel.id).length;

  await handleTicketInteraction({
    customId: `ticket_client_accept:${ticketId}`,
    isButton: () => true,
    isModalSubmit: () => false,
    client: mockClient,
    channel: ticketChannel,
    user: { id: "333333333333333333" },
    deferUpdate: async () => {},
    editReply: async () => {},
  });

  const finalTicketMessages = channelMessages.get(ticketChannel.id).slice(countBeforeAccept);
  assert.equal(finalTicketMessages.length, 2); // 1 message avec tous les fichiers finaux + 1 message d'incitation au don PayPal !

  const filesMsg = finalTicketMessages[0].payload;
  // 2 fichiers de marque (logo + bannière) + 2 fichiers finaux livrés = 4 fichiers joints
  assert.equal(filesMsg.files.length, 4);

  const donateMsg = finalTicketMessages[1].payload;
  assert.ok(donateMsg.embeds[0].data.description.includes(DONATION_URL));
  assert.equal(
    donateMsg.components[0].components[0].data.url,
    "https://www.paypal.com/ncp/payment/8R9PKMBPRB45N"
  );
  assert.equal(
    donateMsg.embeds[0].data.image?.url,
    `attachment://${BANNER_ATTACHMENT_NAME}`
  );
  assert.equal(getTicket(ticketId).status, "completed");

  fs.rmSync(tmpState, { force: true });
});

test("Client Discord principal : instanciation propre et rejet immédiat des serveurs non autorisés", async () => {
  const client = createBotClient();
  assert.ok(client);

  let leftUnauthorizedGuild = false;
  await client.emit("guildCreate", {
    id: "999999999999999999",
    name: "Serveur Intrus",
    leave: async () => {
      leftUnauthorizedGuild = true;
    },
  });
  // Laisse la promesse du listener s'exécuter
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(leftUnauthorizedGuild, true);

  let leftAuthorizedGuild = false;
  await client.emit("guildCreate", {
    id: MATCH_GUILD_ID,
    name: "Serveur Officiel Matchs",
    leave: async () => {
      leftAuthorizedGuild = true;
    },
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(leftAuthorizedGuild, false);

  client.destroy();
});
