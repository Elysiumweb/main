jest.mock("./firebase", () => ({ db: {} }));

import {
  BUILTIN_REDIRECTS,
  buildRedirectMap,
  isValidRedirect,
  normalizePath,
  resolveRedirect,
} from "./redirects";

describe("redirects — normalisation", () => {
  test("normalise slash initial, slash final, query et domaines", () => {
    expect(normalizePath("dons")).toBe("/dons");
    expect(normalizePath("/dons/")).toBe("/dons");
    expect(normalizePath("/dons?utm=x#top")).toBe("/dons");
    expect(normalizePath("https://elysium-esport.fr/a-propos/")).toBe("/a-propos");
    expect(normalizePath("")).toBe("/");
    expect(normalizePath("//double//slash//")).toBe("/double/slash");
  });
});

describe("redirects — validation", () => {
  test("refuse les URL externes, chemins relatifs et boucles", () => {
    expect(isValidRedirect({ from: "/a", to: "/b" })).toBe(true);
    expect(isValidRedirect({ from: "a", to: "/b" })).toBe(false);
    expect(isValidRedirect({ from: "/a", to: "https://example.com" })).toBe(false);
    expect(isValidRedirect({ from: "/a", to: "/a" })).toBe(false);
    expect(isValidRedirect({ from: "/a", to: "/a/" })).toBe(false);
  });
});

describe("redirects — résolution", () => {
  test("la redirection historique /dons reste un repli", () => {
    const map = buildRedirectMap([]);
    expect(resolveRedirect(map, "/dons")).toBe("/soutenir");
  });

  test("une ligne Firestore active remplace le repli", () => {
    const map = buildRedirectMap([{ from: "/dons", to: "/faire-un-don", enabled: true }]);
    expect(resolveRedirect(map, "/dons")).toBe("/faire-un-don");
  });

  test("le repli intégré ne peut pas être désactivé (liens historiques)", () => {
    const map = buildRedirectMap([{ from: "/dons", to: "/soutenir", enabled: false }]);
    expect(resolveRedirect(map, "/dons")).toBe("/soutenir");
  });

  test("une ligne désactivée retire une redirection personnalisée", () => {
    const map = buildRedirectMap([{ from: "/ancien", to: "/nouveau", enabled: false }]);
    expect(resolveRedirect(map, "/ancien")).toBeNull();
  });

  test("les lignes invalides sont ignorées sans casser la table", () => {
    const map = buildRedirectMap([
      { from: "/ok", to: "/cible" },
      { from: "/ko", to: "https://example.com" },
      { from: "/boucle", to: "/boucle" },
      null,
    ]);
    expect(resolveRedirect(map, "/ok")).toBe("/cible");
    expect(resolveRedirect(map, "/ko")).toBeNull();
    expect(resolveRedirect(map, "/boucle")).toBeNull();
    expect(BUILTIN_REDIRECTS).toHaveLength(1);
  });

  test("les slashs finaux sont résolus", () => {
    const map = buildRedirectMap([{ from: "/ancien/", to: "/nouveau" }]);
    expect(resolveRedirect(map, "/ancien")).toBe("/nouveau");
  });
});
