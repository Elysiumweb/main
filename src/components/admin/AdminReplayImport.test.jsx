import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { AdminReplayImport } from "./AdminReplayImport";

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

const player = (name, side, goals, extra = {}) => ({
  name, platform: "Steam", onlineId: `id-${name}`, side, score: goals * 100, goals,
  assists: 0, saves: 0, shots: 0, bot: false, playerId: "", pseudo: "", ...extra,
});

// Game 1 : bleu gagne 3-1 ; Game 2 : bleu perd 0-2
const games = [
  {
    replayId: "A".repeat(32), fileName: "g1.replay", date: "2026-10-09", dateTime: "2026-10-09 21:00:00",
    map: "Mannfield", mapRaw: "Mannfield_P", matchType: "Online", teamSize: 3, durationSeconds: 300,
    blueScore: 3, orangeScore: 1, hasStats: true,
    players: [player("Alpha", "blue", 2), player("Charlie", "orange", 1)],
  },
  {
    replayId: "B".repeat(32), fileName: "g2.replay", date: "2026-10-09", dateTime: "2026-10-09 21:10:00",
    map: "Stadium", mapRaw: "Stadium_P", matchType: "Online", teamSize: 3, durationSeconds: 280,
    blueScore: 0, orangeScore: 2, hasStats: true,
    players: [player("Alpha", "blue", 0), player("Charlie", "orange", 2)],
  },
];
const members = [{ id: "m-alpha", pseudo: "Alpha" }, { id: "m-bravo", pseudo: "Bravo" }];

describe("AdminReplayImport", () => {
  let container;
  let root;

  const render = (props) => {
    act(() => {
      root.render(<AdminReplayImport games={[]} side="" members={members} onChange={() => {}} {...props} />);
    });
  };
  const $ = (id) => container.querySelector(`[data-testid="${id}"]`);

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("sans replay : message vide et aucun calcul", () => {
    render({});
    expect($("admin-replay-empty")).not.toBeNull();
    expect($("admin-replay-series")).toBeNull();
  });

  test("replays importés sans couleur : demande de choisir la couleur", () => {
    render({ games });
    expect($("admin-replay-side-required")).not.toBeNull();
    expect($("admin-replay-series")).toBeNull();
  });

  test("le clic sur une couleur remonte le choix et relie les joueurs reconnus", () => {
    const onChange = jest.fn();
    render({ games, onChange });
    act(() => { $("admin-replay-side-blue").click(); });
    expect(onChange).toHaveBeenCalledTimes(1);
    const [nextGames, nextSide] = onChange.mock.calls[0];
    expect(nextSide).toBe("blue");
    // Alpha (bleu) est relié à son joueur du site par pseudo, Charlie (orange) non
    expect(nextGames[0].players[0]).toMatchObject({ playerId: "m-alpha", pseudo: "Alpha" });
    expect(nextGames[0].players[1]).toMatchObject({ playerId: "" });
  });

  test("changer de couleur délie les joueurs qui ne sont plus de notre côté", () => {
    const onChange = jest.fn();
    // Alpha (bleu) et Charlie (orange) sont liés ; on passe notre équipe en orange
    const linked = games.map((g) => ({
      ...g,
      players: g.players.map((p) => (p.name === "Alpha" ? { ...p, playerId: "m-alpha", pseudo: "Alpha" }
        : p.name === "Charlie" ? { ...p, playerId: "m-bravo", pseudo: "Bravo" } : p)),
    }));
    render({ games: linked, side: "blue", members, onChange });
    act(() => { $("admin-replay-side-orange").click(); });
    const [nextGames, nextSide] = onChange.mock.calls[0];
    expect(nextSide).toBe("orange");
    expect(nextGames[0].players.find((p) => p.name === "Alpha")).toMatchObject({ playerId: "", pseudo: "" });
    expect(nextGames[0].players.find((p) => p.name === "Charlie")).toMatchObject({ playerId: "m-bravo", pseudo: "Bravo" });
  });

  test("avec la couleur choisie : affiche le score de la série", () => {
    render({ games, side: "blue", members });
    expect($("admin-replay-series")).not.toBeNull();
    expect($("admin-replay-score-us").textContent).toBe("1");
    expect($("admin-replay-score-them").textContent).toBe("1");
    expect($("admin-replay-game-chip-1").textContent).toContain("3–1");
    expect($("admin-replay-game-chip-2").textContent).toContain("0–2");
  });

  test("la liste des joueurs liables ne contient que notre équipe", () => {
    render({ games, side: "blue", members });
    expect($("admin-replay-player-0").textContent).toContain("Alpha");
    expect($("admin-replay-player-1")).toBeNull();
  });
});
