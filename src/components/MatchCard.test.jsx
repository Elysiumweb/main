import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

/* ---------------------------------------------------------------------------
 * La modale d'un match doit afficher, pour chaque joueur du line-up, les six
 * statistiques officielles (but, passe, arrêt, tir, score, MVP) — y compris
 * pour les anciens matchs qui stockaient `points` au lieu de `score`.
 * ------------------------------------------------------------------------- */

const { MatchCard } = require("./MatchCard");
const { LanguageProvider } = require("../lib/i18n");

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
});

const render = (match) => act(() => {
  root.render(
    <LanguageProvider>
      <MemoryRouter>
        <MatchCard match={match} />
      </MemoryRouter>
    </LanguageProvider>
  );
});

// Radix monte la modale dans un portail attaché à document.body.
const $ = (id) => document.body.querySelector(`[data-testid="${id}"]`);

const openDialog = () => act(() => {
  $("match-card-m1").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
});

const match = {
  id: "m1",
  date: "2026-10-09",
  game: "Rocket League",
  status: "finished",
  scoreUs: 3,
  scoreThem: 1,
  opponentName: "Rivals",
  mvp: "Nova",
  players: [
    { playerId: "p1", pseudo: "Nova", goals: 2, assists: 1, saves: 3, shots: 5, score: 450, mvp: 1 },
    { playerId: "p2", pseudo: "Echo", goals: 1, assists: 0, points: 320 },
  ],
};

describe("MatchCard — statistiques joueur de la modale", () => {
  test("affiche la ligne but / passe / arrêt / tir / score de chaque joueur", () => {
    render(match);
    openDialog();
    const list = $("match-players-m1").textContent;
    expect(list).toContain("Nova");
    expect(list).toContain("2 B · 1 PD · 3 Arr · 5 T · 450 Pts");
    expect(list).toContain("MVP");
  });

  test("reste compatible avec l'ancien champ points", () => {
    render(match);
    openDialog();
    const list = $("match-players-m1").textContent;
    // Echo n'a que des points : le score est lu depuis `points`, les autres stats à 0.
    expect(list).toContain("Echo");
    expect(list).toContain("1 B · 0 PD · 0 Arr · 0 T · 320 Pts");
  });

  test("affiche le MVP du match", () => {
    render(match);
    openDialog();
    expect($("match-mvp-m1").textContent).toContain("Nova");
  });
});
