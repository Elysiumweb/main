import {
  MAX_STANDINGS_ROWS,
  STANDINGS_CSV_TEMPLATE,
  describeDelimiter,
  detectCsvDelimiter,
  mergeStandingsRows,
  parseCsvMatrix,
  parseStandingsCsv,
  sortStandingsRows,
} from "./standingsCsv";

const rowsByTeam = (rows) => Object.fromEntries(rows.map((row) => [row.team, row]));

describe("parseCsvMatrix", () => {
  test("gère les guillemets, les séparateurs et les fins de ligne CRLF", () => {
    const matrix = parseCsvMatrix('Équipe;J\r\n"Team, Alpha";10\r\n"Team ""B""";8', ";");
    expect(matrix).toEqual([
      ["Équipe", "J"],
      ["Team, Alpha", "10"],
      ['Team "B"', "8"],
    ]);
  });
});

describe("detectCsvDelimiter", () => {
  test("détecte le point-virgule, la virgule et la tabulation", () => {
    expect(detectCsvDelimiter("Équipe;J;V;N;D")).toBe(";");
    expect(detectCsvDelimiter("Team,P,W,D,L")).toBe(",");
    expect(detectCsvDelimiter("Team\tP\tW\tD")).toBe("\t");
  });

  test("ignore les séparateurs entre guillemets", () => {
    expect(detectCsvDelimiter('"a;b;c";J;V')).toBe(";");
  });
});

describe("parseStandingsCsv — en-tête français", () => {
  const csv = [
    "Équipe;J;V;N;D;Pts;+/-",
    "Team Bravo;10;5;1;4;16;-3",
    "Elysium;10;8;1;1;25;+18",
    "Team Alpha;10;6;2;2;20;+8",
  ].join("\n");

  test("mappe les colonnes et trie par points puis différence", () => {
    const result = parseStandingsCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.headerDetected).toBe(true);
    expect(result.delimiter).toBe(";");
    expect(result.rows.map((r) => r.team)).toEqual(["Elysium", "Team Alpha", "Team Bravo"]);
    expect(rowsByTeam(result.rows).Elysium).toEqual({
      team: "Elysium",
      played: 10,
      wins: 8,
      draws: 1,
      losses: 1,
      points: 25,
      diff: "+18",
    });
    expect(rowsByTeam(result.rows)["Team Bravo"].diff).toBe("-3");
  });

  test("ignore la casse, les accents et les espaces des en-têtes", () => {
    const result = parseStandingsCsv("EQUIPE ; Joués ; Gagnés ; Nuls ; Perdus ; Points ; Différence\nA;10;6;2;2;20;+4");
    expect(result.headerDetected).toBe(true);
    expect(result.rows[0]).toMatchObject({ team: "A", played: 10, wins: 6, draws: 2, losses: 2, points: 20, diff: "+4" });
  });
});

describe("parseStandingsCsv — en-tête anglais", () => {
  test("« D » signifie nuls et « P » matchs joués en anglais", () => {
    const result = parseStandingsCsv("Team,P,W,D,L,Pts,GD\nAlpha,10,6,2,2,20,+5");
    expect(result.rows[0]).toEqual({
      team: "Alpha",
      played: 10,
      wins: 6,
      draws: 2,
      losses: 2,
      points: 20,
      diff: "+5",
    });
  });

  test("« D » signifie défaites en français quand N est présent", () => {
    const result = parseStandingsCsv("Equipe;J;V;N;D;Pts\nAlpha;10;6;2;2;20");
    expect(result.rows[0]).toMatchObject({ wins: 6, draws: 2, losses: 2 });
  });
});

describe("parseStandingsCsv — colonnes manquantes recalculées", () => {
  test("calcule J, Pts et +/- quand ils sont absents", () => {
    const result = parseStandingsCsv("Équipe;V;N;D;BP;BC\nAlpha;8;1;1;30;12");
    expect(result.rows[0]).toEqual({
      team: "Alpha",
      played: 10,
      wins: 8,
      draws: 1,
      losses: 1,
      points: 25,
      diff: "+18",
    });
    expect(result.computed).toEqual({ played: 1, points: 1, diff: 1 });
  });

  test("accepte les nombres signés, les virgules décimales et les espaces", () => {
    const result = parseStandingsCsv('Team;J;V;N;D;Pts;+/-\n"Alpha";1 0;6;2;2;20;+5');
    expect(result.rows[0]).toMatchObject({ played: 10, diff: "+5" });
  });
});

describe("parseStandingsCsv — en-tête absent", () => {
  test("utilise l’ordre Équipe, J, V, N, D, Pts, +/-", () => {
    const result = parseStandingsCsv("Elysium,10,8,1,1,25,+18\nBravo,10,5,1,4,16,-3");
    expect(result.headerDetected).toBe(false);
    expect(result.warnings).toContain("header-missing");
    expect(result.rows[0]).toMatchObject({ team: "Elysium", played: 10, points: 25, diff: "+18" });
    expect(result.rows[1]).toMatchObject({ team: "Bravo", points: 16, diff: "-3" });
  });

  test("une équipe nommée « Team » n'est pas prise pour un en-tête", () => {
    const result = parseStandingsCsv("Team,10,8,1,1,25,+18\nBravo,10,5,1,4,16,-3");
    expect(result.headerDetected).toBe(false);
    expect(result.rows.map((r) => r.team)).toEqual(["Team", "Bravo"]);
  });

  test("détecte une première colonne de rang", () => {
    const result = parseStandingsCsv("1,Elysium,10,8,1,1,25,+18\n2,Bravo,10,5,1,4,16,-3");
    expect(result.rows.map((r) => r.team)).toEqual(["Elysium", "Bravo"]);
    expect(result.rows[0]).toMatchObject({ played: 10, wins: 8, points: 25 });
  });

  test("inverse Pts et +/- si la dernière colonne correspond à 3×V+N", () => {
    const result = parseStandingsCsv("Elysium,10,8,1,1,+18,25");
    expect(result.rows[0]).toMatchObject({ points: 25, diff: "+18" });
  });
});

describe("parseStandingsCsv — robustesse", () => {
  test("ignore les lignes de titre, les totaux et les doublons", () => {
    const csv = [
      "Classement Poule A;;;;;;",
      "Équipe;J;V;N;D;Pts;+/-",
      "Elysium;10;8;1;1;25;+18",
      "Elysium;10;8;1;1;25;+18",
      ";;;;;;",
      "Total;;;;;25;",
      "Bravo;10;5;1;4;16;-3",
    ].join("\n");
    const result = parseStandingsCsv(csv);
    expect(result.rows.map((r) => r.team)).toEqual(["Elysium", "Bravo"]);
    expect(result.skippedRows).toBeGreaterThanOrEqual(3);
  });

  test("nettoie le BOM et accepte un fichier vide", () => {
    expect(parseStandingsCsv("\uFEFFÉquipe;J;V;N;D;Pts\nA;1;1;0;0;3").rows[0].team).toBe("A");
    expect(parseStandingsCsv("   ").errors).toEqual(["empty"]);
    expect(parseStandingsCsv("Équipe;J;V;N;D;Pts").errors).toEqual(["no-rows"]);
  });

  test("signale les colonnes inconnues sans bloquer l’import", () => {
    const result = parseStandingsCsv("Rang;Équipe;Logo;J;V;N;D;Pts;+/-;Forme\n1;Elysium;x.png;10;8;1;1;25;+18;VVNVD");
    expect(result.rows[0]).toMatchObject({ team: "Elysium", points: 25, diff: "+18" });
    expect(result.ignoredHeaders).toEqual(expect.arrayContaining(["Logo", "Forme"]));
  });

  test("plafonne à MAX_STANDINGS_ROWS équipes", () => {
    const teams = Array.from({ length: MAX_STANDINGS_ROWS + 5 }, (_, i) => `Team ${i};10;5;1;4;16;-3`);
    const result = parseStandingsCsv(["Équipe;J;V;N;D;Pts;+/-", ...teams].join("\n"));
    expect(result.rows).toHaveLength(MAX_STANDINGS_ROWS);
    expect(result.warnings).toContain("too-many-rows");
  });

  test("le modèle proposé est importable tel quel", () => {
    const result = parseStandingsCsv(STANDINGS_CSV_TEMPLATE);
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => r.team)).toEqual(["Elysium", "Team Alpha", "Team Bravo"]);
    expect(rowsByTeam(result.rows).Elysium).toMatchObject({ played: 10, wins: 8, draws: 1, losses: 1, points: 25 });
  });
});

describe("mergeStandingsRows", () => {
  const existing = [{ team: "Bravo", played: "10", wins: "5", draws: "1", losses: "4", points: "16", diff: "-3" }];
  const imported = [{ team: "Elysium", played: 10, wins: 8, draws: 1, losses: 1, points: 25, diff: "+18" }];

  test("remplace tout le classement", () => {
    expect(mergeStandingsRows(existing, imported, "replace").map((r) => r.team)).toEqual(["Elysium"]);
  });

  test("ajoute et met à jour sans perdre les équipes existantes", () => {
    const updated = [{ team: "bravo", played: 10, wins: 6, draws: 1, losses: 3, points: 19, diff: "+2" }];
    const merged = mergeStandingsRows(existing, updated, "append");
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ team: "bravo", points: 19 });
    expect(mergeStandingsRows(existing, imported, "append").map((r) => r.team)).toEqual(["Elysium", "Bravo"]);
  });

  test("le tri utilise les points puis la différence", () => {
    const sorted = sortStandingsRows([
      { team: "A", points: 20, diff: "+1" },
      { team: "B", points: 20, diff: "+9" },
      { team: "C", points: 25, diff: "-4" },
    ]);
    expect(sorted.map((r) => r.team)).toEqual(["C", "B", "A"]);
  });
});

describe("describeDelimiter", () => {
  test("retourne un libellé lisible", () => {
    expect(describeDelimiter(";")).toContain("Point-virgule");
    expect(describeDelimiter(",")).toContain("Virgule");
    expect(describeDelimiter("\t")).toBe("Tabulation");
  });
});
