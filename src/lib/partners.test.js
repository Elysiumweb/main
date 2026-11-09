import {
  isPartnerLinkValue,
  isPartnerVisible,
  partnerBannerSrc,
  partnerFichePath,
  partnerLogoSrc,
  partnerSlug,
  partnerTier,
  slugifyPartner,
  sortPartners,
  visiblePartners,
} from "./partners";

/**
 * Garde-fou sur les helpers de la collection `partners`.
 * ----------------------------------------------------------------------------
 * L'admin écrit les logos/bannières et les fiches publiques lisent les mêmes
 * documents. Ces tests verrouillent la tolérance aux anciens documents
 * (`logo` / `banner` sans suffixe, pas de palier) et le filtrage des
 * partenaires masqués depuis l'administration.
 */

describe("slugifyPartner", () => {
  it("retire accents et caractères spéciaux", () => {
    expect(slugifyPartner("Élysium & Co.")).toBe("elysium-co");
    expect(slugifyPartner("  --Team  Rocket--  ")).toBe("team-rocket");
  });

  it("renvoie une chaîne vide quand il n'y a rien d'exploitable", () => {
    expect(slugifyPartner("!!!")).toBe("");
    expect(slugifyPartner(null)).toBe("");
  });
});

describe("partnerSlug / partnerFichePath", () => {
  it("privilégie le slug saisi", () => {
    expect(partnerSlug({ slug: "elywalk", name: "Ely Walk" })).toBe("elywalk");
    expect(partnerFichePath({ slug: "elywalk" })).toBe("/partenaires/elywalk");
  });

  it("retombe sur le nom puis sur l'id du document", () => {
    expect(partnerSlug({ name: "Ely Walk" })).toBe("ely-walk");
    expect(partnerSlug({ id: "abc123" })).toBe("abc123");
  });
});

describe("palier et visibilité", () => {
  it("normalise les paliers inconnus en bronze", () => {
    expect(partnerTier({ tier: "gold" })).toBe("gold");
    expect(partnerTier({ tier: "platinum" })).toBe("bronze");
    expect(partnerTier({})).toBe("bronze");
  });

  it("considère un partenaire publié par défaut", () => {
    expect(isPartnerVisible({})).toBe(true);
    expect(isPartnerVisible({ active: false })).toBe(false);
    // `published` est écrit en miroir par l'admin pour les documents récents.
    expect(isPartnerVisible({ published: false })).toBe(false);
  });
});

describe("logo et bannière", () => {
  it("accepte les deux conventions de nommage", () => {
    expect(partnerLogoSrc({ logoUrl: "data:image/png;base64,AAA" })).toBe("data:image/png;base64,AAA");
    expect(partnerLogoSrc({ logo: "https://cdn.test/logo.png" })).toBe("https://cdn.test/logo.png");
    expect(partnerBannerSrc({ bannerUrl: "data:image/jpeg;base64,BBB" })).toBe("data:image/jpeg;base64,BBB");
    expect(partnerBannerSrc({ banner: "https://cdn.test/banner.jpg" })).toBe("https://cdn.test/banner.jpg");
  });

  it("renvoie une chaîne vide si l'image est absente", () => {
    expect(partnerLogoSrc({})).toBe("");
    expect(partnerBannerSrc(null)).toBe("");
  });
});

describe("tri et filtrage public", () => {
  const list = [
    { id: "1", name: "Zeta", order: 2 },
    { id: "2", name: "Alpha", order: 2 },
    { id: "3", name: "Beta", order: 1 },
    { id: "4", name: "Hidden", order: 0, active: false },
    { id: "5", name: "Draft", order: 0, published: false },
    { id: "6", name: "Untouched" },
  ];

  it("trie par ordre puis par nom", () => {
    const ids = sortPartners(list).map((p) => p.id);
    expect(ids).toEqual(["5", "4", "3", "2", "1", "6"]);
    expect(sortPartners(list).slice(3, 5).map((p) => p.name)).toEqual(["Alpha", "Zeta"]);
  });

  it("masque les partenaires désactivés sur le site public", () => {
    const ids = visiblePartners(list).map((p) => p.id);
    expect(ids).toEqual(["3", "2", "1", "6"]);
  });

  it("ne modifie pas la liste d'origine", () => {
    const copy = [...list];
    visiblePartners(list);
    expect(list).toEqual(copy);
  });
});

describe("isPartnerLinkValue", () => {
  it("accepte les URL absolues et les chemins internes", () => {
    expect(isPartnerLinkValue("https://elywalk.fr")).toBe(true);
    expect(isPartnerLinkValue("/boutique")).toBe(true);
    expect(isPartnerLinkValue("")).toBe(true);
  });

  it("rejette les protocoles dangereux et les chemins relatifs ambigus", () => {
    expect(isPartnerLinkValue("javascript:alert(1)")).toBe(false);
    expect(isPartnerLinkValue("//evil.test")).toBe(false);
    expect(isPartnerLinkValue("elywalk.fr")).toBe(false);
  });
});
