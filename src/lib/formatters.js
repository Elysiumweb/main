/**
 * Formateur de date unifié pour les matchs et événements.
 * Formate une date ISO (ex: "2026-08-02") ou un objet match en format lisible :
 * "samedi 2 août" (FR) ou "Saturday, August 2" (EN), avec l'heure éventuelle.
 */
export const fmtMatchDate = (matchOrDate, lang = "fr", timeOverride = "") => {
  if (!matchOrDate) return "";
  let dateStr = "";
  let timeStr = "";

  if (typeof matchOrDate === "object") {
    dateStr = matchOrDate.date || "";
    timeStr = matchOrDate.time || "";
  } else {
    dateStr = String(matchOrDate);
    timeStr = timeOverride || "";
  }

  if (!dateStr) return "";

  const timePart = timeStr ? (timeStr.length === 5 ? `${timeStr}:00` : timeStr) : "12:00:00";
  const d = new Date(`${dateStr}T${timePart}`);

  if (isNaN(d.getTime())) {
    return `${dateStr}${timeStr ? ` · ${timeStr}` : ""}`;
  }

  const locale = lang === "en" ? "en-US" : "fr-FR";
  const formatted = d.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return `${formatted}${timeStr ? ` · ${timeStr}` : ""}`;
};

/**
 * Formateur de date courte (ex: "2 août 2026" / "August 2, 2026")
 */
export const fmtDate = (d, lang = "fr", options = {}) => {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : (d?.toDate ? d.toDate() : d);
  if (!dt || isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  });
};
