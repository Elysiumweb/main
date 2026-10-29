import {
  normalizeICSColor,
  ensureVisibleOnDark,
  parseICS,
  expandICS,
  expandEvent,
  parseICSDate,
  parseRRule,
  parseDuration,
  eventSignature,
  isIcsFileTooLarge,
} from "./icsImport";

/* ---------------------------------------------------------------------------
 * Import .ics (managers) : lecture du fichier + développement des récurrences.
 * Les assertions qui touchent à une récurrence raisonnent en heure locale
 * (la série conserve l'heure murale) pour rester justes quel que soit le
 * fuseau de la machine de test.
 * ------------------------------------------------------------------------- */

const localKey = (date) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const wrap = (body, extra = "") => `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Elysium//Test
${extra}${body}END:VCALENDAR`;

describe("parseICS — lecture du fichier", () => {
  it("lit un événement UTC avec description échappée et lignes pliées", () => {
    const parsed = parseICS(wrap(`BEGIN:VEVENT
UID:evt-1
DTSTAMP:20260101T100000Z
DTSTART:20260210T200000Z
DTEND:20260210T220000Z
SUMMARY:Scrim RL vs VIT
DESCRIPTION:Ligne 1\\nLigne 2\\, avec virgule
LOCATION:Discord
END:VEVENT
`, "X-WR-CALNAME:Planning Elysium\r\n"));

    expect(parsed.error).toBeNull();
    expect(parsed.calendarName).toBe("Planning Elysium");
    expect(parsed.events).toHaveLength(1);

    const [event] = parsed.events;
    expect(event.title).toBe("Scrim RL vs VIT");
    expect(event.description).toBe("Ligne 1\nLigne 2, avec virgule");
    expect(event.location).toBe("Discord");
    expect(event.allDay).toBe(false);
    expect(event.start).toBe("2026-02-10T20:00:00.000Z");
    expect(event.end).toBe("2026-02-10T22:00:00.000Z");
  });

  it("déplie une ligne coupée en deux", () => {
    const ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20260401T180000Z\nSUMMARY:Reunion tres longue qui\n  continue sur une autre ligne\nEND:VEVENT\nEND:VCALENDAR";
    expect(parseICS(ics).events[0].title).toBe("Reunion tres longue qui continue sur une autre ligne");
  });

  it("conserve les journées entières (VALUE=DATE)", () => {
    const parsed = parseICS(wrap(`BEGIN:VEVENT
DTSTART;VALUE=DATE:20260301
DTEND;VALUE=DATE:20260302
SUMMARY:Tournoi LAN
END:VEVENT
`));
    const [event] = parsed.events;
    expect(event.allDay).toBe(true);
    expect(localKey(event.start)).toBe("2026-03-01 00:00");
    expect(localKey(event.end)).toBe("2026-03-02 00:00");
  });

  it("ignore VTIMEZONE, VALARM et les événements annulés", () => {
    const parsed = parseICS(wrap(`BEGIN:VTIMEZONE
TZID:Europe/Paris
BEGIN:STANDARD
DTSTART:19701025T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
SUMMARY:ne doit pas fuiter
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
DTSTART:20260210T200000Z
SUMMARY:Scrim
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:rappel
TRIGGER:-PT15M
END:VALARM
END:VEVENT
BEGIN:VEVENT
DTSTART:20260211T200000Z
STATUS:CANCELLED
SUMMARY:Annulé
END:VEVENT
`));

    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].title).toBe("Scrim");
    expect(parsed.events[0].description).toBe("");
    expect(parsed.counts.cancelled).toBe(1);
  });

  it("déduit la fin depuis DURATION quand DTEND est absent", () => {
    const parsed = parseICS(wrap(`BEGIN:VEVENT
DTSTART:20260101T100000Z
DURATION:PT1H30M
SUMMARY:x
END:VEVENT
`));
    expect(parsed.events[0].end).toBe("2026-01-01T11:30:00.000Z");
  });

  it("signale un fichier qui n'est pas de l'iCalendar", () => {
    expect(parseICS("bonjour").error).toBe("not-ics");
    expect(parseICS("").error).toBe("empty");
  });

  it("tolère un fichier sans aucun VEVENT", () => {
    const parsed = parseICS(wrap(""));
    expect(parsed.error).toBeNull();
    expect(parsed.events).toHaveLength(0);
  });
});

describe("parseICSDate — fuseaux", () => {
  it("convertit un TZID réel (heure d'été parisienne)", () => {
    const parsed = parseICSDate("20260701T210000", { TZID: "Europe/Paris" });
    expect(parsed.date.toISOString()).toBe("2026-07-01T19:00:00.000Z");
  });

  it("convertit un TZID réel (heure d'hiver parisienne)", () => {
    const parsed = parseICSDate("20260115T210000", { TZID: "Europe/Paris" });
    expect(parsed.date.toISOString()).toBe("2026-01-15T20:00:00.000Z");
  });

  it("lit le format UTC et le format date seule", () => {
    expect(parseICSDate("20260210T200000Z").date.toISOString()).toBe("2026-02-10T20:00:00.000Z");
    const allDay = parseICSDate("20260301", { VALUE: "DATE" });
    expect(allDay.allDay).toBe(true);
    expect(localKey(allDay.date)).toBe("2026-03-01 00:00");
  });

  it("retombe sur l'heure locale si le fuseau est inconnu", () => {
    const parsed = parseICSDate("20260701T210000", { TZID: "Mars/Olympus_Mons" });
    expect(localKey(parsed.date)).toBe("2026-07-01 21:00");
  });

  it("refuse une valeur invalide", () => {
    expect(parseICSDate("pas une date")).toBeNull();
    expect(parseICSDate("20261340")).toBeNull();
  });
});

describe("normalizeICSColor / ensureVisibleOnDark", () => {
  it("normalise les écritures hexadécimales", () => {
    expect(normalizeICSColor("#fff")).toBe("#FFFFFF");
    expect(normalizeICSColor("#0b8043")).toBe("#0B8043");
    expect(normalizeICSColor("#FF0000AA")).toBe("#FF0000");
    expect(normalizeICSColor('"#123456"')).toBe("#123456");
  });

  it("convertit les noms CSS et les notations rgb()", () => {
    expect(normalizeICSColor("red")).toBe("#FF0000");
    expect(normalizeICSColor(" DarkSlateBlue ")).toBe("#483D8B");
    expect(normalizeICSColor("rgb(255, 128, 0)")).toBe("#FF8000");
    expect(normalizeICSColor("rgba(0,128,255,0.5)")).toBe("#0080FF");
  });

  it("refuse une couleur inconnue plutôt que de casser le planning", () => {
    expect(normalizeICSColor("transparent")).toBeNull();
    expect(normalizeICSColor("pasunecouleur")).toBeNull();
    expect(normalizeICSColor("#GG0000")).toBeNull();
    expect(normalizeICSColor("")).toBeNull();
  });

  it("éclaircit une couleur trop sombre pour le planning noir", () => {
    const black = ensureVisibleOnDark("#000000");
    expect(black).not.toBe("#000000");
    expect(black).toMatch(/^#[0-9A-F]{6}$/);
    // Une couleur déjà lisible n'est pas modifiée.
    expect(ensureVisibleOnDark("#4285F4")).toBe("#4285F4");
    expect(ensureVisibleOnDark("#D8CA82")).toBe("#D8CA82");
  });
});

describe("parseICS — couleurs du fichier", () => {
  it("lit COLOR sur un événement (RFC 7986)", () => {
    const parsed = parseICS(wrap(`BEGIN:VEVENT
DTSTART:20260210T200000Z
DTEND:20260210T220000Z
SUMMARY:Scrim
COLOR:#0B8043
END:VEVENT
`));
    expect(parsed.events[0].color).toBe("#0B8043");
    expect(parsed.colors).toEqual(["#0B8043"]);
  });

  it("accepte un nom de couleur CSS", () => {
    const parsed = parseICS(wrap(`BEGIN:VEVENT
DTSTART:20260210T200000Z
SUMMARY:Scrim
COLOR:crimson
END:VEVENT
`));
    expect(parsed.events[0].color).toBe("#DC143C");
  });

  it("applique X-APPLE-CALENDAR-COLOR aux événements sans couleur", () => {
    const parsed = parseICS(wrap(`BEGIN:VEVENT
DTSTART:20260210T200000Z
SUMMARY:Sans couleur
END:VEVENT
BEGIN:VEVENT
DTSTART:20260211T200000Z
SUMMARY:Avec couleur
COLOR:#FF4500
END:VEVENT
`, "X-APPLE-CALENDAR-COLOR:#0B8043\r\n"));
    expect(parsed.calendarColor).toBe("#0B8043");
    expect(parsed.events[0].color).toBe("#0B8043");
    expect(parsed.events[1].color).toBe("#FF4500");
    expect(parsed.colors).toEqual(["#0B8043", "#FF4500"]);
  });

  it("ne fabrique pas de couleur quand le fichier n'en contient pas", () => {
    const parsed = parseICS(wrap(`BEGIN:VEVENT
DTSTART:20260210T200000Z
SUMMARY:Neutre
END:VEVENT
`));
    expect(parsed.calendarColor).toBeNull();
    expect(parsed.events[0].color).toBeNull();
    expect(parsed.colors).toEqual([]);
  });

  it("ignore une couleur invalide", () => {
    const parsed = parseICS(wrap(`BEGIN:VEVENT
DTSTART:20260210T200000Z
SUMMARY:Scrim
COLOR:pasunecouleur
END:VEVENT
`));
    expect(parsed.events[0].color).toBeNull();
  });

  it("propage la couleur jusqu'aux occurrences développées", () => {
    const parsed = parseICS(wrap(`BEGIN:VEVENT
DTSTART:20260210T200000Z
DTEND:20260210T220000Z
SUMMARY:Scrim
COLOR:teal
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT
`));
    const { occurrences } = expandICS(parsed.events, {
      from: new Date(2026, 1, 1),
      to: new Date(2026, 2, 1),
    });
    expect(occurrences).toHaveLength(3);
    occurrences.forEach((occ) => expect(occ.color).toBe("#008080"));
  });
});

describe("parseRRule / parseDuration", () => {
  it("lit FREQ, INTERVAL, COUNT, UNTIL et BYDAY", () => {
    const rule = parseRRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;COUNT=8");
    expect(rule.freq).toBe("WEEKLY");
    expect(rule.interval).toBe(2);
    expect(rule.count).toBe(8);
    expect(rule.byDay).toEqual(["MO", "TH"]);
    expect(rule.unsupported).toBe(false);
  });

  it("marque comme non gérées les combinaisons exotiques", () => {
    expect(parseRRule("FREQ=MONTHLY;BYDAY=2TU").unsupported).toBe(true);
    expect(parseRRule("FREQ=HOURLY").unsupported).toBe(true);
    expect(parseRRule("FREQ=WEEKLY;BYDAY=MO;BYSETPOS=1").unsupported).toBe(true);
  });

  it("lit les durées ISO", () => {
    expect(parseDuration("PT1H30M")).toBe(90 * 60 * 1000);
    expect(parseDuration("P1D")).toBe(24 * 3600 * 1000);
    expect(parseDuration("P2W")).toBe(14 * 24 * 3600 * 1000);
    expect(parseDuration("n'importe quoi")).toBeNull();
  });
});

describe("expandEvent — récurrences", () => {
  const base = {
    uid: "series-1",
    title: "Scrim",
    start: "2026-02-10T20:00:00.000Z",
    end: "2026-02-10T22:00:00.000Z",
  };
  const window = { from: new Date(2026, 1, 1), to: new Date(2026, 5, 1) };
  const keys = (result) => result.occurrences.map((o) => localKey(o.start));

  it("développe une série hebdomadaire BYDAY en conservant l'heure murale", () => {
    const result = expandEvent(
      { ...base, rrule: parseRRule("FREQ=WEEKLY;BYDAY=TU,TH;COUNT=6") },
      window
    );
    expect(result.occurrences).toHaveLength(6);
    expect(keys(result)[0]).toBe("2026-02-10 20:00");
    expect(keys(result)).toEqual([
      "2026-02-10 20:00",
      "2026-02-12 20:00",
      "2026-02-17 20:00",
      "2026-02-19 20:00",
      "2026-02-24 20:00",
      "2026-02-26 20:00",
    ]);
    // Durée conservée sur chaque occurrence
    expect(new Date(result.occurrences[3].end) - new Date(result.occurrences[3].start)).toBe(2 * 3600 * 1000);
  });

  it("retire les dates EXDATE de la série", () => {
    const result = expandICS(
      parseICS(wrap(`BEGIN:VEVENT
DTSTART:20260210T200000Z
DTEND:20260210T220000Z
SUMMARY:Scrim
RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=3
EXDATE:20260217T200000Z
END:VEVENT
`)).events,
      window
    );
    expect(result.occurrences.map((o) => localKey(o.start))).toEqual([
      "2026-02-10 20:00",
      "2026-02-24 20:00",
    ]);
  });

  it("respecte UNTIL (journée incluse)", () => {
    const result = expandEvent(
      { ...base, rrule: parseRRule("FREQ=DAILY;UNTIL=20260213T200000Z") },
      window
    );
    expect(keys(result)).toEqual([
      "2026-02-10 20:00",
      "2026-02-11 20:00",
      "2026-02-12 20:00",
      "2026-02-13 20:00",
    ]);
  });

  it("saute les mois qui n'ont pas le jour demandé", () => {
    const result = expandEvent(
      {
        title: "Réunion",
        start: "2026-01-31T18:00:00.000Z",
        end: "2026-01-31T19:00:00.000Z",
        rrule: parseRRule("FREQ=MONTHLY;COUNT=3"),
      },
      { from: new Date(2026, 0, 1), to: new Date(2027, 0, 1) }
    );
    expect(keys(result)).toEqual(["2026-01-31 18:00", "2026-03-31 18:00", "2026-05-31 18:00"]);
  });

  it("n'importe qu'une fois les règles non gérées et le signale", () => {
    const result = expandEvent({ ...base, rrule: parseRRule("FREQ=MONTHLY;BYDAY=2TU") }, window);
    expect(result.occurrences).toHaveLength(1);
    expect(result.approximate).toBe(true);
  });

  it("ignore les occurrences hors fenêtre et les événements passés", () => {
    const result = expandEvent(base, { from: new Date(2026, 3, 1), to: new Date(2026, 4, 1) });
    expect(result.occurrences).toHaveLength(0);
  });

  it("remplace l'occurrence déplacée via RECURRENCE-ID", () => {
    const parsed = parseICS(wrap(`BEGIN:VEVENT
UID:series-9
DTSTART:20260210T200000Z
DTEND:20260210T220000Z
SUMMARY:Scrim
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT
BEGIN:VEVENT
UID:series-9
RECURRENCE-ID:20260217T200000Z
DTSTART:20260218T180000Z
DTEND:20260218T200000Z
SUMMARY:Scrim (décalé)
END:VEVENT
`));
    const { occurrences } = expandICS(parsed.events, window);
    const starts = occurrences.map((o) => localKey(o.start));
    expect(starts).toEqual(["2026-02-10 20:00", "2026-02-18 18:00", "2026-02-24 20:00"]);
    expect(occurrences[1].title).toBe("Scrim (décalé)");
  });

  it("plafonne le nombre d'occurrences importées", () => {
    const parsed = parseICS(wrap(`BEGIN:VEVENT
DTSTART:20260101T200000Z
DTEND:20260101T220000Z
SUMMARY:Quotidien
RRULE:FREQ=DAILY
END:VEVENT
`));
    const result = expandICS(parsed.events, { from: new Date(2026, 0, 1), to: new Date(2027, 0, 1), max: 10 });
    expect(result.occurrences).toHaveLength(10);
    expect(result.truncated).toBe(true);
  });

  it("trie les occurrences par date", () => {
    const parsed = parseICS(wrap(`BEGIN:VEVENT
DTSTART:20260310T200000Z
DTEND:20260310T220000Z
SUMMARY:B
END:VEVENT
BEGIN:VEVENT
DTSTART:20260301T200000Z
DTEND:20260301T220000Z
SUMMARY:A
END:VEVENT
`));
    const { occurrences } = expandICS(parsed.events, window);
    expect(occurrences.map((o) => o.title)).toEqual(["A", "B"]);
  });
});

describe("utilitaires d'import", () => {
  it("repère un doublon par titre + début arrondi à la minute", () => {
    expect(eventSignature(" Scrim RL ", "2026-02-10T20:00:00.000Z"))
      .toBe(eventSignature("scrim rl", "2026-02-10T20:00:59.000Z"));
    expect(eventSignature("Scrim RL", "2026-02-10T20:00:00.000Z"))
      .not.toBe(eventSignature("Scrim EVA", "2026-02-10T20:00:00.000Z"));
  });

  it("refuse un fichier trop volumineux", () => {
    expect(isIcsFileTooLarge({ size: 10 })).toBe(false);
    expect(isIcsFileTooLarge({ size: 3 * 1024 * 1024 })).toBe(true);
    expect(isIcsFileTooLarge(null)).toBe(false);
  });
});
