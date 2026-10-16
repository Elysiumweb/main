import {
  PLAYER_STAT_KEYS,
  aggregatePlayer,
  aggregatePlayers,
  formatStatLine,
  matchResult,
  normalizeCareer,
  playerStatValue,
  radarValues,
} from "./playerStats";

const matches = [
  {
    id: "2", date: "2026-02-01", scoreUs: 3, scoreThem: 1, mvp: "p1",
    players: [{ playerId: "p1", pseudo: "Nova", goals: 2, assists: 1, saves: 3, shots: 5, score: 450 }],
  },
  {
    id: "1", date: "2026-01-01", scoreUs: 0, scoreThem: 2,
    players: [
      { playerId: "p1", pseudo: "Nova", goals: 0, assists: 1, saves: 1, shots: 2, score: 300 },
      { playerId: "p2", pseudo: "Echo" },
    ],
  },
];

test("les statistiques joueur officielles sont but, passe, arrêt, tir, score et MVP", () => {
  expect(PLAYER_STAT_KEYS).toEqual(["goals", "assists", "saves", "shots", "score", "mvp"]);
  expect(Object.keys(radarValues({ stats: { goalsPerMatch: 1, assistsPerMatch: 1, savesPerMatch: 2, shotsPerMatch: 3, scorePerMatch: 350, mvpRate: 50 } })))
    .toEqual(PLAYER_STAT_KEYS);
});

test("agrège les six statistiques et la forme récente d'un joueur", () => {
  expect(matchResult(matches[0])).toBe("W");
  const stats = aggregatePlayer(matches, { id: "p1", pseudo: "Nova" });
  expect(stats).toMatchObject({
    played: 2,
    wins: 1,
    losses: 1,
    winRate: 50,
    mvp: 1,
    goals: 2,
    assists: 2,
    saves: 4,
    shots: 7,
    score: 750,
    goalsPerMatch: 1,
    assistsPerMatch: 1,
    savesPerMatch: 2,
    shotsPerMatch: 3.5,
    scorePerMatch: 375,
    mvpRate: 50,
    shotAccuracy: 28.6,
  });
  expect(stats.recent[0]).toEqual({
    id: "2",
    date: "2026-02-01",
    opponentName: undefined,
    competition: "",
    result: "W",
    mvp: true,
    goals: 2,
    assists: 1,
    saves: 3,
    shots: 5,
    score: 450,
  });
});

test("reste compatible avec les documents qui stockaient des points", () => {
  expect(playerStatValue({ points: 250 }, "score")).toBe(250);
  const legacy = aggregatePlayer(
    [{ id: "1", scoreUs: 1, scoreThem: 0, players: [{ playerId: "p1", goals: 1, points: 250 }] }],
    { id: "p1" }
  );
  expect(legacy.score).toBe(250);
  expect(legacy.goals).toBe(1);
});

test("formate une ligne de statistiques condensée", () => {
  expect(formatStatLine({ goals: 2, assists: 1, saves: 3, shots: 5, score: 450 })).toBe("2 B · 1 PD · 3 Arr · 5 T · 450 Pts");
});

test("builds a leaderboard from roster identities", () => {
  const board = aggregatePlayers(matches, [{ id: "p1", pseudo: "Nova" }, { id: "p2", pseudo: "Echo" }, { id: "s", status: "staff" }]);
  expect(board.map((player) => player.pseudo)).toEqual(["Nova", "Echo"]);
  expect(board[0].stats.score).toBe(750);
});

test("classe le classement par MVP puis par score", () => {
  const board = aggregatePlayers(matches, [{ id: "p1", pseudo: "Nova" }, { id: "p2", pseudo: "Echo" }]);
  expect(board[0].pseudo).toBe("Nova");
});

test("migrates legacy career lines without losing data", () => {
  expect(normalizeCareer([], "Club A | 2024-2025 | IGL | Champion")).toEqual([
    { club: "Club A", period: "2024-2025", role: "IGL", achievements: "Champion" },
  ]);
});
