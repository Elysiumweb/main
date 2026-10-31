import {
  getEffectiveMatchStatus,
  getMatchWindowMs,
  getTodayIsoInTimezone,
} from "./matchStatus";

describe("matchStatus — passage automatique en En direct et gestion Annulé", () => {
  test("conserve les statuts finished, cancelled et live explicites", () => {
    expect(getEffectiveMatchStatus({ status: "finished", date: "2026-10-31", time: "20:00" })).toBe("finished");
    expect(getEffectiveMatchStatus({ status: "cancelled", date: "2026-10-31", time: "20:00" })).toBe("cancelled");
    expect(getEffectiveMatchStatus({ status: "live", date: "2026-10-31", time: "20:00" })).toBe("live");
  });

  test("passe un match upcoming en live lorsqu'il est en cours (Europe/Paris)", () => {
    const match = {
      status: "upcoming",
      date: "2026-10-31",
      time: "20:00",
      endTime: "21:30",
      timezone: "Europe/Paris",
    };

    // 31 octobre 2026 = UTC+1 à Paris : 20:00 Paris = 19:00 UTC, 21:30 Paris = 20:30 UTC
    const beforeMs = Date.parse("2026-10-31T18:55:00Z");
    const duringMs = Date.parse("2026-10-31T19:30:00Z");
    const afterMs = Date.parse("2026-10-31T20:35:00Z");

    expect(getEffectiveMatchStatus(match, beforeMs)).toBe("upcoming");
    expect(getEffectiveMatchStatus(match, duringMs)).toBe("live");
    expect(getEffectiveMatchStatus(match, afterMs)).toBe("upcoming");
  });

  test("utilise une durée par défaut de 2h si endTime n'est pas renseigné", () => {
    const match = {
      status: "upcoming",
      date: "2026-10-31",
      time: "20:00",
      timezone: "Europe/Paris",
    };
    const win = getMatchWindowMs(match);
    expect(win.endAtMs - win.startAtMs).toBe(2 * 60 * 60 * 1000);
    expect(getTodayIsoInTimezone(new Date("2026-10-31T23:30:00Z"), "Europe/Paris")).toBe("2026-11-01");
  });
});
