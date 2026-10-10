/**
 * Lecture des fichiers .replay de Rocket League directement dans le navigateur.
 *
 * Seul l'en-tête du replay est décodé (propriétés Unreal Engine 3 : scores,
 * carte, date, PlayerStats). Les frames ne sont pas lues et le fichier n'est
 * jamais envoyé au serveur : seules les données extraites sont enregistrées
 * dans le document du match.
 */

export const RL_GAME = "Rocket League";
export const REPLAY_SIDE_LABELS = { blue: "Bleu", orange: "Orange" };

// Team 0 = bleu, Team 1 = orange (valeurs internes des replays).
const TEAM_SIDES = { 0: "blue", 1: "orange" };
const MAX_STRING_CHARS = 4096;
const MAX_NESTING = 8;
const MAX_DURATION_SECONDS = 3 * 60 * 60;

const INVALID_REPLAY_MESSAGE = "Fichier .replay non reconnu (replay Rocket League attendu).";

export const isReplaySide = (side) => side === "blue" || side === "orange";
export const otherReplaySide = (side) => (side === "blue" ? "orange" : side === "orange" ? "blue" : "");

const norm = (value) => String(value || "").trim().toLowerCase();
const toInt = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
const text = (value) => (typeof value === "string" ? value.trim() : "");

/** Lecteur binaire minimal : chaînes UE3 (ASCII ou UTF-16 si longueur négative) et propriétés taguées. */
const createReader = (buffer) => {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let pos = 0;

  const fail = (reason) => {
    throw new Error(reason);
  };
  const need = (n) => {
    if (n < 0 || pos + n > bytes.length) fail("fin de fichier inattendue");
  };
  const u32 = () => {
    need(4);
    const value = view.getUint32(pos, true);
    pos += 4;
    return value;
  };
  const i32 = () => {
    need(4);
    const value = view.getInt32(pos, true);
    pos += 4;
    return value;
  };
  const u64 = () => {
    need(8);
    const value = Number(view.getBigUint64(pos, true));
    pos += 8;
    return value;
  };

  /** Octets occupés par une chaîne à la position donnée, ou -1 si ce n'est pas une chaîne valide. */
  const stringBytesAt = (at) => {
    if (at + 4 > bytes.length) return -1;
    const len = view.getInt32(at, true);
    if (len === 0) return 4;
    const chars = Math.abs(len);
    if (chars > MAX_STRING_CHARS) return -1;
    const total = 4 + (len < 0 ? chars * 2 : chars);
    return at + total <= bytes.length ? total : -1;
  };

  /** Vrai si une chaîne ASCII imprimable, terminée par un zéro, commence à `at`. */
  const isPrintableStringAt = (at) => {
    const total = stringBytesAt(at);
    if (total <= 0) return false;
    const len = view.getInt32(at, true);
    if (len <= 0) return false;
    for (let i = 0; i < len - 1; i += 1) {
      const c = bytes[at + 4 + i];
      if (c < 32 || c > 126) return false;
    }
    return bytes[at + 4 + len - 1] === 0;
  };

  const readString = () => {
    const len = i32();
    if (len === 0) return "";
    const chars = Math.abs(len);
    if (chars > MAX_STRING_CHARS) fail("chaîne trop longue");
    let out = "";
    if (len < 0) {
      need(chars * 2);
      for (let i = 0; i < chars - 1; i += 1) out += String.fromCharCode(view.getUint16(pos + i * 2, true));
      pos += chars * 2;
      return out;
    }
    need(chars);
    for (let i = 0; i < chars - 1; i += 1) out += String.fromCharCode(bytes[pos + i]);
    pos += chars;
    return out;
  };

  const readByteValue = (size, name) => {
    // Selon le build, le nom d'enum précède la valeur (hors `size`) ou la valeur est directement une chaîne.
    const plainLength = stringBytesAt(pos);
    if (plainLength > 0 && plainLength === size) return readString();
    if (size === 1) {
      need(1);
      const value = bytes[pos];
      pos += 1;
      return value;
    }
    if (plainLength > 0 && plainLength < size) {
      pos += plainLength;
      const start = pos;
      const value = readString();
      if (pos - start !== size) fail(`propriété ${name} incohérente`);
      return value;
    }
    return fail(`propriété ${name} non prise en charge`);
  };

  const readBool = () => {
    // Largeur de la valeur : 1 octet le plus souvent, 4 octets sur certains builds.
    if (isPrintableStringAt(pos + 1)) {
      need(1);
      const value = bytes[pos] !== 0;
      pos += 1;
      return value;
    }
    if (isPrintableStringAt(pos + 4)) return u32() !== 0;
    return fail("booléen non reconnu");
  };

  const readProperties = (depth) => {
    if (depth > MAX_NESTING) fail("structure trop profonde");
    const out = Object.create(null);
    for (;;) {
      const name = readString();
      if (name === "None") return out;
      const type = readString();
      const size = u64();
      switch (type) {
        case "IntProperty":
          out[name] = i32();
          break;
        case "FloatProperty":
          need(4);
          out[name] = view.getFloat32(pos, true);
          pos += 4;
          break;
        case "QWordProperty":
          need(8);
          out[name] = view.getBigUint64(pos, true).toString();
          pos += 8;
          break;
        case "StrProperty":
        case "NameProperty":
          out[name] = readString();
          break;
        case "BoolProperty":
          out[name] = readBool();
          break;
        case "ByteProperty":
          out[name] = readByteValue(size, name);
          break;
        case "ArrayProperty": {
          const count = u32();
          if (count > bytes.length - pos) fail("tableau trop grand");
          const items = [];
          for (let i = 0; i < count; i += 1) items.push(readProperties(depth + 1));
          out[name] = items;
          break;
        }
        case "StructProperty":
          // Structures natives (ex. UniqueNetId) : non utilisées, on saute leur contenu.
          readString();
          need(size);
          pos += size;
          out[name] = null;
          break;
        default:
          fail(`type de propriété inconnu : ${type}`);
      }
    }
  };

  return { u32, skip: (n) => { need(n); pos += n; }, readString, readProperties };
};

/** Décode l'en-tête d'un replay (dictionnaire brut des propriétés). */
export const parseReplayHeader = (buffer) => {
  const reader = createReader(buffer);
  reader.skip(8); // taille de l'en-tête + CRC
  const major = reader.u32();
  const minor = reader.u32();
  if (major >= 868 && minor >= 18) reader.u32(); // version réseau
  const className = reader.readString();
  if (!className.startsWith("TAGame.")) throw new Error(`classe de replay inconnue : ${className}`);
  return reader.readProperties(0);
};

/** "2017-08-09 20-58-07", "2015-10-27:18-29" → { date: "2017-08-09", dateTime: "2017-08-09 20:58:07" } */
export const parseReplayDate = (raw) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ :](\d{2})-(\d{2})(?:-(\d{2}))?)?$/.exec(String(raw || "").trim());
  if (!match) return { date: "", dateTime: "" };
  const [, y, mo, d, hh = "00", mi = "00", ss = "00"] = match;
  return { date: `${y}-${mo}-${d}`, dateTime: `${y}-${mo}-${d} ${hh}:${mi}:${ss}` };
};

/** "Underwater_P" → "Underwater", "UtopiaStadium_Lux_P" → "Utopia Stadium Lux" (modifiable ensuite dans le formulaire). */
export const prettifyMapName = (raw) => {
  const base = String(raw || "")
    .replace(/_p$/i, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
};

const normalizePlatform = (raw) => text(raw).replace(/^OnlinePlatform_/, "");

/** Clé stable d'un joueur du replay : identifiant en ligne si connu, sinon pseudo. */
export const replayPlayerKey = (player) => (
  player.onlineId && player.onlineId !== "0"
    ? `id:${player.onlineId}`
    : `name:${norm(player.name)}`
);

/** Transforme l'en-tête brut en objet de game exploitable (et stockable dans Firestore). */
export const normalizeReplayHeader = (header, fileName = "") => {
  const id = text(header.Id).toUpperCase();
  if (!/^[0-9A-F]{32}$/.test(id)) throw new Error(INVALID_REPLAY_MESSAGE);
  const hasScore = "Team0Score" in header || "Team1Score" in header;
  const players = Array.isArray(header.PlayerStats)
    ? header.PlayerStats.flatMap((stat) => {
      const side = TEAM_SIDES[toInt(stat.Team)];
      if (!side) return []; // spectateur ou joueur hors équipe
      return [{
        name: text(stat.Name),
        platform: normalizePlatform(stat.Platform),
        onlineId: text(stat.OnlineID),
        side,
        score: toInt(stat.Score),
        goals: toInt(stat.Goals),
        assists: toInt(stat.Assists),
        saves: toInt(stat.Saves),
        shots: toInt(stat.Shots),
        bot: stat.bBot === true,
        playerId: "",
        pseudo: "",
      }];
    })
    : [];
  const hasStats = players.length > 0;
  if (!hasStats && !hasScore) throw new Error(INVALID_REPLAY_MESSAGE);

  const { date, dateTime } = parseReplayDate(header.Date);
  const seconds = Number(header.TotalSecondsPlayed);
  const frames = Number(header.NumFrames);
  const fps = Number(header.RecordFPS);
  let durationSeconds = 0;
  if (Number.isFinite(seconds) && seconds > 0) durationSeconds = Math.round(seconds);
  else if (frames > 0 && fps > 0) durationSeconds = Math.round(frames / fps);
  if (durationSeconds > MAX_DURATION_SECONDS) durationSeconds = 0;

  return {
    replayId: id,
    fileName: text(fileName),
    date,
    dateTime,
    map: prettifyMapName(header.MapName),
    mapRaw: text(header.MapName),
    matchType: text(header.MatchType),
    teamSize: toInt(header.TeamSize),
    durationSeconds,
    blueScore: toInt(header.Team0Score),
    orangeScore: toInt(header.Team1Score),
    hasStats,
    players,
  };
};

/** Point d'entrée : ArrayBuffer d'un fichier .replay → game normalisée. Lève une Error lisible si le fichier est invalide. */
export const parseRocketLeagueReplay = (buffer, fileName = "") => {
  let header;
  try {
    header = parseReplayHeader(buffer);
  } catch (cause) {
    const error = new Error(INVALID_REPLAY_MESSAGE);
    error.cause = cause;
    throw error;
  }
  return normalizeReplayHeader(header, fileName);
};

/** Trie les games par date/heure de début (Game 1 = la plus ancienne). */
export const sortReplayGames = (games = []) => [...games].sort(
  (a, b) => (a.dateTime || "").localeCompare(b.dateTime || "") || (a.fileName || "").localeCompare(b.fileName || "")
);

/** Joueur du site dont le pseudo correspond à un joueur du replay, côté `side`. */
export const autoLinkReplayPlayers = (games = [], members = [], side = "") => {
  const byName = new Map(members.filter((m) => norm(m.pseudo)).map((m) => [norm(m.pseudo), m]));
  return games.map((game) => ({
    ...game,
    players: game.players.map((player) => {
      if (player.playerId || player.side !== side) return player;
      const member = byName.get(norm(player.name));
      return member ? { ...player, playerId: member.id, pseudo: member.pseudo } : player;
    }),
  }));
};

/** Délie les joueurs qui ne sont pas (ou plus) de notre côté : ils ne sont plus listés pour la liaison. */
export const unlinkPlayersOutsideSide = (games = [], side = "") => games.map((game) => ({
  ...game,
  players: game.players.map((player) => (player.playerId && player.side !== side
    ? { ...player, playerId: "", pseudo: "" }
    : player)),
}));

/** Lie (ou délie si `member` est null) un joueur du replay à un joueur du site, dans toutes les games. */
export const linkReplayPlayer = (games = [], key, member = null) => games.map((game) => ({
  ...game,
  players: game.players.map((player) => (replayPlayerKey(player) === key
    ? { ...player, playerId: member ? member.id : "", pseudo: member ? member.pseudo : "" }
    : player)),
}));

/** Suggère la couleur de notre équipe si les pseudos du site se trouvent clairement d'un côté. */
export const suggestReplaySide = (games = [], members = []) => {
  const names = new Set(members.map((m) => norm(m.pseudo)).filter(Boolean));
  const count = { blue: 0, orange: 0 };
  games.forEach((game) => game.players.forEach((player) => {
    if (names.has(norm(player.name))) count[player.side] += 1;
  }));
  if (count.blue === count.orange) return "";
  return count.blue > count.orange ? "blue" : "orange";
};

/** Joueurs de notre équipe, dédoublonnés par identité, avec totaux sur la série. */
export const listReplayPlayers = (games = [], side = "") => {
  const entries = new Map();
  games.forEach((game) => game.players.forEach((player) => {
    if (player.side !== side) return;
    const key = replayPlayerKey(player);
    const entry = entries.get(key) || {
      key,
      name: player.name,
      platform: player.platform,
      onlineId: player.onlineId,
      playerId: "",
      pseudo: "",
      games: 0,
      score: 0,
      goals: 0,
      assists: 0,
      saves: 0,
      shots: 0,
    };
    entry.games += 1;
    entry.score += player.score;
    entry.goals += player.goals;
    entry.assists += player.assists;
    entry.saves += player.saves;
    entry.shots += player.shots;
    if (!entry.playerId && player.playerId) {
      entry.playerId = player.playerId;
      entry.pseudo = player.pseudo;
    }
    entries.set(key, entry);
  }));
  return [...entries.values()];
};

/**
 * Calcule le résultat de la série à partir des games et de la couleur de notre équipe.
 * Retourne `ready: false` tant que la couleur n'est pas choisie ou qu'il n'y a pas de game.
 */
export const buildReplaySeries = (games = [], side = "") => {
  if (!isReplaySide(side) || games.length === 0) {
    return { ready: false, side: "", scoreUs: 0, scoreThem: 0, games: [], maps: [], players: [], date: "", warnings: [] };
  }
  const theirs = otherReplaySide(side);
  const summaries = games.map((game, index) => {
    const ourGoals = game[`${side}Score`];
    const theirGoals = game[`${theirs}Score`];
    let result = "D";
    if (ourGoals > theirGoals) result = "W";
    else if (ourGoals < theirGoals) result = "L";
    return {
      index: index + 1,
      map: game.map,
      date: game.date,
      dateTime: game.dateTime,
      ourGoals,
      theirGoals,
      result,
      hasStats: game.hasStats,
    };
  });

  const players = new Map();
  games.forEach((game) => game.players
    .filter((player) => player.side === side && player.playerId)
    .forEach((player) => {
      const entry = players.get(player.playerId) || {
        playerId: player.playerId,
        pseudo: player.pseudo || player.name,
        goals: 0,
        assists: 0,
        points: 0,
      };
      entry.goals += player.goals;
      entry.assists += player.assists;
      entry.points += player.score;
      players.set(player.playerId, entry);
    }));

  const warnings = [];
  games.forEach((game, index) => {
    const label = `Game ${index + 1}`;
    if (!game.hasStats) {
      warnings.push(`${label} : pas de statistiques joueurs dans ce replay (score seul).`);
    } else {
      const scored = game.blueScore + game.orangeScore;
      const counted = game.players.reduce((sum, player) => sum + player.goals, 0);
      if (counted !== scored) {
        warnings.push(`${label} : les buts individuels (${counted}) ne correspondent pas au score (${scored}). Un but a peut-être été marqué contre son camp ou par un joueur parti.`);
      }
    }
    const misplaced = game.players.filter((player) => player.playerId && player.side !== side);
    if (misplaced.length) {
      const names = misplaced.map((player) => player.pseudo || player.name).join(", ");
      warnings.push(`${label} : ${names} joue(nt) dans l'équipe adverse. Vérifiez la couleur choisie.`);
    }
  });

  return {
    ready: true,
    side,
    scoreUs: summaries.filter((s) => s.result === "W").length,
    scoreThem: summaries.filter((s) => s.result === "L").length,
    games: summaries,
    maps: games.map((game) => ({
      name: game.map || "",
      scoreUs: game[`${side}Score`],
      scoreThem: game[`${theirs}Score`],
    })),
    players: [...players.values()],
    date: games[0].date || "",
    warnings,
  };
};

export const formatReplayDuration = (seconds) => {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
};
