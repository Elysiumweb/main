import { aggregatePlayer, aggregatePlayers, matchResult, normalizeCareer } from "./playerStats";

const matches = [
  { id: "2", date: "2026-02-01", scoreUs: 3, scoreThem: 1, mvp: "p1", players: [{ playerId: "p1", pseudo: "Nova", goals: 2, points: 450 }] },
  { id: "1", date: "2026-01-01", scoreUs: 0, scoreThem: 2, players: [{ playerId: "p1", pseudo: "Nova", assists: 1 }, { playerId: "p2", pseudo: "Echo" }] },
];

test("computes a player's match statistics and recent form", () => {
  expect(matchResult(matches[0])).toBe("W");
  expect(aggregatePlayer(matches, { id: "p1", pseudo: "Nova" })).toMatchObject({
    played: 2, wins: 1, losses: 1, winRate: 50, mvp: 1, goals: 2, points: 450, assists: 1,
  });
});

test("builds a leaderboard from roster identities", () => {
  const board = aggregatePlayers(matches, [{ id: "p1", pseudo: "Nova" }, { id: "p2", pseudo: "Echo" }, { id: "s", status: "staff" }]);
  expect(board.map((player) => player.pseudo)).toEqual(["Nova", "Echo"]);
});

test("migrates legacy career lines without losing data", () => {
  expect(normalizeCareer([], "Club A | 2024-2025 | IGL | Champion")).toEqual([
    { club: "Club A", period: "2024-2025", role: "IGL", achievements: "Champion" },
  ]);
});
