/**
 * Utilitaires calendrier partagés : génération ICS + lien Google Agenda.
 *
 * Réutilisé par le calendrier communautaire (public) et par le planning joueur
 * (espace privé) afin d'offrir un mécanisme unique « ajouter à mon agenda ».
 *
 * Un « event »_calendar» accepté ici peut avoir :
 *   - soit `start` / `end` (ISO string, planning joueur)
 *   - soit `date` (ISO string, calendrier communautaire) — la fin est alors
 *     calculée à +2h par défaut.
 */

export const toICSDate = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

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
    rows.push(
      "BEGIN:VEVENT",
      `UID:${ev.id || `ev${i}`}@elysium`,
      `DTSTAMP:${toICSDate(new Date())}`,
      allDay
        ? `DTSTART;VALUE=DATE:${start.toISOString().slice(0, 10).replace(/-/g, "")}`
        : `DTSTART:${toICSDate(start)}`,
      allDay
        ? `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, "")}`
        : `DTEND:${toICSDate(end)}`,
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

/** Construit l'URL d'abonnement ICS dynamique avec filtres (jeu/roster/type) */
export const buildICSSubscribeUrl = (filters = {}) => {
  const base = `${typeof window !== "undefined" ? window.location.origin : "https://elysium-esport.fr"}/api/calendar.ics`;
  const params = new URLSearchParams();
  if (filters.game && filters.game !== "all") params.set("game", filters.game);
  if (filters.roster && filters.roster !== "all") params.set("roster", filters.roster);
  if (filters.type && filters.type !== "all") params.set("type", filters.type);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
};

/** Convertit un match en entrée calendrier normalisée (pour ICS / vue mois) */
export const matchToCalendarEvent = (m) => {
  const roster = m.roster ? `Elysium ${m.roster}` : "Elysium";
  const title = `${roster} vs ${m.opponentName || "Adversaire"}${m.status === "finished" ? ` (${m.scoreUs}-${m.scoreThem})` : ""}${m.status === "postponed" ? " — Reporté" : m.status === "cancelled" ? " — Annulé" : ""}`;
  const dateStr = m.date ? `${m.date}T${m.time || "20:00"}` : "";
  return {
    id: `match-${m.id}`,
    title,
    date: dateStr,
    description: `${m.competition || ""} ${m.format || ""} ${m.game || ""}`.trim(),
    link: m.watchUrl || m.vodUrl || "",
    type: "tournament",
    game: m.game,
    roster: m.roster,
    status: m.status,
    raw: m,
  };
};

/** URL Google Agenda « ajouter cet événement » pour un événement. */
export const gcalUrl = (ev) => {
  const start = getEventStart(ev);
  const end = getEventEnd(ev);
  if (!start || !end) return "#";
  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const details = [ev.description || ev.competition || "", ev.link || ""].filter(Boolean).join("\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title || "",
    dates: `${fmt(start)}/${fmt(end)}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};
