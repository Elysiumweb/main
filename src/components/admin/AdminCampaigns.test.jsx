import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

// react-scripts configure resetMocks:true → les implémentations définies dans
// la fabrique jest.mock sont retirées avant chaque test. On les ré-attache
// dans beforeEach (même pattern que les autres tests du repo).
jest.mock("firebase/firestore", () => {
  const listeners = [];
  const docs = new Map();
  return {
    collection: jest.fn(),
    doc: jest.fn(),
    addDoc: jest.fn(),
    updateDoc: jest.fn(),
    deleteDoc: jest.fn(),
    onSnapshot: jest.fn(),
    serverTimestamp: jest.fn(),
    _docs: docs,
    _listeners: listeners,
  };
});

jest.mock("../../lib/firebase", () => ({ db: { type: "db" } }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("../../lib/i18n", () => ({ useLang: () => ({ t: (k) => k, lang: "fr" }) }));

const firestore = require("firebase/firestore");
const { AdminCampaigns } = require("./AdminCampaigns");

let container;
let root;
let errorSpy;

beforeEach(() => {
  firestore._docs.clear();
  firestore._listeners.length = 0;
  firestore.collection.mockImplementation(() => ({ type: "collection" }));
  firestore.doc.mockImplementation((_db, _col, id) => ({ id }));
  firestore.addDoc.mockImplementation(async () => {
    const id = `new_${Date.now()}`;
    firestore._docs.set(id, {});
    return { id };
  });
  firestore.updateDoc.mockImplementation(async (ref, data) => {
    const id = ref.id;
    if (!firestore._docs.has(id)) throw new Error(`Doc ${id} introuvable`);
    firestore._docs.set(id, { ...firestore._docs.get(id), ...data });
  });
  firestore.deleteDoc.mockImplementation(async (ref) => { firestore._docs.delete(ref.id); });
  firestore.onSnapshot.mockImplementation((_coll, cb) => {
    const emit = () => cb({
      docs: [...firestore._docs.entries()].map(([id, data]) => ({ id, data: () => data })),
    });
    firestore._listeners.push(emit);
    emit();
    return jest.fn();
  });
  firestore.serverTimestamp.mockImplementation(() => ({ toDate: () => new Date() }));

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

const seed = () => {
  firestore._docs.set("camp_1", {
    title: "Objectif LAN 2026",
    goalAmount: 3000,
    currentAmount: 1200,
    active: true,
  });
};

const render = async () => {
  await act(async () => { root.render(<AdminCampaigns />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};

const setInput = (testId, value) => {
  const input = container.querySelector(`[data-testid="${testId}"]`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("AdminCampaigns — édition sans duplication", () => {
  it("passe en mode édition et remplit le formulaire quand on clique sur Modifier", async () => {
    seed();
    await render();
    const editBtn = container.querySelector('[data-testid="admin-campaign-edit-camp_1"]');
    expect(editBtn).toBeTruthy();
    act(() => { editBtn.click(); });
    expect(container.querySelector('[data-testid="admin-campaign-edit-badge"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="admin-campaign-title"]').value).toBe("Objectif LAN 2026");
    // Le libellé du bouton passe en « enregistrer les modifications » (le mock
    // i18n renvoie la clé : admin.campaigns.saveEdit).
    expect(container.querySelector('[data-testid="admin-campaign-submit"]').textContent).toMatch(/admin.campaigns.saveEdit/);
  });

  it("modifie la campagne existante sans en créer une nouvelle", async () => {
    seed();
    await render();
    act(() => { container.querySelector('[data-testid="admin-campaign-edit-camp_1"]').click(); });
    setInput("admin-campaign-current", "1500");
    await act(async () => {
      container.querySelector('[data-testid="admin-campaign-submit"]').click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(firestore.updateDoc).toHaveBeenCalledTimes(1);
    expect(firestore.updateDoc.mock.calls[0][0].id).toBe("camp_1");
    expect(firestore.addDoc).not.toHaveBeenCalled();
    // Le nombre de campagnes reste identique après une modification
    expect(firestore._docs.size).toBe(1);
    expect(firestore._docs.get("camp_1").currentAmount).toBe(1500);
  });
});
