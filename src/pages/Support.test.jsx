import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

/* ---------------------------------------------------------------------------
 * Rendu DOM des pages Support et Recrutement pour un visiteur anonyme, sans
 * Firebase. On vérifie ce qui doit rester atteignable même sans compte ni
 * données publiées — le cœur de la demande « support sans compte ».
 *
 * Note : CRA active `resetMocks`, les implémentations de jest.fn() sont donc
 * vidées avant chaque test — on utilise des fonctions simples, et les
 * valeurs de retour sont fixées explicitement quand il faut les observer.
 * ------------------------------------------------------------------------- */

// onSnapshot échoue : le site doit retomber sur la FAQ de secours, pas casser.
jest.mock("firebase/firestore", () => ({
  collection: () => ({ __ref: true }),
  doc: () => ({ __ref: true }),
  query: () => ({ __ref: true }),
  where: () => ({ __ref: true }),
  getDocs: () => Promise.resolve({ docs: [] }),
  addDoc: () => Promise.resolve({ id: "x" }),
  updateDoc: () => Promise.resolve(),
  deleteDoc: () => Promise.resolve(),
  serverTimestamp: () => "ts",
  onSnapshot: (_ref, _next, onError) => {
    if (typeof onError === "function") onError(new Error("offline"));
    return () => {};
  },
}));

jest.mock("../lib/firebase", () => ({ db: {}, functions: {}, auth: {}, storage: {} }));
jest.mock("../lib/notify", () => ({
  CONTACT_EMAIL: "contact@elysium-esport.fr",
  createNotification: () => Promise.resolve(),
  logActivity: () => {},
  logAdminAction: () => Promise.resolve(),
}));
jest.mock("../lib/secureForms", () => ({
  callProtected: () => Promise.resolve({ ok: true, reference: "EVA-123456", trackToken: "tok", emailSent: true }),
  protectedErrorMessage: (_err, fallback) => fallback,
  getCaptchaToken: () => Promise.resolve(null),
}));

let mockAuthValue = { user: null, canSeeSupport: false, canSeeRecruit: false };
jest.mock("../context/AuthContext", () => ({ useAuth: () => mockAuthValue }));

const Support = require("./Support").default;
const Recruitment = require("./Recruitment").default;
const { LanguageProvider } = require("../lib/i18n");

let container;
let root;
let errorSpy;

beforeEach(() => {
  mockAuthValue = { user: null, canSeeSupport: false, canSeeRecruit: false };
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

const render = (ui) =>
  act(() =>
    root.render(
      <LanguageProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </LanguageProvider>
    )
  );

const q = (id) => container.querySelector(`[data-testid="${id}"]`);

/* Saisie d'un champ contrôlé React : on passe par le setter natif pour que
   React 19 voie bien la mutation (l'attribution directe de .value est ignorée). */
const type = (el, value) => {
  const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

const submitForm = async (form) => {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
};

describe("page Support — visiteur sans compte", () => {
  beforeEach(() => render(<Support />));

  it("garde l'invitation à se connecter ET ouvre un ticket invité", () => {
    expect(q("support-login-prompt")).not.toBeNull();
    expect(q("support-guest-block")).not.toBeNull();
    expect(q("support-guest-form")).not.toBeNull();
    expect(q("support-guest-email")).not.toBeNull();
  });

  it("met le Discord en avant avec le lien d'invitation officiel", () => {
    expect(q("support-discord-cta")).not.toBeNull();
    expect(q("support-discord-btn").getAttribute("href")).toBe("https://discord.gg/RH3ZZkMJsw");
  });

  it("affiche la FAQ de secours quand la base de connaissances est vide", () => {
    expect(q("support-faq")).not.toBeNull();
    expect(container.textContent).toContain("Comment créer un compte ?");
    // Le repli est annoncé, sans le déguiser en contenu publié.
    expect(container.textContent).toMatch(/FAQ de secours/);
  });

  it("propose un filtre par jeu", () => {
    expect(q("support-help-game-all")).not.toBeNull();
    expect(q("support-help-game-Rocket-League")).not.toBeNull();
    expect(q("support-help-search")).not.toBeNull();
  });

  it("envoie le ticket invité et renvoie un lien de suivi", async () => {
    const form = q("support-guest-form");
    type(q("support-guest-email"), "bloque@exemple.fr");
    type(q("support-guest-subject"), "Impossible de me connecter");
    type(q("support-guest-desc"), "Mon mot de passe ne fonctionne plus depuis hier.");
    await submitForm(form);

    const confirm = q("support-guest-confirm");
    expect(confirm).not.toBeNull();
    expect(confirm.textContent).toContain("EVA-123456");
    // Le lien de suivi est utilisable sans compte.
    expect(q("support-guest-track-url").textContent).toContain("/suivi-demande?token=tok");
    expect(q("support-guest-track-link").getAttribute("href")).toBe("/suivi-demande?token=tok");
    expect(q("support-guest-form")).toBeNull();
  });
});

describe("page Recrutement — parcours visible sans compte", () => {
  beforeEach(() => render(<Recruitment />));

  it("publie la frise d'étapes avec les délais moyens", () => {
    expect(q("recruit-process")).not.toBeNull();
    ["received", "test", "interview", "decision"].forEach((id) => {
      expect(q(`recruit-step-${id}`)).not.toBeNull();
    });
    expect(container.textContent).toMatch(/en moyenne/);
  });

  it("affiche la section tryouts même sans créneau planifié", () => {
    expect(q("recruit-tryout-section")).not.toBeNull();
    expect(q("recruit-tryout-empty")).not.toBeNull();
  });

  it("conserve l'invitation à se connecter pour candidater", () => {
    expect(q("recruit-login-prompt")).not.toBeNull();
    expect(q("recruit-form")).toBeNull();
  });
});

describe("page Recrutement — candidature spontanée (candidat connecté)", () => {
  beforeEach(() => {
    mockAuthValue = { user: { uid: "u1" }, canSeeSupport: false, canSeeRecruit: false };
    render(<Recruitment />);
  });

  it("propose le choix poste ouvert / candidature spontanée", () => {
    expect(q("recruit-form")).not.toBeNull();
    expect(q("recruit-mode-open")).not.toBeNull();
    expect(q("recruit-mode-spontaneous")).not.toBeNull();
  });

  it("rend le poste facultatif et ajoute le choix du jeu en mode spontané", () => {
    act(() => {
      q("recruit-mode-spontaneous").click();
    });
    expect(q("recruit-spontaneous-note")).not.toBeNull();
    expect(q("recruit-game-input")).not.toBeNull();
    expect(q("recruit-position-input").required).toBe(false);
  });

  it("garde le poste obligatoire pour une candidature à un poste publié", () => {
    expect(q("recruit-position-input").required).toBe(true);
    expect(q("recruit-game-input")).toBeNull();
  });
});