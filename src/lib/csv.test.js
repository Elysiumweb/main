import { csvFileName, escapeCsvCell, toCsv } from "./csv";

describe("csv", () => {
  it("escapes quotes, separators and newlines", () => {
    expect(escapeCsvCell("simple")).toBe("simple");
    expect(escapeCsvCell('a "quoted" value')).toBe('"a ""quoted"" value"');
    expect(escapeCsvCell("multi\nline")).toBe('"multi\nline"');
    expect(escapeCsvCell(null)).toBe("");
  });

  it("neutralises spreadsheet formulas", () => {
    expect(escapeCsvCell("=1+1")).toBe("'=1+1");
    expect(escapeCsvCell("@import")).toBe("'@import");
    expect(escapeCsvCell("-42")).toBe("'-42");
  });

  it("builds a header and rows from column definitions", () => {
    const csv = toCsv(
      [{ subject: "Bug", age: 3 }, { subject: "Question", age: 1 }],
      [
        { key: "subject", label: "Sujet" },
        { key: "age", label: "Ancienneté", value: (row) => `${row.age} h` },
      ],
    );
    expect(csv.split("\r\n")).toEqual(["Sujet,Ancienneté", "Bug,3 h", "Question,1 h"]);
  });

  it("includes an ISO date in the file name", () => {
    expect(csvFileName("support", new Date("2026-11-08T10:00:00Z"))).toBe("support-2026-11-08.csv");
  });
});
