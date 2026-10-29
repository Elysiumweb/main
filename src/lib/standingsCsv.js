/**
 * Import CSV du classement détaillé d'une compétition (Admin › Compétitions).
 *
 * Objectif : récupérer le classement officiel d'une ligue (Excel, Google
 * Sheets, export de la fédération…) sans ressaisir chaque équipe.
 *
 * Colonnes reconnues (français et anglais, en-tête facultatif) :
 *   Équipe / Team, J / PJ / MP / Played, V / W / Wins, N / D / Draws,
 *   D / L / Losses, Pts / Points, +/- / Diff / GD, BP/GF, BC/GA, #/Position.
 *
 * Le parseur est volontairement tolérant :
 *  - séparateur détecté automatiquement (`,` `;` tabulation ou `|`) ;
 *  - accents, majuscules, espaces et BOM ignorés ;
 *  - guillemets CSV (y compris `""` échappé) et fins de ligne CRLF ;
 *  - colonnes manquantes recalculées (J = V+N+D, Pts = 3×V+N, +/- = BP−BC) ;
 *  - lignes vides, titres et doublons ignorés ;
 *  - en-tête absent : ordre positionnel documenté utilisé.
 *
 * Aucune dépendance externe : tout est calculé côté client.
 */

/** Nombre maximum d'équipes acceptées dans un classement. */
export const MAX_STANDINGS_ROWS = 200;
/** Taille maximum (octets) acceptée pour un fichier CSV. */
export const MAX_CSV_BYTES = 1024 * 1024;
/** Longueur maximum (caractères) acceptée pour un contenu CSV. */
export const MAX_CSV_TEXT_LENGTH = 200_000;

/** Modèle CSV proposé au téléchargement dans l'admin. */
export const STANDINGS_CSV_TEMPLATE = [
  "Équipe;J;V;N;D;Pts;+/-",
  "Elysium;10;8;1;1;25;+18",
  "Team Alpha;10;6;2;2;20;+9",
  "Team Bravo;10;5;1;4;16;-3",
].join("\n");

/** Champs du classement, dans l'ordre d'affichage public. */
export const STANDING_FIELDS = ["team", "played", "wins", "draws", "losses", "points", "diff"];

/**
 * En-têtes reconnus, déjà normalisés (minuscules, sans accents ni espaces).
 * « d » et « p » sont volontairement absents : ambigus entre FR et EN, ils sont
 * résolus après coup par `mapHeaderRow` selon les autres colonnes.
 */
const HEADER_ALIASES = {
  position: ["#", "no", "pos", "position", "rang", "rank", "place", "classement", "cl"],
  team: [
    "equipe", "equipes", "team", "teams", "teamname", "nomequipe", "nomdelequipe",
    "club", "clubs", "squad", "roster", "nom", "name", "formation", "lineup", "ecurie",
  ],
  played: [
    "j", "pj", "mj", "mp", "played", "plays", "games", "game", "gp", "matchs",
    "matchsjoues", "joues", "jouees", "parties", "rencontres",
  ],
  wins: ["v", "w", "win", "wins", "victoire", "victoires", "gagne", "gagnes", "gagnee", "gagnees", "won"],
  draws: ["n", "t", "e", "draw", "draws", "tie", "ties", "nul", "nuls", "egalite", "egalites"],
  losses: ["l", "loss", "losses", "defaite", "defaites", "perdu", "perdus", "perdue", "perdues", "lost"],
  points: ["pts", "pt", "points", "point", "score", "total", "scoretotal"],
  diff: [
    "+/-", "+-", "+/−", "diff", "difference", "gd", "db", "goaldiff", "goaldifference",
    "goalavg", "plusmoins", "pm", "ecart", "ecartdebuts", "differencebuts", "diffbuts",
  ],
  goalsFor: ["bp", "gf", "butspour", "butpour", "pour", "pf", "goalsfor", "mpour", "marques"],
  goalsAgainst: ["bc", "ga", "butscontre", "contre", "pc", "goalsagainst", "mcontre", "encaisses"],
};

/** Alias ambigus : résolus après les autres colonnes. */
const AMBIGUOUS_ALIASES = {
  d: ["draws", "losses"],
  p: ["played", "points"],
};

/** Ligne d'en-tête reconnue mais non exploitable (ex. « Logo »). */
const normalizeHeader = (value) =>
  String(value ?? "")
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9+\-/]/g, "");

/** Convertit une valeur numérique tolérante : "12", " 12 ", "+5", "−3", "12,5". */
const toNumber = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/\s|\u00a0/g, "")
    .replace(/[−–—]/g, "-")
    .replace(",", ".");
  if (!/^[+-]?\d+(\.\d+)?$/.test(cleaned)) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
};

const isNumericCell = (value) => toNumber(value) !== null;

const signedDiff = (value) => {
  const num = toNumber(value);
  if (num === null) return "";
  return num > 0 ? `+${num}` : String(num);
};

const diffValue = (value) => {
  const num = toNumber(value);
  return num === null ? 0 : num;
};

/**
 * Découpe un CSV en lignes de cellules.
 * Gère les guillemets, les `""` échappés et les fins de ligne CRLF/CR/LF.
 */
export const parseCsvMatrix = (text, delimiter) => {
  const src = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];
    if (quoted) {
      if (char === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === delimiter) { row.push(cell); cell = ""; continue; }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell);
  rows.push(row);
  return rows.map((cells) => cells.map((value) => value.trim()));
};

/**
 * Détecte le séparateur le plus probable en comparant les occurrences hors
 * guillemets sur la première ligne non vide.
 */
export const detectCsvDelimiter = (text) => {
  const firstLine = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .find((line) => line.trim() !== "") || "";
  const candidates = [";", ",", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  candidates.forEach((delimiter) => {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < firstLine.length; i += 1) {
      const char = firstLine[i];
      if (char === '"') quoted = !quoted;
      else if (char === delimiter && !quoted) count += 1;
    }
    if (count > bestCount) { best = delimiter; bestCount = count; }
  });
  return best;
};

/** Classe un en-tête brut en champ(s) possible(s). */
const classifyHeader = (rawHeader) => {
  const raw = String(rawHeader ?? "").trim();
  const normalized = normalizeHeader(raw);
  if (!normalized) return [];
  if (/[°]/.test(raw)) return ["position"];
  if (normalized === "+/-" || normalized === "+-" || normalized === "+/−") return ["diff"];
  if (AMBIGUOUS_ALIASES[normalized]) return AMBIGUOUS_ALIASES[normalized];
  const fields = [];
  Object.entries(HEADER_ALIASES).forEach(([field, aliases]) => {
    if (aliases.includes(normalized)) fields.push(field);
  });
  return fields;
};

/**
 * Construit la correspondance colonne → champ à partir d'une ligne d'en-tête.
 * Retourne `null` si aucun nom d'équipe n'est identifiable.
 */
const mapHeaderRow = (cells) => {
  const singles = [];
  const ambiguous = [];
  const ignoredHeaders = [];
  const normalizedSet = new Set(cells.map(normalizeHeader).filter(Boolean));

  cells.forEach((cell, index) => {
    const candidates = classifyHeader(cell);
    if (candidates.length === 1) singles.push({ index, field: candidates[0], header: cell });
    else if (candidates.length > 1) ambiguous.push({ index, candidates, header: cell });
    else if (String(cell ?? "").trim()) ignoredHeaders.push(String(cell).trim());
  });

  const mapping = {};
  const labels = {};
  const claim = (field, index, header) => {
    if (mapping[field] !== undefined) return false;
    mapping[field] = index;
    labels[field] = String(header ?? "").trim();
    return true;
  };

  singles.forEach(({ field, index, header }) => { claim(field, index, header); });

  ambiguous.forEach(({ index, candidates, header }) => {
    const free = candidates.filter((field) => mapping[field] === undefined);
    const normalized = normalizeHeader(header);
    if (!free.length) { ignoredHeaders.push(String(header ?? "").trim()); return; }
    let field = free[0];
    if (free.length > 1) {
      if (normalized === "d") {
        // FR : « J V N D » → D = défaites. EN : « W D L » → D = nuls.
        field = normalizedSet.has("n") || normalizedSet.has("l") ? "losses" : "draws";
      } else if (normalized === "p") {
        // EN : « P W D L » → P = matchs joués. FR : « J V N D P » → P = points.
        field = normalizedSet.has("w") || normalizedSet.has("l") ? "played" : "points";
      }
    }
    if (!free.includes(field)) field = free[0];
    claim(field, index, header);
  });

  if (mapping.team === undefined) return null;
  // Une colonne « position » n'est pas stockée : le rang est l'ordre du tableau.
  delete mapping.position;
  delete labels.position;
  return { mapping, labels, ignoredHeaders };
};

const headerFieldCount = (cells) =>
  cells.reduce((acc, cell) => acc + (classifyHeader(cell).length > 0 ? 1 : 0), 0);

const hasTeamHeader = (cells) =>
  cells.some((cell) => {
    const candidates = classifyHeader(cell);
    return candidates.length === 1 && candidates[0] === "team";
  });

/**
 * Une ligne ressemble à un en-tête si plusieurs colonnes sont reconnues.
 * Sur un tableau large on exige 3 colonnes (Équipe + 2 stats) pour éviter qu'une
 * équipe nommée « Team » ne soit prise pour un en-tête.
 */
const looksLikeHeader = (cells) => {
  const threshold = cells.length >= 4 ? 3 : 2;
  return headerFieldCount(cells) >= threshold && hasTeamHeader(cells);
};

/** Correspondance par défaut quand le fichier n'a pas d'en-tête. */
const positionalMapping = (cells) => {
  const length = cells.length;
  // « Équipe, J, V, N, D, Pts, +/- » (ordre documenté dans l'admin)
  if (length >= 8) {
    return {
      mapping: { team: 1, played: 2, wins: 3, draws: 4, losses: 5, points: 6, diff: 7 },
      labels: {},
    };
  }
  if (length === 7) {
    return {
      mapping: { team: 0, played: 1, wins: 2, draws: 3, losses: 4, points: 5, diff: 6 },
      labels: {},
    };
  }
  return { mapping: { team: 0, played: 1, wins: 2, draws: 3, losses: 4, points: 5 }, labels: {} };
};

const isHeaderLikeRow = (cells, labels) => {
  if (headerFieldCount(cells) < 2) return false;
  const labelValues = Object.values(labels || {}).map(normalizeHeader).filter(Boolean);
  return cells.some((cell) => labelValues.includes(normalizeHeader(cell)));
};

/** Ignore les lignes de séparation et les totaux, fréquents dans les exports. */
const isNoiseRow = (cells) => {
  const values = cells.map((cell) => String(cell ?? "").trim()).filter(Boolean);
  if (!values.length) return true;
  if (values.every((value) => /^[-–—_.* ]*$/.test(value))) return true;
  const first = normalizeHeader(values[0]);
  return values.length < 3 && ["total", "totaux", "classement", "standings", "points"].includes(first);
};

const readCell = (cells, index) => (index === undefined ? "" : cells[index] ?? "");

/**
 * Sans en-tête, les deux dernières colonnes (Pts et +/-) peuvent arriver dans un
 * ordre inversé selon la source. On repère la colonne qui correspond à 3×V+N :
 * si c'est la dernière, les deux colonnes sont échangées pour tout le tableau.
 */
const fixSwappedPointsAndDiff = (rows) => {
  let pointsMatches = 0;
  let diffMatches = 0;
  rows.forEach((row) => {
    const expected = row.wins * 3 + row.draws;
    if (!expected) return;
    if (row.points === expected) pointsMatches += 1;
    if (diffValue(row.diff) === expected) diffMatches += 1;
  });
  if (diffMatches > pointsMatches) {
    rows.forEach((row) => {
      const previousPoints = row.points;
      row.points = diffValue(row.diff);
      row.diff = signedDiff(previousPoints);
    });
  }
};

/**
 * Parse un contenu CSV et retourne les lignes de classement normalisées.
 *
 * @returns {{
 *   rows: Array<{team: string, played: number, wins: number, draws: number,
 *                losses: number, points: number, diff: string}>,
 *   headerDetected: boolean,
 *   delimiter: string,
 *   usedColumns: Array<{field: string, header: string}>,
 *   ignoredHeaders: string[],
 *   computed: {played: number, points: number, diff: number},
 *   skippedRows: number,
 *   warnings: string[],
 *   errors: string[],
 * }}
 */
export const parseStandingsCsv = (text) => {
  const result = {
    rows: [],
    headerDetected: false,
    delimiter: ",",
    usedColumns: [],
    ignoredHeaders: [],
    computed: { played: 0, points: 0, diff: 0 },
    skippedRows: 0,
    warnings: [],
    errors: [],
  };

  const source = String(text ?? "").replace(/^\uFEFF/, "");
  if (!source.trim()) {
    result.errors.push("empty");
    return result;
  }
  if (source.length > MAX_CSV_TEXT_LENGTH) {
    result.errors.push("too-large");
    return result;
  }

  result.delimiter = detectCsvDelimiter(source);
  const matrix = parseCsvMatrix(source, result.delimiter)
    .filter((cells) => cells.some((cell) => String(cell ?? "").trim() !== ""));
  if (!matrix.length) {
    result.errors.push("empty");
    return result;
  }

  // L'en-tête peut être précédé d'un titre (« Classement Poule A »).
  const searchLimit = Math.min(matrix.length, 10);
  let headerIndex = -1;
  for (let i = 0; i < searchLimit; i += 1) {
    if (looksLikeHeader(matrix[i])) { headerIndex = i; break; }
  }

  let mapping;
  let labels = {};
  let dataRows;
  if (headerIndex >= 0) {
    const header = mapHeaderRow(matrix[headerIndex]);
    if (header) {
      result.headerDetected = true;
      mapping = header.mapping;
      labels = header.labels;
      result.ignoredHeaders = header.ignoredHeaders;
      result.skippedRows += headerIndex;
      dataRows = matrix.slice(headerIndex + 1);
    }
  }
  if (!mapping) {
    const positional = positionalMapping(matrix[0]);
    mapping = positional.mapping;
    labels = positional.labels;
    dataRows = matrix;
    result.warnings.push("header-missing");
  }

  result.usedColumns = Object.entries(mapping)
    .sort((a, b) => a[1] - b[1])
    .map(([field, index]) => ({ field, header: labels[field] || "" }));

  const seen = new Set();

  dataRows.forEach((cells) => {
    if (isNoiseRow(cells)) { result.skippedRows += 1; return; }
    if (isHeaderLikeRow(cells, labels)) { result.skippedRows += 1; return; }

    let team = String(readCell(cells, mapping.team) ?? "").trim();
    let rowMapping = mapping;

    // En-tête absent : première colonne numérique = rang, l'équipe est en 2e.
    if (!result.headerDetected && mapping.team === 0 && isNumericCell(team) && cells[1] && !isNumericCell(cells[1])) {
      rowMapping = { ...mapping, team: 1 };
      team = String(cells[1] ?? "").trim();
    }

    if (!team || isNumericCell(team)) { result.skippedRows += 1; return; }
    const key = normalizeHeader(team);
    if (!key || seen.has(key)) { result.skippedRows += 1; return; }

    const wins = toNumber(readCell(cells, rowMapping.wins)) ?? 0;
    const draws = toNumber(readCell(cells, rowMapping.draws)) ?? 0;
    const losses = toNumber(readCell(cells, rowMapping.losses)) ?? 0;

    const playedRaw = toNumber(readCell(cells, rowMapping.played));
    let played = playedRaw;
    if (played === null) {
      played = wins + draws + losses;
      if (played > 0) result.computed.played += 1;
    }

    const pointsRaw = toNumber(readCell(cells, rowMapping.points));
    let points = pointsRaw;
    if (points === null) {
      points = wins * 3 + draws;
      result.computed.points += 1;
    }

    let diff = "";
    if (rowMapping.diff !== undefined) diff = signedDiff(readCell(cells, rowMapping.diff));
    if (!diff && rowMapping.goalsFor !== undefined && rowMapping.goalsAgainst !== undefined) {
      const forGoals = toNumber(readCell(cells, rowMapping.goalsFor));
      const againstGoals = toNumber(readCell(cells, rowMapping.goalsAgainst));
      if (forGoals !== null && againstGoals !== null) {
        diff = signedDiff(forGoals - againstGoals);
        result.computed.diff += 1;
      }
    }

    const playedFromResults = wins + draws + losses;
    if (played < playedFromResults) played = playedFromResults;

    seen.add(key);
    result.rows.push({ team, played, wins, draws, losses, points, diff });
  });

  if (!result.headerDetected && result.rows.length) fixSwappedPointsAndDiff(result.rows);

  result.rows.sort(
    (a, b) => b.points - a.points || diffValue(b.diff) - diffValue(a.diff) || a.team.localeCompare(b.team),
  );

  if (result.rows.length > MAX_STANDINGS_ROWS) {
    result.rows = result.rows.slice(0, MAX_STANDINGS_ROWS);
    result.warnings.push("too-many-rows");
  }
  if (!result.rows.length) result.errors.push("no-rows");

  return result;
};

const normalizeTeamKey = (team) => normalizeHeader(team);

/** Normalise une ligne existante du formulaire vers le format de classement. */
export const normalizeStandingRow = (row) => ({
  team: String(row?.team ?? "").trim(),
  played: toNumber(row?.played) ?? 0,
  wins: toNumber(row?.wins) ?? 0,
  draws: toNumber(row?.draws) ?? 0,
  losses: toNumber(row?.losses) ?? 0,
  points: toNumber(row?.points) ?? 0,
  diff: signedDiff(row?.diff),
});

/** Tri officiel : points décroissants, puis différence, puis nom d'équipe. */
export const sortStandingsRows = (rows) =>
  [...(Array.isArray(rows) ? rows : [])].sort(
    (a, b) => (Number(b.points) || 0) - (Number(a.points) || 0)
      || diffValue(b.diff) - diffValue(a.diff)
      || String(a.team).localeCompare(String(b.team)),
  );

/**
 * Fusionne le classement existant et les lignes importées.
 *  - mode "replace" : le CSV remplace intégralement le classement ;
 *  - mode "append"  : les équipes déjà présentes sont mises à jour, les autres
 *    sont ajoutées.
 */
export const mergeStandingsRows = (existing, imported, mode = "replace") => {
  const incoming = (Array.isArray(imported) ? imported : [])
    .map(normalizeStandingRow)
    .filter((row) => row.team);
  if (mode !== "append") return sortStandingsRows(incoming);

  const byKey = new Map();
  (Array.isArray(existing) ? existing : []).forEach((row) => {
    const normalized = normalizeStandingRow(row);
    if (!normalized.team) return;
    byKey.set(normalizeTeamKey(normalized.team), normalized);
  });
  incoming.forEach((row) => byKey.set(normalizeTeamKey(row.team), row));
  return sortStandingsRows([...byKey.values()]);
};

/** Libellé lisible du séparateur détecté. */
export const describeDelimiter = (delimiter) => {
  if (delimiter === "\t") return "Tabulation";
  if (delimiter === ";") return "Point-virgule (;)";
  if (delimiter === "|") return "Barre verticale (|)";
  return "Virgule (,)";
};
