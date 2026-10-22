jest.mock("./firebase", () => ({ db: {} }));

import {
  CONTENT_DEFAULTS,
  DEFAULT_ABOUT,
  DEFAULT_LEGAL,
  isSafeContent,
  mergeContent,
} from "./siteContent";

describe("siteContent — fusion avec les valeurs par défaut", () => {
  test("retombe sur les valeurs par défaut sans document", () => {
    expect(mergeContent("about", null)).toBe(DEFAULT_ABOUT);
    expect(mergeContent("legal", undefined)).toBe(DEFAULT_LEGAL);
    expect(CONTENT_DEFAULTS.about.values).toHaveLength(3);
    expect(CONTENT_DEFAULTS.legal.mentions.markdown).toContain("Éditeur du site");
  });

  test("un document Firestore surcharge les champs fournis", () => {
    const merged = mergeContent("about", { intro: "Nouveau texte", values: [{ key: "1", title: "Unique" }] });
    expect(merged.intro).toBe("Nouveau texte");
    expect(merged.values).toHaveLength(1);
    expect(merged.history).toBe(DEFAULT_ABOUT.history);
  });

  test("ignore les champs vides ou nuls", () => {
    const merged = mergeContent("homeGames", { pillars: "", eva: null });
    expect(merged.pillars).toBe(CONTENT_DEFAULTS.homeGames.pillars);
    expect(merged.eva).toBe(CONTENT_DEFAULTS.homeGames.eva);
  });

  test("une section inconnue n'explose pas", () => {
    expect(mergeContent("inconnue", { a: 1 })).toEqual({ a: 1 });
    expect(mergeContent("inconnue", null)).toEqual({});
  });
});

describe("siteContent — garde-fous", () => {
  test("accepte un contenu raisonnable", () => {
    expect(isSafeContent(DEFAULT_ABOUT)).toBe(true);
  });

  test("refuse les contenus trop profonds ou trop volumineux", () => {
    let deep = { value: "ok" };
    for (let i = 0; i < 8; i += 1) deep = { nested: deep };
    expect(isSafeContent(deep)).toBe(false);
    expect(isSafeContent({ text: "x".repeat(50000) })).toBe(false);
    expect(isSafeContent({ list: new Array(300).fill("x") })).toBe(false);
  });
});
