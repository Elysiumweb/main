import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

/* ---------------------------------------------------------------------------
 * La boutique doit vendre deux articles : le maillot officiel (inchangé) et
 * les manchettes Elysium 2026. On verrouille ici les deux prix, le lien
 * d'achat et le fait que les deux articles restent affichés séparément.
 * ------------------------------------------------------------------------- */

jest.mock("../lib/firebase", () => ({ db: {}, functions: {}, auth: {}, storage: {} }));

const mockTrack = jest.fn();
jest.mock("../lib/analytics", () => ({
  ANALYTICS_EVENTS: { MERCH_CLICK: "merch_click" },
  trackEvent: (...args) => mockTrack(...args),
}));

const Shop = require("./Shop").default;
const { LanguageProvider } = require("../lib/i18n");

let container;
let root;
let errorSpy;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  mockTrack.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  errorSpy.mockRestore();
});

const render = () =>
  act(() =>
    root.render(
      <LanguageProvider>
        <MemoryRouter>
          <Shop />
        </MemoryRouter>
      </LanguageProvider>
    )
  );

const q = (id) => container.querySelector(`[data-testid="${id}"]`);

describe("page Boutique — deux articles", () => {
  beforeEach(() => render());

  it("garde le maillot officiel avec son lien et ses tailles", () => {
    expect(q("shop-title").textContent).toBe("Boutique officielle");
    expect(q("shop-jersey-2026")).not.toBeNull();
    expect(q("shop-buy-jersey").getAttribute("href")).toBe("https://eliminate.fr/elysium");
    expect(container.textContent).toContain("XS");
    expect(container.textContent).toContain("6XL");
    expect(container.textContent).toContain("49,90");
  });

  it("ajoute les manchettes avec le bon lien d'achat", () => {
    expect(q("shop-manchettes-2026")).not.toBeNull();
    const buy = q("shop-buy-manchettes");
    expect(buy).not.toBeNull();
    expect(buy.getAttribute("href")).toBe("https://eliminate.fr/produit/elysium-manchette-2026/");
    expect(buy.getAttribute("target")).toBe("_blank");
    expect(buy.getAttribute("rel")).toContain("noopener");
  });

  it("affiche les deux prix demandés : 19,90 € l'unité et 29,90 € la paire", () => {
    expect(q("shop-price-single").textContent).toContain("19,90");
    expect(q("shop-price-pair").textContent).toContain("29,90");
    expect(container.textContent).toContain("L'unité");
    expect(container.textContent).toContain("La paire");
  });

  it("trace chaque achat avec son propre identifiant produit", () => {
    act(() => {
      q("shop-buy-manchettes").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      q("shop-buy-jersey").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const products = mockTrack.mock.calls.map((c) => c[1].product);
    expect(products).toContain("manchettes_2026");
    expect(products).toContain("jersey_2026");
  });
});