/**
 * Export CSV minimaliste, sans dépendance.
 * ----------------------------------------------------------------------------
 * Utilisé par l'admin (boîte de réception support/candidatures, audit).
 * Deux garde-fous importants :
 *  - échappement RFC 4180 (guillemets doublés, cellules multi-lignes) ;
 *  - neutralisation des formules (une cellule commençant par = + - @ est
 *    préfixée par une apostrophe pour éviter l'injection dans Excel).
 */

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export const escapeCsvCell = (value) => {
  if (value === null || value === undefined) return "";
  let text = typeof value === "string" ? value : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  if (/[",\n\r;]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
};

/**
 * @param {Array<object>} rows
 * @param {Array<{key: string, label: string, value?: (row: object) => any}>} columns
 */
export const toCsv = (rows = [], columns = []) => {
  const head = columns.map((c) => escapeCsvCell(c.label)).join(",");
  const lines = rows.map((row) =>
    columns
      .map((c) => escapeCsvCell(c.value ? c.value(row) : row[c.key]))
      .join(","),
  );
  return [head, ...lines].join("\r\n");
};

/** Nom de fichier sûr et horodaté : `support-candidatures-2026-11-08.csv`. */
export const csvFileName = (prefix, date = new Date()) => {
  const stamp = date.toISOString().slice(0, 10);
  return `${prefix}-${stamp}.csv`;
};

export const downloadCsv = (filename, content) => {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Libère la mémoire après le téléchargement.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
