/**
 * Utilitaires calendrier partagés : génération ICS + lien Google Agenda.
 *
 * Réutilisé par le calendrier communautaire (public) et par le planning joueur
 * (espace privé) afin d'offrir un mécanisme unique « ajouter à mon agenda ».
 *
 * Un « event » accepté ici peut avoir :
 *   - soit `start` / `end` (ISO string, planning joueur)
 *   - soit `date` (ISO string, calendrier communautaire) — la fin est alors
 *     calculée à +2h par défaut.
 *
 * IMPORTANT — fuseaux horaires :
 *   - Les événements du planning (start/end ISO) sont exprimés en UTC.
 *     toICSDateUTC() est utilisé pour les écrire en format ICS UTC (suffixe Z).
 *   - Les événements communautaires (date ISO sans fuseau) sont exprimés en
 *     heure locale du visiteur. toICSDateLocal() écrit en heure locale sans Z
 *     pour que Google/Apple/Outlook n'appliquent PAS de décalage UTC.
 *     Une event à "2026-03-15T20:00" reste à 20h heure locale du visiteur,
 *     et n'est pas décalée à 20h UTC (ce que ferait toISOString()).
 */

/** Formate une Date en chaîne ICS UTC (suffixe Z). Pour le planning (start/end ISO). */
export const toICSDateUTC = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

/**
 * Formate une Date en chaîne ICS heure locale (sans Z) pour événements communautaires.
 * Les composants sont extraits via les getters locaux (getHours, getMinutes…)
 * afin d'éviter le décalage introduit par toISOString() qui convertit toujours
 * en UTC. Le résultat est YYYYMMDDTHHmmss sans suffixe Z ni TZID,
 * ce qui signifie « heure locale de l'appareil » dans le spec iCalendar.
 */
export const toICSDateLocal = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/** Formate une Date en chaîne ICS date-only (sans heure) pour événements toute la journée. */
export const toICSDateOnly = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
};

/** Extrait un objet Date de début depuis n'importe quelle forme d'événement. */
export const getEventStart = (ev) => {
  if (ev.start) {
    const d = new Date(ev.start);
    if (!isNaN(d.getTime())) return d;
  }
  if (ev.date) {
    const d = new Date(ev.date);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
};

/** Extrait un objet Date de fin (tombe sur début + durée par défaut). */
export const getEventEnd = (ev, defaultDurationMs = 2 * 3600 * 1000) => {
  if (ev.end) {
    const d = new Date(ev.end);
    if (!isNaN(d.getTime())) return d;
  }
  const start = getEventStart(ev);
  return start ? new Date(start.getTime() + defaultDurationMs) : null;
};

/**
 * Détermine si l'événement est exprimé en heure locale (à écrire sans Z dans l'ICS).
 *  - Événements communautaires (champ `date` sans `start`) → heure locale.
 *  - Événements avec fuseau horaire explicite (`timezone`) → heure locale.
 *  - Planning (start/end ISO sans timezone) → UTC.
 */
export const isLocalEvent = (ev) => {
  if (ev.timezone) return true;
  if (ev.date && !ev.start) return true;
  return false;
};

const sanitizeIcs = (s) => String(s || "").replace(/[\r\n;]/g, " ");

/**
 * Construit le blob ICS (VCALENDAR) pour une liste d'événements.
 * Retourne une chaîne au format iCal prête à écrire dans un fichier .ics.
 */
export const buildICS = (events, { calendarName = "Elysium" } = {}) => {
  const rows = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Elysium//FR`,
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${sanitizeIcs(calendarName)}`,
  ];
  (events || []).forEach((ev, i) => {
    const start = getEventStart(ev);
    const end = getEventEnd(ev);
    if (!start || !end) return; // date invalide : on ignore l'événement
    const allDay = !!ev.allDay;
    const local = isLocalEvent(ev);
    const fmt = (d) =>
      allDay ? toICSDateOnly(d) : local ? toICSDateLocal(d) : toICSDateUTC(d);
    rows.push(
      "BEGIN:VEVENT",
      `UID:${ev.id || `ev${i}`}@elysium`,
      `DTSTAMP:${toICSDateUTC(new Date())}`,
      allDay
        ? `DTSTART;VALUE=DATE:${fmt(start)}`
        : `DTSTART:${fmt(start)}`,
      allDay
        ? `DTEND;VALUE=DATE:${fmt(end)}`
        : `DTEND:${fmt(end)}`,
      `SUMMARY:${sanitizeIcs(ev.title)}`,
      `DESCRIPTION:${sanitizeIcs(ev.description || ev.competition || "")}`,
      ev.location ? `LOCATION:${sanitizeIcs(ev.location)}` : "",
      ev.link ? `URL:${sanitizeIcs(ev.link)}` : "",
      "END:VEVENT"
    );
  });
  rows.push("END:VCALENDAR");
  return rows.filter(Boolean).join("\r\n");
};

/** Déclenche le téléchargement navigateur d'un fichier .ics pour ces événements. */
export const downloadICS = (events, filename = "elysium.ics", opts) => {
  const ics = buildICS(events, opts);
  const blob = new Blob([ics], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};

/**
 * URL Google Agenda « ajouter cet événement » pour un événement.
 * Utilise la même logique local/UTC que buildICS pour éviter les décalages.
 */
export const gcalUrl = (ev) => {
  const start = getEventStart(ev);
  const end = getEventEnd(ev);
  if (!start || !end) return "#";
  const local = isLocalEvent(ev);
  const fmt = (d) => (local ? toICSDateLocal(d) : toICSDateUTC(d));
  const details = [ev.description || ev.competition || "", ev.link || ""].filter(Boolean).join("\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title || "",
    dates: `${fmt(start)}/${fmt(end)}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};
