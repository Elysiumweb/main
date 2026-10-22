/**
 * Export CSV (RFC 4180)
 * ============================================================================
 * Utilisé par la boîte de réception admin (candidatures, tickets), les
 * sélections multiples et la newsletter. Aucune dépendance externe : le
 * fichier est généré côté navigateur puis téléchargé.
 */

const CELL_BREAKER = /["\n\r;,]/;

export const escapeCsvCell = (value) => {
  if (value === null || value === undefined) return "";
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (CELL_BREAKER.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
};

/**
 * @param {object[]} rows
 * @param {{key: string, label: string, get?: (row: object) => any}[]} [columns]
 * @returns {string}
 */
export const toCsv = (rows = [], columns = null) => {
  const list = Array.isArray(rows) ? rows : [];
  const cols = columns && columns.length
    ? columns
    : [...new Set(list.flatMap((row) => Object.keys(row || {})))].map((key) => ({ key, label: key }));
  const header = cols.map((col) => escapeCsvCell(col.label ?? col.key)).join(",");
  const body = list.map((row) =>
    cols.map((col) => escapeCsvCell(col.get ? col.get(row) : row?.[col.key])).join(","),
  );
  return [header, ...body].join("\r\n");
};

export const csvFilename = (base, date = new Date()) => {
  const stamp = date.toISOString().slice(0, 10);
  return `${base}-${stamp}.csv`;
};

/** Télécharge un CSV dans le navigateur (no-op en environnement de test). */
export const downloadCsv = (filename, rows, columns) => {
  const csv = toCsv(rows, columns);
  if (typeof document === "undefined" || typeof URL === "undefined") return csv;
  // BOM UTF-8 : Excel ouvre correctement les accents.
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return csv;
};
