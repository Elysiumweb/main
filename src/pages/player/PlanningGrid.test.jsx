import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

/* ---------------------------------------------------------------------------
 * Grille horaire du planning (vues semaine / jour) :
 *  - la hauteur d'une heure est bien plus grande qu'avant (60 px) pour que les
 *    créneaux de 15 min soient lisibles ;
 *  - deux événements simultanés ne se superposent plus (colonnes) ;
 *  - le sélecteur de taille de grille change la hauteur et mémorise le choix.
 * ------------------------------------------------------------------------- */

const listeners = {};

jest.mock("firebase/firestore", () => ({
  collection: (_db, name) => ({ name }),
  doc: (_db, coll, id) => ({ path: `${coll}/${id}` }),
  onSnapshot: (ref, next) => {
    listeners[ref.name] = next;
    return () => {};
  },
  setDoc: () => Promise.resolve(),
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
    game: "Rocket League",
    roster: "Elysium RL",
    isOfficial: false,
    canManage: true,
    displayName: "Manager",
  }),
}));
jest.mock("../../lib/i18n", () => ({ useLang: () => ({ t: (k) => k, lang: "fr" }) }));
jest.mock("../../hooks/useRosters", () => ({
  useRosters: () => ({
    rostersForGame: () => ["Elysium RL"],
    allNames: ["Elysium RL"],
    gameHasRosters: () => true,
  }),
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

const eventAt = (id, title, start, end, extra = {}) => ({
  id,
  title,
  start: start.toISOString(),
  end: end.toISOString(),
  color: "#F4511E",
  game: "Rocket League",
  roster: "Elysium RL",
  ...extra,
});

const today = (hours, minutes = 0) => {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
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
  ["events", "availabilities", "recurringAvailabilities", "absences", "profiles", "users"].forEach((n) => emit(n, []));
};

const setView = (view) => {
  act(() => {
    container.querySelector(`[data-testid="view-${view}"]`).click();
  });
};

const heightOf = (el) => parseFloat(el.style.height);

beforeEach(() => {
  Object.keys(listeners).forEach((k) => delete listeners[k]);
  localStorage.clear();
  window.matchMedia = (query) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  });
});

afterEach(() => {
  act(() => root && root.unmount());
  container && container.remove();
  root = null;
  container = null;
});

describe("planning — grille horaire lisible", () => {
  it("affiche des heures bien plus hautes que les 60 px d'avant", () => {
    mountPlanning();
    setView("week");
    const cell = container.querySelector(`[data-testid="week-cell-${todayKey}-21"]`);
    expect(cell).not.toBeNull();
    expect(heightOf(cell)).toBeGreaterThanOrEqual(120);
    // Par défaut « grand » : 180 px par heure, soit 45 px pour 15 minutes.
    expect(heightOf(cell)).toBe(180);
  });

  it("laisse un créneau de 15 minutes occuper une hauteur lisible", () => {
    mountPlanning();
    emit("events", [eventAt("court", "Warm-up", today(21, 0), today(21, 15))]);
    setView("week");
    const block = container.querySelector('[data-testid="event-block-court"]');
    expect(block).not.toBeNull();
    // 15 min = 45 px : titre + horaire, sans être écrasé
    expect(heightOf(block)).toBe(45);
  });

  it("place côte à côte deux événements simultanés au lieu de les superposer", () => {
    mountPlanning();
    emit("events", [
      eventAt("a", "Scrim A", today(20, 0), today(20, 15)),
      eventAt("b", "Scrim B", today(20, 0), today(20, 15)),
    ]);
    setView("week");

    const a = container.querySelector('[data-testid="event-block-a"]');
    const b = container.querySelector('[data-testid="event-block-b"]');
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // Même hauteur, positions horizontales différentes, chacun sur 50 %.
    expect(a.style.top).toBe(b.style.top);
    expect(a.style.left).not.toBe(b.style.left);
    expect(a.style.width).toContain("50%");
    expect(b.style.width).toContain("50%");
  });

  it("aligne un événement seul sur toute la largeur de la colonne", () => {
    mountPlanning();
    emit("events", [eventAt("seul", "Review", today(18, 0), today(19, 0))]);
    setView("week");
    const block = container.querySelector('[data-testid="event-block-seul"]');
    expect(block.style.width).toContain("100%");
    expect(block.style.left).toContain("0%");
  });

  it("permet de créer un créneau de 15 minutes en cliquant dans la grille", () => {
    mountPlanning();
    setView("week");
    const cell = container.querySelector(`[data-testid="week-cell-${todayKey}-21"]`);
    // Clic à ~1/3 de la cellule : 15 minutes après le début de l'heure
    cell.getBoundingClientRect = () => ({ top: 0, left: 0, width: 100, height: 180, right: 100, bottom: 180, x: 0, y: 0 });
    act(() => {
      cell.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientY: 50 }));
    });
    const startInput = container.querySelector('input[type="datetime-local"]');
    const endInput = container.querySelectorAll('input[type="datetime-local"]')[1];
    expect(startInput.value).toContain("T21:15");
    // Durée par défaut d'un créneau au quart d'heure : 15 minutes
    expect(endInput.value).toContain("T21:30");
  });
});

describe("planning — sélecteur de taille de grille", () => {
  it("change la hauteur des heures et la mémorise", () => {
    mountPlanning();
    setView("week");

    act(() => {
      container.querySelector('[data-testid="planning-zoom-compact"]').click();
    });
    expect(heightOf(container.querySelector(`[data-testid="week-cell-${todayKey}-21"]`))).toBe(96);
    expect(localStorage.getItem("elysium_planning_zoom")).toBe("compact");

    act(() => {
      container.querySelector('[data-testid="planning-zoom-large"]').click();
    });
    expect(heightOf(container.querySelector(`[data-testid="week-cell-${todayKey}-21"]`))).toBe(180);
    expect(localStorage.getItem("elysium_planning_zoom")).toBe("large");
  });

  it("reprend le dernier choix enregistré", () => {
    localStorage.setItem("elysium_planning_zoom", "normal");
    mountPlanning();
    setView("week");
    expect(heightOf(container.querySelector(`[data-testid="week-cell-${todayKey}-21"]`))).toBe(132);
  });

  it("applique la même hauteur à la vue jour", () => {
    mountPlanning();
    setView("day");
    expect(heightOf(container.querySelector('[data-testid="day-cell-21"]'))).toBe(180);
  });
});
