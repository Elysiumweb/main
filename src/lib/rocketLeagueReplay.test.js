import {
  buildReplaySeries,
  autoLinkReplayPlayers,
  linkReplayPlayer,
  listReplayPlayers,
  normalizeReplayHeader,
  parseReplayDate,
  parseReplayHeader,
  parseRocketLeagueReplay,
  prettifyMapName,
  replayPlayerKey,
  sortReplayGames,
  suggestReplaySide,
} from "./rocketLeagueReplay";

// ---- Écrivain de replay minimal (en-tête UE3 tel que lu par le parseur) ----
class Writer {
  constructor() {
    this.parts = [];
  }
  u8(v) {
    this.parts.push(Uint8Array.of(v & 0xff));
    return this;
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
  utf16(s) {
    const units = [...s].map((c) => c.charCodeAt(0));
    this.i32(-(units.length + 1));
    const b = new Uint8Array((units.length + 1) * 2);
    const view = new DataView(b.buffer);
    units.forEach((u, i) => view.setUint16(i * 2, u, true));
    this.parts.push(b);
    return this;
  }
  raw(bytes) {
    this.parts.push(Uint8Array.from(bytes));
    return this;
  }
  bytes() {
    const total = this.parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    this.parts.forEach((p) => {
      out.set(p, off);
      off += p.length;
    });
    return out;
  }
}

const intProp = (w, name, value) => { w.str(name).str("IntProperty").u64(4).i32(value); };
const strProp = (w, name, value) => { w.str(name).str("StrProperty").u64(value.length + 5).str(value); };
const nameProp = (w, name, value) => { w.str(name).str("NameProperty").u64(value.length + 5).str(value); };
const floatProp = (w, name, value) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, value, true);
  w.str(name).str("FloatProperty").u64(4).raw(b);
};
const boolProp = (w, name, value, width = 1) => {
  w.str(name).str("BoolProperty").u64(0).raw(width === 1 ? [value ? 1 : 0] : [value ? 1 : 0, 0, 0, 0]);
};
const qwordProp = (w, name, value) => { w.str(name).str("QWordProperty").u64(8).u64(value); };
const platformProp = (w, name, value, { withEnum = false } = {}) => {
  const valueStr = `OnlinePlatform_${value}`;
  w.str(name).str("ByteProperty").u64(valueStr.length + 5);
  if (withEnum) w.str("OnlinePlatform");
  w.str(valueStr);
};
const structProp = (w, name, structName, bytes) => {
  w.str(name).str("StructProperty").u64(bytes.length).str(structName).raw(bytes);
};

const playerStat = (p, { boolWidth = 1, platformEnum = false } = {}) => (w) => {
  strProp(w, "Name", p.name);
  structProp(w, "PlayerID", "UniqueNetId", new Uint8Array(12));
  platformProp(w, "Platform", "Steam", { withEnum: platformEnum });
  qwordProp(w, "OnlineID", p.onlineId);
  intProp(w, "Team", p.team);
  intProp(w, "Score", p.score);
  intProp(w, "Goals", p.goals);
  intProp(w, "Assists", p.assists);
  intProp(w, "Saves", p.saves);
  intProp(w, "Shots", p.shots);
  boolProp(w, "bBot", p.bot || false, boolWidth);
  w.str("None");
};

const buildReplay = ({
  id = "0123456789ABCDEF0123456789ABCDEF",
  date = "2026-10-09 21-15-30",
  map = "Mannfield_P",
  blue = 2,
  orange = 1,
  players = [],
  options = {},
} = {}) => {
  const w = new Writer();
  w.u32(5000).u32(0).u32(868).u32(18).u32(0).str("TAGame.Replay_Soccar_TA");
  intProp(w, "TeamSize", 3);
  strProp(w, "Id", id);
  strProp(w, "Date", date);
  nameProp(w, "MapName", map);
  nameProp(w, "MatchType", "Online");
  floatProp(w, "RecordFPS", 30);
  intProp(w, "NumFrames", 9000);
  if (blue) intProp(w, "Team0Score", blue);
  if (orange) intProp(w, "Team1Score", orange);
  w.str("PlayerStats").str("ArrayProperty").u64(0).u32(players.length);
  players.forEach((p) => playerStat(p, options)(w));
  // ArrayProperty est lu structurellement : le tableau ci-dessus se termine avec ses propres "None".
  w.str("None");
  return w.bytes();
};

const toBuffer = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

const SAMPLE_PLAYERS = [
  { name: "Alpha", onlineId: "76561198000000001", team: 0, score: 450, goals: 2, assists: 1, saves: 2, shots: 5 },
  { name: "Bravo", onlineId: "76561198000000002", team: 0, score: 300, goals: 0, assists: 2, saves: 1, shots: 1, bot: true },
  { name: "Charlie", onlineId: "76561198000000003", team: 1, score: 250, goals: 1, assists: 0, saves: 3, shots: 2 },
  { name: "Delta", onlineId: "76561198000000004", team: 1, score: 100, goals: 0, assists: 0, saves: 0, shots: 0 },
  { name: "Spectateur", onlineId: "0", team: -1, score: 0, goals: 0, assists: 0, saves: 0, shots: 0 },
];

describe("parseReplayDate", () => {
  test("gère les deux formats de date des replays", () => {
    expect(parseReplayDate("2017-08-09 20-58-07")).toEqual({ date: "2017-08-09", dateTime: "2017-08-09 20:58:07" });
    expect(parseReplayDate("2015-10-27:18-29")).toEqual({ date: "2015-10-27", dateTime: "2015-10-27 18:29:00" });
    expect(parseReplayDate("n'importe quoi")).toEqual({ date: "", dateTime: "" });
  });
});

describe("prettifyMapName", () => {
  test("retire le suffixe _P et met en forme le nom", () => {
    expect(prettifyMapName("Underwater_P")).toBe("Underwater");
    expect(prettifyMapName("UtopiaStadium_Lux_P")).toBe("Utopia Stadium Lux");
    expect(prettifyMapName("stadium_foggy_p")).toBe("Stadium Foggy");
    expect(prettifyMapName(undefined)).toBe("");
  });
});

describe("parseRocketLeagueReplay", () => {
  test("extrait scores, carte, date et stats joueurs d'un replay", () => {
    const game = parseRocketLeagueReplay(toBuffer(buildReplay({ players: SAMPLE_PLAYERS })), "match.replay");
    expect(game.replayId).toBe("0123456789ABCDEF0123456789ABCDEF");
    expect(game.fileName).toBe("match.replay");
    expect(game.date).toBe("2026-10-09");
    expect(game.dateTime).toBe("2026-10-09 21:15:30");
    expect(game.map).toBe("Mannfield");
    expect(game.blueScore).toBe(2);
    expect(game.orangeScore).toBe(1);
    expect(game.durationSeconds).toBe(300);
    expect(game.hasStats).toBe(true);
    // Le spectateur (team -1) n'est pas compté dans les équipes
    expect(game.players).toHaveLength(4);
    expect(game.players[0]).toMatchObject({ name: "Alpha", platform: "Steam", side: "blue", score: 450, goals: 2, assists: 1, saves: 2, shots: 5, bot: false, playerId: "" });
    expect(game.players[1]).toMatchObject({ name: "Bravo", side: "blue", bot: true });
    expect(game.players[2]).toMatchObject({ name: "Charlie", side: "orange", goals: 1 });
  });

  test("lit les booléens sur 4 octets et les plateformes avec nom d'enum", () => {
    const bytes = buildReplay({ players: SAMPLE_PLAYERS.slice(0, 1), options: { boolWidth: 4, platformEnum: true } });
    const game = parseRocketLeagueReplay(toBuffer(bytes), "x.replay");
    expect(game.players).toHaveLength(1);
    expect(game.players[0]).toMatchObject({ name: "Alpha", platform: "Steam", bot: false, goals: 2 });
  });

  test("lit les chaînes UTF-16 (pseudos non latins)", () => {
    const withName = new Writer();
    withName.u32(5000).u32(0).u32(868).u32(18).u32(0).str("TAGame.Replay_Soccar_TA");
    strProp(withName, "Id", "0123456789ABCDEF0123456789ABCDEF");
    withName.str("Name").str("StrProperty").u64(40).utf16("★ OC Tommynator ★");
    withName.str("None");
    expect(parseReplayHeader(toBuffer(withName.bytes())).Name).toBe("★ OC Tommynator ★");
  });

  test("refuse un fichier qui n'est pas un replay Rocket League", () => {
    expect(() => parseRocketLeagueReplay(new Uint8Array(64).fill(7).buffer, "bruit.replay")).toThrow("Fichier .replay non reconnu");
    expect(() => parseRocketLeagueReplay(new ArrayBuffer(0), "vide.replay")).toThrow("Fichier .replay non reconnu");
  });

  test("refuse un replay sans identifiant ni score", () => {
    const w = new Writer();
    w.u32(5000).u32(0).u32(868).u32(18).u32(0).str("TAGame.Replay_Soccar_TA");
    intProp(w, "TeamSize", 3);
    w.str("None");
    expect(() => parseRocketLeagueReplay(toBuffer(w.bytes()))).toThrow("Fichier .replay non reconnu");
  });

  test("accepte un replay sans PlayerStats mais avec score (signalé comme score seul)", () => {
    const w = new Writer();
    w.u32(5000).u32(0).u32(868).u32(18).u32(0).str("TAGame.Replay_Soccar_TA");
    strProp(w, "Id", "0123456789ABCDEF0123456789ABCDEF");
    strProp(w, "Date", "2026-10-09 21-15-30");
    intProp(w, "Team0Score", 4);
    w.str("None");
    const game = parseRocketLeagueReplay(toBuffer(w.bytes()), "score.replay");
    expect(game.hasStats).toBe(false);
    expect(game.blueScore).toBe(4);
    expect(game.orangeScore).toBe(0);
    expect(game.players).toEqual([]);
  });
});

describe("normalizeReplayHeader", () => {
  test("ignore une durée aberrante", () => {
    const game = normalizeReplayHeader({ Id: "0123456789ABCDEF0123456789ABCDEF", Team0Score: 1, NumFrames: 738197735, RecordFPS: 30 });
    expect(game.durationSeconds).toBe(0);
  });
});

describe("série de replays", () => {
  const replay = (overrides) => parseRocketLeagueReplay(toBuffer(buildReplay(overrides)), "r.replay");
  const ALPHA_ID = "76561198000000001";
  const members = [
    { id: "m-alpha", pseudo: "alpha" },
    { id: "m-charlie", pseudo: "Charlie" },
  ];

  // Game 1 : bleu gagne 3-1 ; Game 2 : orange gagne 0-2 ; Game 3 : bleu gagne 4-3
  const buildSeries = () => {
    const g1 = replay({ id: "A".repeat(32), date: "2026-10-09 21-00-00", blue: 3, orange: 1, players: SAMPLE_PLAYERS });
    const g2 = replay({ id: "B".repeat(32), date: "2026-10-09 21-10-00", blue: 0, orange: 2, map: "Stadium_P", players: [
      { ...SAMPLE_PLAYERS[0], goals: 0, score: 200 },
      SAMPLE_PLAYERS[1],
      { ...SAMPLE_PLAYERS[2], goals: 2, score: 380 },
      SAMPLE_PLAYERS[3],
    ] });
    const g3 = replay({ id: "C".repeat(32), date: "2026-10-09 21-20-00", blue: 4, orange: 3, players: SAMPLE_PLAYERS });
    return sortReplayGames([g3, g1, g2]);
  };

  test("trie les games par date", () => {
    const games = buildSeries();
    expect(games.map((g) => g.fileName)).toEqual(["r.replay", "r.replay", "r.replay"]);
    expect(games.map((g) => g.dateTime)).toEqual(["2026-10-09 21:00:00", "2026-10-09 21:10:00", "2026-10-09 21:20:00"]);
  });

  test("ne calcule rien tant que la couleur de notre équipe n'est pas choisie", () => {
    const series = buildReplaySeries(buildSeries(), "");
    expect(series.ready).toBe(false);
  });

  test("compte les games gagnées et calcule les scores par manche", () => {
    const series = buildReplaySeries(buildSeries(), "blue");
    expect(series.ready).toBe(true);
    expect(series.scoreUs).toBe(2);
    expect(series.scoreThem).toBe(1);
    expect(series.games.map((g) => [g.ourGoals, g.theirGoals, g.result])).toEqual([[3, 1, "W"], [0, 2, "L"], [4, 3, "W"]]);
    expect(series.maps.map((m) => [m.name, m.scoreUs, m.scoreThem])).toEqual([["Mannfield", 3, 1], ["Stadium", 0, 2], ["Mannfield", 4, 3]]);
    expect(series.date).toBe("2026-10-09");
  });

  test("inverse le point de vue quand notre équipe est orange", () => {
    const series = buildReplaySeries(buildSeries(), "orange");
    expect(series.scoreUs).toBe(1);
    expect(series.scoreThem).toBe(2);
    // Orange : g1 perdue 1-3, g2 gagnée 2-0, g3 perdue 3-4
    expect(series.games.map((g) => g.result)).toEqual(["L", "W", "L"]);
  });

  test("agrège les stats des joueurs liés à notre équipe uniquement", () => {
    let games = autoLinkReplayPlayers(buildSeries(), members, "blue");
    games = linkReplayPlayer(games, replayPlayerKey({ onlineId: ALPHA_ID, name: "Alpha" }), members[0]);
    const series = buildReplaySeries(games, "blue");
    const alpha = series.players.find((p) => p.playerId === "m-alpha");
    // Alpha : g1 2 buts/1 passe/450 pts ; g2 0 but/1 passe/200 pts ; g3 2 buts/1 passe/450 pts
    expect(alpha).toEqual({ playerId: "m-alpha", pseudo: "alpha", goals: 4, assists: 3, points: 450 + 200 + 450 });
    // Charlie est dans l'équipe orange : pas de stats côté Elysium
    expect(series.players.find((p) => p.playerId === "m-charlie")).toBeUndefined();
  });

  test("suggère la couleur uniquement si les pseudos sont clairement d'un côté", () => {
    const games = buildSeries();
    expect(suggestReplaySide(games, [{ id: "m-alpha", pseudo: "alpha" }])).toBe("blue");
    // Alpha (bleu) et Charlie (orange) : égalité, aucune suggestion
    expect(suggestReplaySide(games, members)).toBe("");
  });

  test("liaison automatique par pseudo", () => {
    const games = buildSeries();
    const linked = autoLinkReplayPlayers(games, members, "blue");
    const list = listReplayPlayers(linked, "blue");
    expect(list.map((p) => [p.name, p.pseudo, p.games])).toEqual([
      ["Alpha", "alpha", 3],
      ["Bravo", "", 3],
    ]);
  });

  test("délie un joueur sans toucher aux autres", () => {
    let games = autoLinkReplayPlayers(buildSeries(), members, "blue");
    games = linkReplayPlayer(games, replayPlayerKey({ onlineId: ALPHA_ID, name: "Alpha" }), null);
    const list = listReplayPlayers(games, "blue");
    expect(list.find((p) => p.name === "Alpha").playerId).toBe("");
  });

  test("signale les incohérences utiles", () => {
    const games = buildSeries();
    const misplaced = autoLinkReplayPlayers(games, members, "blue");
    const linked = linkReplayPlayer(misplaced, replayPlayerKey({ onlineId: "76561198000000003", name: "Charlie" }), members[1]);
    const series = buildReplaySeries(linked, "blue");
    expect(series.warnings.some((w) => w.includes("Charlie") && w.includes("équipe adverse"))).toBe(true);
    const noStats = [...games, parseRocketLeagueReplay(toBuffer(buildReplay({ id: "D".repeat(32), blue: 1, orange: 0, players: [] })), "n.replay")];
    expect(buildReplaySeries(noStats, "blue").warnings.some((w) => w.includes("score seul"))).toBe(true);
  });
});
