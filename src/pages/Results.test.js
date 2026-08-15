// Results.jsx importe la chaîne firebase (lib/firebase) qui exige des
// variables d'environnement : on la mock pour tester la logique pure.
jest.mock("../lib/firebase", () => ({
  app: {}, auth: {}, db: {}, storage: {}, functions: {},
}));

import { resolveFocusedMatch } from "./Results";

describe("resolveFocusedMatch — lien partagé /resultats?match=ID", () => {
  const matches = [
    { id: "m1", status: "finished", opponentName: "Alpha" },
    { id: "m2", status: "upcoming", opponentName: "Beta" },
  ];

  it("retourne le match correspondant à l'ID partagé", () => {
    expect(resolveFocusedMatch(matches, "m2")).toEqual({ id: "m2", status: "upcoming", opponentName: "Beta" });
  });

  it("retourne null quand l'ID est absent", () => {
    expect(resolveFocusedMatch(matches, null)).toBeNull();
    expect(resolveFocusedMatch(matches, "")).toBeNull();
  });

  it("retourne null quand le match est introuvable (état « match introuvable »)", () => {
    expect(resolveFocusedMatch(matches, "inconnu")).toBeNull();
    expect(resolveFocusedMatch(null, "m1")).toBeNull();
    expect(resolveFocusedMatch([], "m1")).toBeNull();
  });
});
