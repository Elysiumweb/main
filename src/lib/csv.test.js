import { csvFilename, escapeCsvCell, toCsv } from "./csv";

describe("CSV — échappement", () => {
  test("échappe guillemets, virgules, points-virgules et retours ligne", () => {
    expect(escapeCsvCell("simple")).toBe("simple");
    expect(escapeCsvCell('il a dit "oui"')).toBe('"il a dit ""oui"""');
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell("a;b")).toBe('"a;b"');
    expect(escapeCsvCell("ligne1\nligne2")).toBe('"ligne1\nligne2"');
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(0)).toBe("0");
  });
});

describe("CSV — génération", () => {
  test("déduit les colonnes et respecte l'ordre", () => {
    const csv = toCsv([
      { id: "1", sujet: "Bonjour" },
      { id: "2", sujet: "Salut, ça va ?" },
    ]);
    expect(csv.split("\r\n")).toEqual([
      "id,sujet",
      "1,Bonjour",
      '2,"Salut, ça va ?"',
    ]);
  });

  test("accepte des colonnes explicites avec accesseur", () => {
    const csv = toCsv(
      [{ uid: "u1", age: 120 }],
      [
        { key: "uid", label: "UID" },
        { key: "jours", label: "Ancienneté (j)", get: (row) => Math.round(row.age / 24) },
      ],
    );
    expect(csv).toBe("UID,Ancienneté (j)\r\nu1,5");
  });

  test("nom de fichier horodaté", () => {
    expect(csvFilename("elysium-support", new Date("2026-10-22T08:00:00Z"))).toBe("elysium-support-2026-10-22.csv");
  });
});
