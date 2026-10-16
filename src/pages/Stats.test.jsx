import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

/* ---------------------------------------------------------------------------
 * Nouvelle grille de statistiques joueur : but, passe décisive, arrêt, tir,
 * score et MVP. On verrouille ici l'agrégation affichée (classement, comparateur,
 * leaders) et l'absence de l'ancienne colonne « Points ».
 * ------------------------------------------------------------------------- */

const listeners = {};
jest.mock("firebase/firestore", () => ({
  collection: (_db, name) => ({ name }),
  onSnapshot: (ref, next) => {
    listeners[ref.name] = next;
    return () => {};
  },
}));
jest.mock("../lib/firebase", () => ({ db: {}, auth: {}, functions: {}, storage: {} }));

const Stats = require("./Stats").default;
const { LanguageProvider } = require("../lib/i18n");

// Nova : 2 buts/1 passe/3 arrêts/5 tirs/450 pts (MVP) puis 1 but/0 passe/1 arrêt/4 tirs/300 pts
const matches = [
  {
    id: "m1", date: "2026-02-01", game: "Rocket League", status: "finished", scoreUs: 3, scoreThem: 1, mvp: "p1",
    players: [
      { playerId: "p1", pseudo: "Nova", goals: 2, assists: 1, saves: 3, shots: 5, score: 450, mvp: 1 },
      { playerId: "p2", pseudo: "Echo", goals: 1, assists: 2, saves: 0, shots: 3, score: 320 },
    ],
  },
  {
    id: "m2", date: "2026-01-01", game: "Rocket League", status: "finished", scoreUs: 1, scoreThem: 2,
    players: [
      { playerId: "p1", pseudo: "Nova", goals: 1, assists: 0, saves: 1, shots: 4, score: 300 },
      { playerId: "p2", pseudo: "Echo", goals: 0, assists: 1, saves: 2, shots: 1, score: 200 },
    ],
  },
];
const roster = [
  { id: "p1", pseudo: "Nova", game: "Rocket League", status: "player" },
  { id: "p2", pseudo: "Echo", game: "Rocket League", status: "player" },
];

let container;
let root;
let errorSpy;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  errorSpy.mockRestore();
  Object.keys(listeners).forEach((key) => delete listeners[key]);
});

const doc = (data) => ({ id: data.id, data: () => data });

const render = () => {
  act(() => {
    root.render(
      <LanguageProvider>
        <MemoryRouter>
          <Stats />
        </MemoryRouter>
      </LanguageProvider>
    );
  });
  act(() => {
    listeners.matches({ docs: matches.map(doc) });
    listeners.roster({ docs: roster.map(doc) });
  });
};

const q = (id) => container.querySelector(`[data-testid="${id}"]`);

describe("page Statistiques — stats joueur officielles", () => {
  test("affiche les six statistiques agrégées pour chaque joueur", () => {
    render();
    expect(q("stats-leaderboard")).not.toBeNull();
    // Nova : 3 buts, 1 passe, 4 arrêts, 9 tirs, 750 pts, 1 MVP
    expect(q("stats-player-goals-p1").textContent).toBe("3");
    expect(q("stats-player-assists-p1").textContent).toBe("1");
    expect(q("stats-player-saves-p1").textContent).toBe("4");
    expect(q("stats-player-shots-p1").textContent).toBe("9");
    expect(q("stats-player-score-p1").textContent).toBe("750");
    expect(q("stats-player-mvp-p1").textContent).toBe("1×");
  });

  test("n'affiche plus l'ancienne colonne Points", () => {
    render();
    const head = q("stats-leaderboard").querySelector("thead").textContent;
    ["Buts", "Passes décisives", "Arrêts", "Tirs", "Score", "MVP"].forEach((label) => {
      expect(head).toContain(label);
    });
    expect(head).not.toContain("Points");
  });

  test("compare deux joueurs sur les six statistiques", () => {
    render();
    expect(q("compare-goals-p1").textContent).toBe("3");
    expect(q("compare-saves-p1").textContent).toBe("4");
    expect(q("compare-score-p1").textContent).toBe("750");
    expect(q("compare-mvp-p1").textContent).toBe("1");
    expect(q("compare-goals-p2").textContent).toBe("1");
  });

  test("met en avant les leaders de chaque statistique", () => {
    render();
    expect(q("stats-leaders")).not.toBeNull();
    ["goals", "assists", "saves", "shots", "score", "mvp"].forEach((key) => {
      expect(q(`stats-leader-${key}`)).not.toBeNull();
    });
    expect(q("stats-leader-goals").textContent).toContain("Nova");
    expect(q("stats-leader-mvp").textContent).toContain("Nova");
  });
});
