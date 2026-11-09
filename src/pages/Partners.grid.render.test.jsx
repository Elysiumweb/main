import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

/* ---------------------------------------------------------------------------
 * La grille publique des logos doit envoyer le visiteur sur la fiche du
 * partenaire (/partenaires/:slug), pas vers un site externe, et ne doit
 * afficher que les partenaires publiés depuis l'administration.
 * ------------------------------------------------------------------------- */

const snapshot = { docs: [] };

jest.mock("../lib/firebase", () => ({ db: {} }));
jest.mock("firebase/firestore", () => ({
  collection: jest.fn(() => ({})),
  onSnapshot: (ref, next) => {
    next({ docs: snapshot.docs });
    return () => {};
  },
}));
jest.mock("../lib/analytics", () => ({
  ANALYTICS_EVENTS: { PARTNER_CLICK: "partner_click" },
  trackEvent: jest.fn(),
}));
jest.mock("../lib/secureForms", () => ({
  callProtected: jest.fn(),
  protectedErrorMessage: () => "error",
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("../components/DonateButton", () => ({ DonateBlock: () => null }));

const { default: Partners } = require("./Partners");
const { LanguageProvider } = require("../lib/i18n");

let container;
let root;

const doc = (id, data) => ({ id, data: () => data });

beforeEach(() => {
  snapshot.docs = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  console.error.mockRestore();
});

const render = () =>
  act(() =>
    root.render(
      <LanguageProvider>
        <MemoryRouter initialEntries={["/partenaires"]}>
          <Partners />
        </MemoryRouter>
      </LanguageProvider>
    )
  );

describe("Partners — grille des logos", () => {
  it("chaque logo renvoie vers la fiche du partenaire", () => {
    snapshot.docs = [
      doc("p1", { name: "ElyWalk", slug: "elywalk", tier: "gold", logoUrl: "https://cdn.test/elywalk.png", active: true }),
      doc("p2", { name: "Acme Corp", tier: "bronze", active: true }),
    ];
    render();

    const card1 = container.querySelector('[data-testid="partner-link-p1"]');
    const card2 = container.querySelector('[data-testid="partner-link-p2"]');
    expect(card1).not.toBeNull();
    expect(card1.getAttribute("href")).toBe("/partenaires/elywalk");
    // Sans slug explicite, l'URL est dérivée du nom.
    expect(card2.getAttribute("href")).toBe("/partenaires/acme-corp");
  });

  it("masque les partenaires désactivés et affiche l'état vide", () => {
    snapshot.docs = [doc("p3", { name: "Discret", slug: "discret", tier: "gold", active: false })];
    render();

    expect(container.querySelector('[data-testid="partner-link-p3"]')).toBeNull();
    expect(container.querySelector('[data-testid="partners-empty"]')).not.toBeNull();
  });

  it("accepte les anciens documents qui n'utilisent que `logo`", () => {
    snapshot.docs = [doc("p4", { name: "Legacy", slug: "legacy", logo: "https://cdn.test/legacy.png" })];
    render();

    const card = container.querySelector('[data-testid="partner-link-p4"]');
    expect(card.getAttribute("href")).toBe("/partenaires/legacy");
    expect(card.querySelector('img[src="https://cdn.test/legacy.png"]')).not.toBeNull();
  });
});
