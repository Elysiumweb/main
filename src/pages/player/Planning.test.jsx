import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

/* ---------------------------------------------------------------------------
 * Régressions du planning joueur (sans Firebase réel) :
 *  - la page ne doit pas être remontée à chaque mise à jour Firestore
 *    (sinon le conteneur défilant repart tout en haut après un clic) ;
 *  - la grille couvre jusqu'à 00h ;
 *  - deux cases cochées à la suite ne s'écrasent pas ;
 *  - sur mobile : un bandeau de jours + une seule colonne, tap = bascule.
 * ------------------------------------------------------------------------- */

const listeners = {};
const writes = [];

jest.mock("firebase/firestore", () => ({
  collection: (_db, name) => ({ name }),
  doc: (_db, coll, id) => ({ path: `${coll}/${id}` }),
  onSnapshot: (ref, next) => {
    listeners[ref.name] = next;
    return () => {};
  },
  setDoc: (ref, data) => {
    writes.push({ path: ref.path, data });
    return Promise.resolve();
  },
  updateDoc: () => Promise.resolve(),
  addDoc: () => Promise.resolve({ id: "x" }),
  deleteDoc: () => Promise.resolve(),
  serverTimestamp: () => "ts",
  deleteField: () => "DELETE",
}));

jest.mock("../../lib/firebase", () => ({ db: {}, auth: {}, functions: {}, storage: {} }));
jest.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: { uid: "u1", email: "j@example.com" },
    game: "EVA",
    roster: null,
    isOfficial: false,
    canManage: false,
    displayName: "Joueur",
  }),
}));
jest.mock("../../lib/i18n", () => ({ useLang: () => ({ t: (k) => k, lang: "fr" }) }));
jest.mock("../../hooks/useRosters", () => ({
  useRosters: () => ({ rostersForGame: () => [], allNames: [], gameHasRosters: () => false }),
}));
jest.mock("../../lib/notify", () => ({
  createNotification: () => Promise.resolve(),
  logActivity: () => {},
  logAdminAction: () => Promise.resolve(),
}));
jest.mock("../../lib/calendar", () => ({ downloadICS: () => {}, gcalUrl: () => "#" }));
jest.mock("../../components/ui/alert-dialog", () => {
  const Null = () => null;
  return {
    AlertDialog: Null, AlertDialogAction: Null, AlertDialogCancel: Null, AlertDialogContent: Null,
    AlertDialogDescription: Null, AlertDialogFooter: Null, AlertDialogHeader: Null, AlertDialogTitle: Null,
  };
});
jest.mock("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));

const Planning = require("./Planning").default;

const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = keyOf(new Date());

const snapshotOf = (list) => ({ docs: list.map((d) => ({ id: d.id, data: () => ({ ...d }) })) });
const emit = (name, list = []) => {
  act(() => {
    listeners[name](snapshotOf(list));
  });
};

const pointer = (el, type, extra = {}) => {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...extra });
  Object.defineProperty(ev, "pointerType", { value: extra.pointerType || "mouse" });
  act(() => {
    el.dispatchEvent(ev);
  });
};

let container;
let root;

const mountPlanning = () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Planning />);
  });
  // Abonnements initiaux (events, availabilities, recurring, absences, profiles)
  ["events", "availabilities", "recurringAvailabilities", "absences", "profiles"].forEach((n) => emit(n, []));
};

const openAvailability = () => {
  act(() => {
    container.querySelector('[data-testid="tab-availability"]').click();
  });
};

const setMatchMedia = (matches) => {
  window.matchMedia = (query) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  });
};

beforeEach(() => {
  Object.keys(listeners).forEach((k) => delete listeners[k]);
  writes.length = 0;
  setMatchMedia(false); // desktop par défaut
});

afterEach(() => {
  act(() => root && root.unmount());
  container && container.remove();
  root = null;
  container = null;
});

describe("planning — disponibilités (desktop)", () => {
  it("affiche des cases de 06h à 23h (la plage va jusqu'à minuit)", () => {
    mountPlanning();
    openAvailability();
    expect(container.querySelector(`[data-testid="avail-cell-${todayKey}-23"]`)).not.toBeNull();
    expect(container.querySelector(`[data-testid="avail-cell-${todayKey}-6"]`)).not.toBeNull();
    expect(container.querySelector(`[data-testid="avail-cell-${todayKey}-24"]`)).toBeNull();
    const cellsToday = container.querySelectorAll(`[data-testid^="avail-cell-${todayKey}-"]`);
    expect(cellsToday.length).toBe(18);
  });

  it("ne remonte pas la grille quand Firestore met à jour les dispos", () => {
    mountPlanning();
    openAvailability();
    const before = container.querySelector(`[data-testid="avail-cell-${todayKey}-10"]`);
    expect(before).not.toBeNull();
    // Une mise à jour Firestore (ex. après un clic) ne doit pas recréer les nœuds
    emit("availabilities", [{ id: `u1_${todayKey}`, uid: "u1", date: todayKey, added: [10] }]);
    const after = container.querySelector(`[data-testid="avail-cell-${todayKey}-10"]`);
    expect(after).toBe(before);
    expect(after.isConnected).toBe(true);
  });

  it("garde le même conteneur calendrier après une mise à jour d'événements", () => {
    mountPlanning();
    const weekGrid = container.querySelector('[data-testid="planning-page"] main > div');
    expect(weekGrid).not.toBeNull();
    emit("events", [{ id: "e1", title: "Scrim", start: new Date().toISOString(), end: new Date(Date.now() + 3600e3).toISOString(), color: "#4285F4", game: "EVA" }]);
    expect(container.querySelector('[data-testid="planning-page"] main > div')).toBe(weekGrid);
  });

  it("enregistre une case cochée avec la bonne forme de document", () => {
    mountPlanning();
    openAvailability();
    pointer(container.querySelector(`[data-testid="avail-cell-${todayKey}-9"]`), "pointerdown");
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe(`availabilities/u1_${todayKey}`);
    expect(writes[0].data.added).toEqual([9]);
    expect(writes[0].data.removed).toEqual([]);
  });

  it("ne perd pas une case quand deux sont cochées avant la réponse de Firestore", () => {
    mountPlanning();
    openAvailability();
    pointer(container.querySelector(`[data-testid="avail-cell-${todayKey}-9"]`), "pointerdown");
    pointer(container.querySelector(`[data-testid="avail-cell-${todayKey}-10"]`), "pointerdown");
    expect(writes).toHaveLength(2);
    expect(writes[1].data.added).toEqual([9, 10]);
  });

  it("une case cochée puis décochée revient à vide", () => {
    mountPlanning();
    openAvailability();
    const cell = container.querySelector(`[data-testid="avail-cell-${todayKey}-14"]`);
    pointer(cell, "pointerdown");
    pointer(cell, "pointerdown");
    expect(writes[1].data.added).toEqual([]);
  });

  it("souris : pas de double bascule avec le clic émulé", () => {
    mountPlanning();
    openAvailability();
    const cell = container.querySelector(`[data-testid="avail-cell-${todayKey}-11"]`);
    pointer(cell, "pointerdown", { pointerType: "mouse" });
    act(() => { cell.click(); });
    expect(writes).toHaveLength(1);
  });
});

describe("planning — disponibilités (tactile / mobile)", () => {
  it("un tap bascule la case (pas de bascule au début d'un défilement)", () => {
    mountPlanning();
    openAvailability();
    const cell = container.querySelector(`[data-testid="avail-cell-${todayKey}-12"]`);
    pointer(cell, "pointerdown", { pointerType: "touch" });
    expect(writes).toHaveLength(0); // le pointerdown seul ne coche rien
    act(() => { cell.click(); });
    expect(writes).toHaveLength(1);
    expect(writes[0].data.added).toEqual([12]);
  });

  it("affiche un seul jour à la fois avec un bandeau de sélection", () => {
    setMatchMedia(true);
    mountPlanning();
    openAvailability();
    expect(container.querySelector('[data-testid="avail-day-strip"]')).not.toBeNull();
    // une seule colonne de cases : celle du jour sélectionné
    expect(container.querySelectorAll('[data-testid^="avail-cell-"][data-testid$="-6"]')).toHaveLength(1);
    expect(container.querySelector(`[data-testid="avail-cell-${todayKey}-6"]`)).not.toBeNull();
  });

  it("calendrier mobile : bandeau de jours + vue journée", () => {
    setMatchMedia(true);
    mountPlanning();
    expect(container.querySelector('[data-testid="mobile-week"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="mobile-week-strip"]')).not.toBeNull();
  });
});
