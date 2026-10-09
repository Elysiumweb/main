// La page importe le SDK Firebase au chargement : on le neutralise, la grille
// tarifaire est une donnée pure qui n'a besoin d'aucun client.
jest.mock("../lib/firebase", () => ({ db: {} }));

import { grille, rows } from "./Partners";

/**
 * Garde-fou sur la grille tarifaire ElyWalk.
 * ----------------------------------------------------------------------------
 * Ces valeurs sont un engagement commercial affiché publiquement : elles ont été
 * arbitrées avec l'association (les trois points en dérogation pour le palier
 * GOLD). Le test verrouille les valeurs validées, pour qu'un refactor ne
 * remette pas silencieusement l'ancien texte de la convention.
 */

const cell = (key) => grille[key];

describe("grille ElyWalk — offres simultanément actives", () => {
  it("laisse Bronze et Argent sur des limites chiffrées", () => {
    expect(cell("bronze").offresActives).toBe("1");
    expect(cell("argent").offresActives).toBe("5");
  });

  it("donne le Gold sans limite", () => {
    expect(cell("gold").offresActives).toBe("Illimité");
  });
});

describe("grille ElyWalk — logo sur les maillots", () => {
  it("l'exclut des paliers Bronze et Argent", () => {
    expect(cell("bronze").maillots).toBe(false);
    expect(cell("argent").maillots).toBe(false);
  });

  it("l'inclut dans le Gold, sans mention restrictive", () => {
    expect(cell("gold").maillots).toBe(true);
    expect(cell("gold").maillotsDetail).toBe("");
  });
});

describe("grille ElyWalk — invitations ou places en évènement", () => {
  it("ne l'inclut pas dans Bronze et Argent", () => {
    expect(cell("bronze").invitations).toBe(false);
    expect(cell("argent").invitations).toBe(false);
  });

  it("l'inclut dans le Gold, mais en version limitée", () => {
    expect(cell("gold").invitations).toBe(true);
    expect(cell("gold").invitationsDetail).toBe("limité");
  });
});

describe("grille ElyWalk — cohérence des lignes du tableau", () => {
  it("décrit les trois lignes arbitrées avec le bon type de cellule", () => {
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.offresActives.type).toBe("text");
    expect(byKey.maillots.type).toBe("boolDetailCustom");
    expect(byKey.invitations.type).toBe("boolDetail");
  });

  it("conserve les trois paliers avec leurs tarifs de référence", () => {
    expect(cell("bronze").tarifRef).toBe("196 € HT");
    expect(cell("argent").tarifRef).toBe("356 € HT");
    expect(cell("gold").tarifRef).toBe("676 € HT");
  });
});