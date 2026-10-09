import {
  APPLICATION_STEPS,
  DEFAULT_STEP_DELAYS,
  SPONTANEOUS_POSITION,
  daysSince,
  fmtTryoutStart,
  isTerminalStatus,
  isTryoutBookable,
  normalizeStepDelays,
  sanitizeGame,
  stepIndexForStatus,
  toDate,
  tryoutRemaining,
} from "./recruitment";

const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
const past = (days) => new Date(Date.now() - days * 86400000).toISOString();

describe("recruitment — étapes du parcours", () => {
  it("propose quatre étapes couvrant tous les statuts de dossier", () => {
    expect(APPLICATION_STEPS.map((s) => s.id)).toEqual(["received", "test", "interview", "decision"]);
    const statuses = APPLICATION_STEPS.flatMap((s) => s.statuses);
    ["pending", "pending_parental_consent", "reviewing", "interviewing", "accepted", "rejected"].forEach((s) =>
      expect(statuses).toContain(s)
    );
  });

  it("mappe chaque statut sur son étape", () => {
    expect(stepIndexForStatus("pending")).toBe(0);
    expect(stepIndexForStatus("pending_parental_consent")).toBe(0);
    expect(stepIndexForStatus("reviewing")).toBe(1);
    expect(stepIndexForStatus("interviewing")).toBe(2);
    expect(stepIndexForStatus("accepted")).toBe(3);
    expect(stepIndexForStatus("rejected")).toBe(3);
  });

  it("retombe sur la première étape pour un statut inconnu", () => {
    expect(stepIndexForStatus("n_importe_quoi")).toBe(0);
    expect(stepIndexForStatus(undefined)).toBe(0);
  });

  it("ne termine le parcours que sur une décision", () => {
    expect(isTerminalStatus("accepted")).toBe(true);
    expect(isTerminalStatus("rejected")).toBe(true);
    expect(isTerminalStatus("reviewing")).toBe(false);
    expect(isTerminalStatus("interviewing")).toBe(false);
  });
});

describe("recruitment — délais moyens", () => {
  it("conserve les délais par défaut quand le document est absent", () => {
    expect(normalizeStepDelays(null)).toEqual(DEFAULT_STEP_DELAYS);
    expect(normalizeStepDelays(undefined)).toEqual(DEFAULT_STEP_DELAYS);
  });

  it("surcharge uniquement les valeurs numériques plausibles", () => {
    const d = normalizeStepDelays({ received: 4, test: "beaucoup", interview: -3, decision: 999, extra: 1 });
    expect(d.received).toBe(4);
    expect(d.test).toBe(DEFAULT_STEP_DELAYS.test);
    expect(d.interview).toBe(DEFAULT_STEP_DELAYS.interview);
    expect(d.decision).toBe(DEFAULT_STEP_DELAYS.decision);
    expect(d.extra).toBeUndefined();
  });

  it("arrondit les délais décimaux", () => {
    expect(normalizeStepDelays({ test: 4.6 }).test).toBe(5);
  });
});

describe("recruitment — dates", () => {
  it("convertit les timestamps Firestore, ISO et Date", () => {
    const iso = "2026-08-02T20:30:00.000Z";
    expect(toDate(iso).toISOString()).toBe(iso);
    expect(toDate(new Date(iso)).toISOString()).toBe(iso);
    expect(toDate({ toDate: () => new Date(iso) }).toISOString()).toBe(iso);
    expect(toDate(null)).toBeNull();
    expect(toDate("pas une date")).toBeNull();
  });

  it("compte les jours pleins écoulés", () => {
    expect(daysSince(past(0))).toBe(0);
    expect(daysSince(past(3))).toBe(3);
    expect(daysSince(future(2))).toBe(0); // on ne compte pas les dates futures
    expect(daysSince(null)).toBeNull();
  });

  it("formate un créneau d'essai selon la langue", () => {
    const slot = { start: "2026-08-02T20:30:00.000Z" };
    expect(fmtTryoutStart(slot, "fr")).toMatch(/20:30/);
    expect(fmtTryoutStart(slot, "en")).toMatch(/20:30/);
    expect(fmtTryoutStart({}, "fr")).toBe("");
  });
});

describe("recruitment — tryouts", () => {
  it("réserve un créneau ouvert, futur et non complet", () => {
    const slot = { start: future(2), open: true, capacity: 4, bookedCount: 1 };
    expect(isTryoutBookable(slot)).toBe(true);
    expect(tryoutRemaining(slot)).toBe(3);
  });

  it("refuse un créneau complet, fermé ou passé", () => {
    expect(isTryoutBookable({ start: future(1), capacity: 2, bookedCount: 2 })).toBe(false);
    expect(isTryoutBookable({ start: future(1), open: false, capacity: 0 })).toBe(false);
    expect(isTryoutBookable({ start: past(1), capacity: 0 })).toBe(false);
    expect(isTryoutBookable(null)).toBe(false);
  });

  it("traite une capacité nulle ou absente comme illimitée", () => {
    const slot = { start: future(1), capacity: 0, bookedCount: 12 };
    expect(isTryoutBookable(slot)).toBe(true);
    expect(tryoutRemaining(slot)).toBeNull();
  });
});

describe("recruitment — candidature spontanée", () => {
  it("n'accepte que les jeux connus", () => {
    expect(sanitizeGame("EVA")).toBe("EVA");
    expect(sanitizeGame("Rocket League")).toBe("Rocket League");
    expect(sanitizeGame("Valorant")).toBe("");
    expect(sanitizeGame(undefined)).toBe("");
  });

  it("expose l'intitulé de remplacement du poste", () => {
    expect(SPONTANEOUS_POSITION).toBe("Candidature spontanée");
  });
});