import {
  PLANNING_ZOOM_LEVELS,
  DEFAULT_PLANNING_ZOOM,
  getHourHeight,
  getEventMinHeight,
  layoutDayEvents,
  slotFromPointer,
  minutesOfDay,
  formatSlotRange,
} from "./calendarLayout";

/* ---------------------------------------------------------------------------
 * Mise en page de la grille horaire : hauteur des heures (lisibilité des
 * créneaux de 15 min) et colonnes pour les événements simultanés.
 * ------------------------------------------------------------------------- */

const at = (hours, minutes = 0, day = 15) => new Date(2026, 2, day, hours, minutes, 0, 0);
const makeEvent = (id, start, end) => ({ id, title: id, start, end });

describe("hauteurs de la grille", () => {
  it("propose des hauteurs d'heure nettement plus grandes qu'avant (60 px)", () => {
    PLANNING_ZOOM_LEVELS.forEach((level) => {
      expect(level.hourHeight).toBeGreaterThan(60);
      // Un créneau de 15 min doit dépasser 20 px même au niveau le plus compact.
      expect(level.hourHeight / 4).toBeGreaterThanOrEqual(24);
    });
  });

  it("utilise le niveau « grand » par défaut", () => {
    expect(DEFAULT_PLANNING_ZOOM).toBe("large");
    expect(getHourHeight(DEFAULT_PLANNING_ZOOM)).toBe(180);
    // 15 minutes = 45 px : titre + horaire lisibles
    expect(getHourHeight("large") / 4).toBe(45);
  });

  it("retombe sur la plus grande hauteur pour un niveau inconnu", () => {
    expect(getHourHeight("nawak")).toBe(180);
  });

  it("adapte la hauteur minimale d'un bloc à la hauteur d'heure", () => {
    expect(getEventMinHeight(96)).toBeGreaterThanOrEqual(28);
    expect(getEventMinHeight(180)).toBe(36);
  });
});

describe("layoutDayEvents — positionnement", () => {
  const baseOptions = { startHour: 6, endHour: 24, hourHeight: 180 };

  it("place un créneau de 15 minutes avec une hauteur lisible", () => {
    const [item] = layoutDayEvents([makeEvent("e1", at(21, 0), at(21, 15))], baseOptions);
    expect(item.top).toBe((21 - 6) * 180);
    expect(item.height).toBe(45);
  });

  it("applique la hauteur minimale aux créneaux très courts", () => {
    const [item] = layoutDayEvents([makeEvent("e1", at(21, 0), at(21, 5))], baseOptions);
    expect(item.height).toBe(getEventMinHeight(180));
  });

  it("décale les événements selon l'heure de début (minutes incluses)", () => {
    const [item] = layoutDayEvents([makeEvent("e1", at(9, 30), at(10, 0))], baseOptions);
    expect(item.top).toBe(3.5 * 180);
    expect(item.height).toBe(90);
  });

  it("ignore un événement totalement hors de la grille", () => {
    expect(layoutDayEvents([makeEvent("e1", at(3, 0), at(4, 0))], baseOptions)).toHaveLength(0);
  });

  it("rogne un événement qui franchit minuit", () => {
    const [item] = layoutDayEvents([makeEvent("e1", at(23, 0), at(1, 0, 16))], baseOptions);
    expect(item.top).toBe((23 - 6) * 180);
    // Rogné à 24h : une heure visible
    expect(item.height).toBe(180);
  });
});

describe("layoutDayEvents — événements simultanés", () => {
  const baseOptions = { startHour: 6, endHour: 24, hourHeight: 180 };

  it("met deux événements de 15 min au même moment côte à côte", () => {
    const items = layoutDayEvents([
      makeEvent("a", at(20, 0), at(20, 15)),
      makeEvent("b", at(20, 0), at(20, 15)),
    ], baseOptions);

    expect(items).toHaveLength(2);
    expect(items[0].columnCount).toBe(2);
    expect(items[0].top).toBe(items[1].top);
    expect(items[0].widthPercent).toBe(50);
    expect(items[1].widthPercent).toBe(50);
    expect(items[0].leftPercent).toBe(0);
    expect(items[1].leftPercent).toBe(50);
  });

  it("empile trois événements chevauchants sur trois colonnes", () => {
    const items = layoutDayEvents([
      makeEvent("a", at(18, 0), at(19, 0)),
      makeEvent("b", at(18, 15), at(19, 15)),
      makeEvent("c", at(18, 30), at(19, 30)),
    ], baseOptions);
    expect(items.map((i) => i.columnCount)).toEqual([3, 3, 3]);
    items.forEach((item) => expect(item.widthPercent).toBeCloseTo(100 / 3, 6));
    expect(new Set(items.map((i) => i.leftPercent)).size).toBe(3);
  });

  it("laisse toute la largeur à un événement seul", () => {
    const [item] = layoutDayEvents([makeEvent("a", at(12, 0), at(13, 0))], baseOptions);
    expect(item.columnCount).toBe(1);
    expect(item.leftPercent).toBe(0);
    expect(item.widthPercent).toBe(100);
  });

  it("ne considère pas comme simultanés deux créneaux qui se suivent", () => {
    const items = layoutDayEvents([
      makeEvent("a", at(20, 0), at(20, 15)),
      makeEvent("b", at(20, 15), at(20, 30)),
    ], baseOptions);
    expect(items.map((i) => i.columnCount)).toEqual([1, 1]);
    expect(items.map((i) => i.widthPercent)).toEqual([100, 100]);
  });

  it("tient compte de la hauteur minimale pour éviter le chevauchement visuel", () => {
    // Deux créneaux de 5 min espacés de 5 min : sans marge ils se superposeraient.
    const items = layoutDayEvents([
      makeEvent("a", at(20, 0), at(20, 5)),
      makeEvent("b", at(20, 10), at(20, 15)),
    ], baseOptions);
    expect(items[0].columnCount).toBe(2);
    expect(items[1].columnCount).toBe(2);
  });

  it("étend un événement vers la droite quand la colonne suivante est libre", () => {
    const items = layoutDayEvents([
      makeEvent("long", at(18, 0), at(20, 0)),
      makeEvent("court-1", at(18, 0), at(18, 15)),
      makeEvent("court-2", at(18, 15), at(18, 30)),
    ], baseOptions);
    const longEvent = items.find((i) => i.id === "long");
    // 2 colonnes : le long événement occupe la 1re, les courts se partagent la 2e
    expect(longEvent.columnCount).toBe(2);
    expect(longEvent.widthPercent).toBe(50);
    const court1 = items.find((i) => i.id === "court-1");
    const court2 = items.find((i) => i.id === "court-2");
    expect(court1.widthPercent).toBe(50);
    expect(court2.widthPercent).toBe(50);
    expect(court1.leftPercent).toBe(50);
  });

  it("gère un grand nombre de créneaux de 15 min sur la même heure", () => {
    const many = Array.from({ length: 8 }, (_, i) => makeEvent(`e${i}`, at(21, 0), at(21, 15)));
    const items = layoutDayEvents(many, baseOptions);
    expect(items).toHaveLength(8);
    expect(items.every((i) => i.columnCount === 8)).toBe(true);
    expect(items.reduce((sum, i) => sum + i.widthPercent, 0)).toBeCloseTo(100, 5);
  });

  it("reste stable quel que soit l'ordre d'entrée", () => {
    const events = [
      makeEvent("b", at(19, 0), at(20, 0)),
      makeEvent("a", at(18, 30), at(19, 30)),
      makeEvent("c", at(12, 0), at(13, 0)),
    ];
    const first = layoutDayEvents(events, baseOptions).map((i) => `${i.id}:${i.columnIndex}`);
    const second = layoutDayEvents([...events].reverse(), baseOptions).map((i) => `${i.id}:${i.columnIndex}`);
    expect(second).toEqual(first);
  });
});

describe("slotFromPointer", () => {
  it("arrondit au quart d'heure inférieur", () => {
    expect(slotFromPointer(0, 180, 21)).toEqual({ hour: 21, minute: 0 });
    expect(slotFromPointer(50, 180, 21)).toEqual({ hour: 21, minute: 15 });
    expect(slotFromPointer(95, 180, 21)).toEqual({ hour: 21, minute: 30 });
    expect(slotFromPointer(140, 180, 21)).toEqual({ hour: 21, minute: 45 });
  });

  it("borne le résultat à l'heure cliquée", () => {
    expect(slotFromPointer(-40, 180, 21).minute).toBe(0);
    expect(slotFromPointer(500, 180, 21).minute).toBe(45);
  });
});

describe("utilitaires", () => {
  it("calcule les minutes depuis minuit", () => {
    expect(minutesOfDay(at(9, 45))).toBe(585);
    expect(minutesOfDay(new Date("invalide"))).toBeNull();
  });

  it("formate un intervalle horaire", () => {
    expect(formatSlotRange(at(21, 0), at(21, 15))).toBe("21:00 – 21:15");
    expect(formatSlotRange(at(8, 5), new Date("invalide"))).toBe("08:05");
  });
});
