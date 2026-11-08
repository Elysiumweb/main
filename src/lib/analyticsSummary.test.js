import { summarizeAnalytics } from "./analyticsSummary";
import { ANALYTICS_EVENTS } from "./analyticsEvents";

const NOW = Date.parse("2026-11-08T12:00:00Z");
const at = (daysAgo, hour = 10) =>
  new Date(NOW - daysAgo * 86_400_000 + hour * 3_600_000 - 10 * 3_600_000).toISOString();

const events = [
  { name: ANALYTICS_EVENTS.PAGE_VIEW, path: "/", sessionId: "s1", timestamp: at(0) },
  { name: ANALYTICS_EVENTS.PAGE_VIEW, path: "/recrutement", sessionId: "s1", timestamp: at(0) },
  { name: ANALYTICS_EVENTS.PAGE_VIEW, path: "/recrutement", sessionId: "s2", timestamp: at(1) },
  { name: ANALYTICS_EVENTS.RECRUIT_CLICK, sessionId: "s2", timestamp: at(1) },
  { name: ANALYTICS_EVENTS.APPLICATION_STARTED, sessionId: "s2", timestamp: at(1) },
  { name: ANALYTICS_EVENTS.APPLICATION_STARTED, sessionId: "s3", timestamp: at(2) },
  { name: ANALYTICS_EVENTS.APPLICATION_SUBMITTED, sessionId: "s2", timestamp: at(1) },
  { name: ANALYTICS_EVENTS.DONATE_CLICK, sessionId: "s3", timestamp: at(3) },
  { name: ANALYTICS_EVENTS.PAGE_VIEW, path: "/vieux", sessionId: "s4", timestamp: at(60) },
];

describe("analyticsSummary", () => {
  it("aggregates views, sessions and top pages over the period", () => {
    const summary = summarizeAnalytics(events, { days: 30, now: NOW });
    expect(summary.views).toBe(3);
    expect(summary.sessions).toBe(3);
    expect(summary.pages[0]).toEqual({ path: "/recrutement", count: 2 });
    expect(summary.daily).toHaveLength(30);
    expect(summary.daily.at(-1).views).toBe(2);
  });

  it("computes the application funnel", () => {
    const summary = summarizeAnalytics(events, { days: 30, now: NOW });
    expect(summary.funnel.started).toBe(2);
    expect(summary.funnel.submitted).toBe(1);
    expect(summary.funnel.rate).toBe(50);
  });

  it("counts secondary KPIs", () => {
    const summary = summarizeAnalytics(events, { days: 30, now: NOW });
    expect(summary.kpis.recruitClicks).toBe(1);
    expect(summary.kpis.donateClicks).toBe(1);
    expect(summary.kpis.partnerClicks).toBe(0);
  });

  it("excludes events outside the window", () => {
    const summary = summarizeAnalytics(events, { days: 7, now: NOW });
    expect(summary.counts[ANALYTICS_EVENTS.PAGE_VIEW]).toBe(3);
    expect(summary.totalEvents).toBe(8);
  });
});
