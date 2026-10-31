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

const render = (match, props = {}) => act(() => {
  root.render(
    <LanguageProvider>
      <MemoryRouter>
        <MatchCard match={match} {...props} />
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

  test("affiche le badge Annulé lorsqu'un match est annulé", () => {
    render({
      id: "m_cancelled",
      date: "2026-10-31",
      time: "21:00",
      game: "Rocket League",
      roster: "Black",
      status: "cancelled",
      opponentName: "Karmine Corp",
    });
    expect($("match-status-cancelled").textContent).toContain("Annulé");
  });

  test("affiche le badge En direct lorsqu'un match à venir est en cours", () => {
    render(
      {
        id: "m_live_auto",
        date: "2026-10-31",
        time: "20:00",
        endTime: "21:00",
        timezone: "Europe/Paris",
        game: "Rocket League",
        roster: "Black",
        status: "upcoming",
        opponentName: "Vitality",
      },
      { nowMs: Date.parse("2026-10-31T19:15:00Z") } // 20:15 Paris
    );
    expect($("match-status-live").textContent).toContain("En direct");
  });
});
