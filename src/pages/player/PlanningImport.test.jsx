import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

/* ---------------------------------------------------------------------------
 * Import .ics depuis le planning (managers) :
 *  - le bouton n'apparaît que pour les managers ;
 *  - un fichier .ics est lu, les séances récurrentes sont développées ;
 *  - les séances déjà planifiées ne sont pas dupliquées ;
 *  - la validation écrit un document `events` par séance sur le roster choisi.
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
  setDoc: () => Promise.resolve(),
  updateDoc: () => Promise.resolve(),
  addDoc: (_ref, data) => {
    writes.push({ collection: "events", data });
    return Promise.resolve({ id: `new-${writes.length}` });
  },
  deleteDoc: () => Promise.resolve(),
  serverTimestamp: () => "ts",
  deleteField: () => "DELETE",
}));

jest.mock("../../lib/firebase", () => ({ db: {}, auth: {}, functions: {}, storage: {} }));
jest.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: { uid: "manager-1", email: "manager@example.com" },
    game: "RL",
    roster: "Elysium RL",
    isOfficial: false,
    canManage: true,
    displayName: "Manager",
  }),
}));
jest.mock("../../lib/i18n", () => ({ useLang: () => ({ t: (k) => k, lang: "fr" }) }));
jest.mock("../../hooks/useRosters", () => ({
  useRosters: () => ({
    rostersForGame: (game) => (game === "RL" ? ["Elysium RL", "Elysium RL B"] : []),
    allNames: ["Elysium RL", "Elysium RL B"],
    gameHasRosters: (game) => game === "RL",
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

const snapshotOf = (list) => ({ docs: list.map((d) => ({ id: d.id, data: () => ({ ...d }) })) });
const emit = (name, list = []) => {
  act(() => {
    listeners[name](snapshotOf(list));
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
  ["events", "availabilities", "recurringAvailabilities", "absences", "profiles", "users"].forEach((n) => emit(n, []));
};

const openImport = () => {
  const button = container.querySelector('[data-testid="planning-import-ics"]');
  act(() => button.click());
};

const chooseFile = async (content, name = "planning.ics") => {
  const input = container.querySelector('[data-testid="import-file-input"]');
  const file = { name, type: "text/calendar", size: content.length, text: () => Promise.resolve(content) };
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const selectValue = (testId, value) => {
  const select = container.querySelector(`[data-testid="${testId}"]`);
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

// Événements futurs : la fenêtre d'import démarre aujourd'hui.
const daysFromNow = (days, hour = 20) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const icsStamp = (date) => date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

const buildICS = (title, start, { rrule } = {}) => `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:${title.replace(/\s/g, "-")}
DTSTART:${icsStamp(start)}
DTEND:${icsStamp(new Date(start.getTime() + 2 * 3600 * 1000))}
SUMMARY:${title}
${rrule ? `RRULE:${rrule}\n` : ""}END:VEVENT
END:VCALENDAR`;

beforeEach(() => {
  Object.keys(listeners).forEach((k) => delete listeners[k]);
  writes.length = 0;
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

describe("planning — import .ics (manager)", () => {
  it("ouvre la fenêtre d'import depuis la barre d'outils", () => {
    mountPlanning();
    expect(container.querySelector('[data-testid="planning-import-ics"]')).not.toBeNull();
    openImport();
    expect(container.querySelector('[data-testid="import-modal"]')).not.toBeNull();
  });

  it("n'active pas l'import pour un fichier sans séance", async () => {
    mountPlanning();
    openImport();
    await chooseFile("BEGIN:VCALENDAR\nEND:VCALENDAR");
    expect(container.querySelector('[data-testid="import-preview-list"]')).toBeNull();
    expect(container.querySelector('[data-testid="import-submit"]').disabled).toBe(true);
  });

  it("refuse un fichier qui n'est pas du calendrier", async () => {
    mountPlanning();
    openImport();
    await chooseFile("ceci n'est pas un calendrier", "notes.ics");
    expect(container.querySelector('[data-testid="import-error"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="import-submit"]').disabled).toBe(true);
  });

  it("développe la récurrence et importe les séances sur le roster choisi", async () => {
    mountPlanning();
    openImport();
    selectValue("import-roster", "Elysium RL");

    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:scrims
DTSTART:${icsStamp(daysFromNow(3))}
DTEND:${icsStamp(new Date(daysFromNow(3).getTime() + 2 * 3600 * 1000))}
SUMMARY:Scrim RL vs VIT
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT
BEGIN:VEVENT
UID:review
DTSTART:${icsStamp(daysFromNow(5))}
DTEND:${icsStamp(new Date(daysFromNow(5).getTime() + 3600 * 1000))}
SUMMARY:Review VOD
END:VEVENT
END:VCALENDAR`;

    await chooseFile(ics);

    const preview = container.querySelector('[data-testid="import-preview"]');
    expect(preview).not.toBeNull();
    // 3 occurrences du scrim + 1 review
    const previewRows = container.querySelectorAll('[data-testid="import-preview-list"] li');
    expect(previewRows).toHaveLength(4);
    expect(preview.textContent).toContain("Scrim RL vs VIT");
    expect(preview.textContent).toContain("Review VOD");

    await act(async () => {
      container.querySelector('[data-testid="import-submit"]').click();
    });

    expect(writes).toHaveLength(4);
    const titles = writes.map((w) => w.data.title);
    expect(titles.filter((t) => t === "Scrim RL vs VIT")).toHaveLength(3);
    expect(titles).toContain("Review VOD");
    writes.forEach((write) => {
      expect(write.data.game).toBe("RL");
      expect(write.data.roster).toBe("Elysium RL");
      expect(write.data.attendance).toEqual({});
      expect(write.data.importSource.fileName).toBe("planning.ics");
      expect(new Date(write.data.end) > new Date(write.data.start)).toBe(true);
    });
    // La fenêtre d'import ne crée pas d'événements dans le passé.
    writes.forEach((write) => {
      expect(new Date(write.data.start).getTime()).toBeGreaterThan(Date.now() - 1000);
    });
  });

  it("n'importe pas une séance déjà planifiée sur la même cible", async () => {
    mountPlanning();
    const start = daysFromNow(4);
    emit("events", [{
      id: "e1", title: "Scrim RL vs VIT", start: start.toISOString(),
      end: new Date(start.getTime() + 7200e3).toISOString(), color: "#4285F4", game: "RL", roster: "Elysium RL",
    }]);

    openImport();
    selectValue("import-roster", "Elysium RL");

    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART:${icsStamp(start)}
DTEND:${icsStamp(new Date(start.getTime() + 7200e3))}
SUMMARY:Scrim RL vs VIT
END:VEVENT
BEGIN:VEVENT
DTSTART:${icsStamp(daysFromNow(6))}
DTEND:${icsStamp(new Date(daysFromNow(6).getTime() + 7200e3))}
SUMMARY:Scrim RL vs KARMINE
END:VEVENT
END:VCALENDAR`;

    await chooseFile(ics);
    expect(container.querySelector('[data-testid="import-duplicates"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="import-preview-list"] li')).toHaveLength(1);

    await act(async () => {
      container.querySelector('[data-testid="import-submit"]').click();
    });
    expect(writes).toHaveLength(1);
    expect(writes[0].data.title).toBe("Scrim RL vs KARMINE");
  });

  it("bloque l'import tant qu'aucun roster n'est choisi", async () => {
    mountPlanning();
    openImport();
    await chooseFile(buildICS("Scrim", daysFromNow(7)));
    // Le roster du manager est présélectionné : on le vide.
    selectValue("import-roster", "");
    expect(container.querySelector('[data-testid="import-submit"]').disabled).toBe(true);
  });
});
