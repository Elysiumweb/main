import { fmtMatchDate, fmtDate } from "./formatters";

describe("formatters", () => {
  it("formats match date in french", () => {
    const match = { date: "2026-08-02", time: "20:30" };
    const res = fmtMatchDate(match, "fr");
    expect(res).toContain("2 août");
    expect(res).toContain("20:30");
  });

  it("formats match date in english", () => {
    const match = { date: "2026-08-02", time: "20:30" };
    const res = fmtMatchDate(match, "en");
    expect(res).toContain("August 2");
    expect(res).toContain("20:30");
  });

  it("handles string date without time", () => {
    const res = fmtMatchDate("2026-08-02", "fr");
    expect(res).toContain("2 août");
  });

  it("handles invalid or empty date gracefully", () => {
    expect(fmtMatchDate(null)).toBe("");
    expect(fmtMatchDate("")).toBe("");
    expect(fmtMatchDate("invalid-date")).toBe("invalid-date");
  });

  it("formats short date", () => {
    const res = fmtDate("2026-08-02", "fr");
    expect(res).toContain("2026");
  });
});
