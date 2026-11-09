import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/* ---------------------------------------------------------------------------
 * Fiche partenaire /partenaires/:slug
 *
 * Le contenu vient de Firestore : on simule un instantané de la collection
 * `partners` pour vérifier ce qui est réellement rendu au visiteur — logo,
 * bannière, description Markdown, bouton de lien et masquage des partenaires
 * désactivés depuis l'admin.
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

const { default: PartnerDetail } = require("./PartnerDetail");
const { LanguageProvider } = require("../lib/i18n");

let container;
let root;

const doc = (id, data) => ({ id, data: () => data });

const render = (slug = "elywalk") =>
  act(() =>
    root.render(
      <LanguageProvider>
        <MemoryRouter initialEntries={[`/partenaires/${slug}`]}>
          <Routes>
            <Route path="/partenaires/:slug" element={<PartnerDetail />} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    )
  );

beforeEach(() => {
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

const q = (id) => container.querySelector(`[data-testid="${id}"]`);

describe("PartnerDetail", () => {
  it("affiche le logo, la bannière, la description Markdown et le bouton", () => {
    snapshot.docs = [
      doc("p1", {
        name: "ElyWalk",
        slug: "elywalk",
        tier: "gold",
        logoUrl: "https://cdn.test/elywalk.png",
        bannerUrl: "https://cdn.test/elywalk-banner.jpg",
        description: "## Nos offres\n\n- Balade guidée\n- **Réduction** membre",
        ctaLabel: "Découvrir ElyWalk",
        ctaUrl: "https://elywalk.fr/elysium",
        website: "https://elywalk.fr",
        active: true,
      }),
    ];
    render();

    expect(q("partner-detail-title").textContent).toBe("ElyWalk");
    // Bannière en fond de hero et logo dans la carte.
    expect(container.querySelector('img[src="https://cdn.test/elywalk-banner.jpg"]')).not.toBeNull();
    expect(container.querySelector('img[src="https://cdn.test/elywalk.png"]')).not.toBeNull();
    // Markdown rendu (titre + liste + gras), pas le texte brut.
    expect(q("partner-detail-content").textContent).toContain("Nos offres");
    expect(q("partner-detail-content").querySelector("h2").textContent).toBe("Nos offres");
    expect(q("partner-detail-content").querySelector("strong").textContent).toBe("Réduction");
    // Bouton sous la description, avec le libellé et le lien saisis.
    const cta = q("partner-detail-cta").querySelector("a");
    expect(cta.getAttribute("href")).toBe("https://elywalk.fr/elysium");
    expect(cta.textContent).toContain("Découvrir ElyWalk");
  });

  it("retombe sur le site officiel quand aucun bouton n'est configuré", () => {
    snapshot.docs = [
      doc("p2", {
        name: "Acme",
        slug: "acme",
        website: "https://acme.test",
        active: true,
      }),
    ];
    render("acme");

    const cta = q("partner-detail-cta").querySelector("a");
    expect(cta.getAttribute("href")).toBe("https://acme.test");
  });

  it("refuse une fiche masquée depuis l'admin, même via son URL", () => {
    snapshot.docs = [
      doc("p3", { name: "Discret", slug: "discret", active: false, description: "Ne doit pas apparaître" }),
    ];
    render("discret");

    expect(q("partner-detail-not-found")).not.toBeNull();
    expect(container.textContent).not.toContain("Ne doit pas apparaître");
  });

  it("affiche l'état introuvable pour un slug inconnu", () => {
    snapshot.docs = [];
    render("inconnu");
    expect(q("partner-detail-not-found")).not.toBeNull();
  });
});
