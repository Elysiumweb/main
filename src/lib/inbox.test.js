import {
  EMPTY_FILTERS, filterThreads, formatAge, inboxCounts, slaState, sortThreads, toMillis,
} from "./inbox";

const NOW = Date.parse("2026-11-08T12:00:00Z");
const hoursAgo = (h) => ({ seconds: Math.floor((NOW - h * 3_600_000) / 1000) });

const support = {
  id: "s1", source: "support", subject: "Bug paiement", category: "technical",
  priority: "high", status: "open", createdAt: hoursAgo(5), name: "Alex",
};
const supportFresh = {
  id: "s2", source: "support", subject: "Question compte", category: "account",
  priority: "low", status: "resolved", createdAt: hoursAgo(1), name: "Sam", assignedTo: "u1",
};
const recruit = {
  id: "r1", source: "recruit", pseudo: "Nova", position: "Attaquant", game: "Rocket League",
  status: "pending", createdAt: hoursAgo(80), email: "nova@example.com",
};

describe("inbox", () => {
  it("reads Firestore timestamps, ISO strings and numbers", () => {
    expect(toMillis({ seconds: 100 })).toBe(100000);
    expect(toMillis("2026-11-08T00:00:00Z")).toBe(Date.parse("2026-11-08T00:00:00Z"));
    expect(toMillis(5000)).toBe(5000);
    expect(toMillis(null)).toBe(0);
  });

  it("computes SLA state from priority and age", () => {
    expect(slaState(support, NOW)).toBe("overdue"); // 5 h > 4 h (haute)
    expect(slaState(supportFresh, NOW)).toBe("ok"); // résolu
    expect(slaState({ ...support, priority: "normal", createdAt: hoursAgo(1) }, NOW)).toBe("ok");
    expect(slaState({ ...support, priority: "normal", createdAt: hoursAgo(20) }, NOW)).toBe("soon");
  });

  it("filters by source, status, priority, assignee and search", () => {
    const all = [support, supportFresh, recruit];
    expect(filterThreads(all, { ...EMPTY_FILTERS, source: "support" }, NOW)).toHaveLength(2);
    expect(filterThreads(all, { ...EMPTY_FILTERS, status: "pending" }, NOW)).toEqual([recruit]);
    expect(filterThreads(all, { ...EMPTY_FILTERS, priority: "high" }, NOW)).toEqual([support]);
    expect(filterThreads(all, { ...EMPTY_FILTERS, assignee: "unassigned" }, NOW)).toHaveLength(2);
    expect(filterThreads(all, { ...EMPTY_FILTERS, query: "paiement" }, NOW)).toEqual([support]);
    expect(filterThreads(all, { ...EMPTY_FILTERS, query: "NOVA" }, NOW)).toEqual([recruit]);
    expect(filterThreads(all, { ...EMPTY_FILTERS, query: "nova@example" }, NOW)).toEqual([recruit]);
  });

  it("sorts overdue first then oldest", () => {
    const sorted = sortThreads([supportFresh, recruit, support], NOW);
    expect(sorted[0].id).toBe("r1");
    expect(sorted[1].id).toBe("s1");
    expect(sorted[2].id).toBe("s2");
  });

  it("counts open, unassigned and overdue threads", () => {
    const counts = inboxCounts([support, supportFresh, recruit], NOW);
    expect(counts.open).toBe(2);
    expect(counts.unassigned).toBe(2);
    expect(counts.overdue).toBe(2);
    expect(counts.support).toBe(1);
    expect(counts.recruit).toBe(1);
  });

  it("formats age in hours then days", () => {
    expect(formatAge({ createdAt: hoursAgo(0.2) }, "fr", NOW)).toBe("à l'instant");
    expect(formatAge({ createdAt: hoursAgo(5) }, "fr", NOW)).toBe("5 h");
    expect(formatAge({ createdAt: hoursAgo(80) }, "fr", NOW)).toBe("3 j");
  });
});
