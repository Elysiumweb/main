/**
 * Mise en page de la grille horaire du planning (vues semaine et jour).
 *
 * Deux problèmes rendaient les créneaux courts illisibles :
 *   1. la hauteur d'une heure était figée à 60 px : un événement de 15 minutes
 *      ne disposait que de 15 px, soit moins que la hauteur d'une ligne de texte ;
 *   2. deux événements au même moment étaient empilés exactement au même
 *      endroit (superposition totale).
 *
 * Ce module calcule, pour une journée :
 *   - `top` / `height` en pixels selon la hauteur d'heure choisie ;
 *   - un placement en colonnes pour les événements qui se chevauchent
 *     (comme Google Agenda), avec extension vers la droite quand la place
 *     est libre.
 *
 * Il est pur (aucun accès au DOM) pour rester testable simplement.
 */

/** Hauteurs d'une heure disponibles dans la barre d'outils (px). */
export const PLANNING_ZOOM_LEVELS = [
  { id: "compact", hourHeight: 96 },
  { id: "normal", hourHeight: 132 },
  { id: "large", hourHeight: 180 },
];

/** Niveau par défaut : « grand », pour que les créneaux de 15 min respirent. */
export const DEFAULT_PLANNING_ZOOM = "large";
export const MINUTES_PER_HOUR = 60;

export const getHourHeight = (zoomId) =>
  (PLANNING_ZOOM_LEVELS.find((level) => level.id === zoomId) || PLANNING_ZOOM_LEVELS[2]).hourHeight;

/** Hauteur minimale d'un bloc : de quoi afficher une ligne de texte lisible. */
export const getEventMinHeight = (hourHeight) => Math.max(28, Math.round(hourHeight * 0.2));

const DAY_MS = 24 * 3600 * 1000;

/** Minuit local de la date donnée (ms), pour compter les jours franchis. */
const startOfDay = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Minutes écoulées depuis minuit (heure locale). */
export const minutesOfDay = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * Place les événements d'une journée dans la grille horaire.
 *
 * @param {Array<{id:string,start:string|Date,end:string|Date}>} events
 * @param {{ startHour?: number, endHour?: number, hourHeight?: number, minHeight?: number }} options
 * @returns {Array<{
 *   id: string, event: object,
 *   top: number, height: number,
 *   columnIndex: number, columnCount: number,
 *   leftPercent: number, widthPercent: number,
 *   startMinutes: number, endMinutes: number,
 * }>}
 */
export const layoutDayEvents = (events, options = {}) => {
  const {
    startHour = 6,
    endHour = 24,
    hourHeight = 180,
    minHeight = getEventMinHeight(hourHeight),
  } = options;

  const gridStart = startHour * MINUTES_PER_HOUR;
  const gridEnd = endHour * MINUTES_PER_HOUR;
  if (!(gridEnd > gridStart) || !(hourHeight > 0)) return [];

  // Une durée plus courte que la hauteur minimale doit aussi réserver sa place
  // à l'écran : on raisonne sur une fin « visuelle » pour le chevauchement.
  const minSpanMinutes = (minHeight / hourHeight) * MINUTES_PER_HOUR;

  const items = [];
  (events || []).forEach((event) => {
    if (!event) return;
    const start = event.start instanceof Date ? event.start : new Date(event.start);
    const end = event.end instanceof Date ? event.end : new Date(event.end);
    if (isNaN(start.getTime())) return;

    let startMinutes = minutesOfDay(start);
    let endMinutes = isNaN(end.getTime()) ? null : minutesOfDay(end);

    // Événement qui franchit minuit (ex. 22h → 01h) : on ajoute les jours
    // complets écoulés avant de rogner à la fin de la grille.
    if (endMinutes !== null) {
      const dayDiff = Math.round((startOfDay(end) - startOfDay(start)) / DAY_MS);
      if (dayDiff > 0) endMinutes += dayDiff * 24 * MINUTES_PER_HOUR;
      // Fin avant le début (données incomplètes) : créneau par défaut de 15 min.
      if (endMinutes <= startMinutes) endMinutes = startMinutes + 15;
      if (endMinutes > gridEnd) endMinutes = gridEnd;
    } else {
      endMinutes = startMinutes + 15;
    }

    if (endMinutes <= gridStart) return; // totalement avant la grille
    if (startMinutes >= gridEnd) return; // totalement après la grille
    if (startMinutes < gridStart) startMinutes = gridStart; // entamé avant l'affichage

    endMinutes = Math.min(endMinutes, gridEnd);
    const visibleEnd = Math.max(endMinutes, startMinutes + minSpanMinutes);

    items.push({
      id: event.id,
      event,
      startMinutes,
      endMinutes,
      visualEnd: visibleEnd,
      top: ((startMinutes - gridStart) / MINUTES_PER_HOUR) * hourHeight,
      height: Math.max(minHeight, ((endMinutes - startMinutes) / MINUTES_PER_HOUR) * hourHeight),
    });
  });

  items.sort((a, b) => a.startMinutes - b.startMinutes
    || b.visualEnd - a.visualEnd
    || String(a.id).localeCompare(String(b.id)));

  // 1. Regroupement en « clusters » d'événements qui se chevauchent (transitivement).
  const clusters = [];
  let current = null;
  items.forEach((item) => {
    if (!current || item.startMinutes >= current.maxEnd) {
      current = { items: [item], maxEnd: item.visualEnd };
      clusters.push(current);
    } else {
      current.items.push(item);
      current.maxEnd = Math.max(current.maxEnd, item.visualEnd);
    }
  });

  // 2. Colonnes : chaque événement prend la première colonne libre.
  const result = [];
  clusters.forEach((cluster) => {
    const columns = []; // columns[i] = dernier visualEnd de la colonne i
    cluster.items.forEach((item) => {
      let col = columns.findIndex((lastEnd) => lastEnd <= item.startMinutes);
      if (col === -1) {
        columns.push(item.visualEnd);
        col = columns.length - 1;
      } else {
        columns[col] = item.visualEnd;
      }
      item.columnIndex = col;
    });

    const columnCount = columns.length;

    // 3. Extension vers la droite quand les colonnes suivantes sont libres
    //    pendant toute la durée de l'événement.
    cluster.items.forEach((item) => {
      let lastCol = item.columnIndex;
      for (let c = item.columnIndex + 1; c < columnCount; c += 1) {
        const blocked = cluster.items.some((other) => other !== item
          && other.columnIndex === c
          && other.startMinutes < item.visualEnd
          && other.visualEnd > item.startMinutes);
        if (blocked) break;
        lastCol = c;
      }
      const span = lastCol - item.columnIndex + 1;
      result.push({
        ...item,
        columnCount,
        columnIndex: item.columnIndex,
        leftPercent: (item.columnIndex / columnCount) * 100,
        widthPercent: (span / columnCount) * 100,
      });
    });
  });

  return result.sort((a, b) => a.startMinutes - b.startMinutes || a.columnIndex - b.columnIndex);
};

/**
 * Convertit un clic dans une cellule horaire en heure + minutes arrondies au
 * quart d'heure. Permet de créer un créneau de 15 min directement.
 *
 * @param {number} offsetY position du curseur dans la cellule (px)
 * @param {number} hourHeight hauteur d'une heure (px)
 * @param {number} hour heure de la cellule
 * @param {number} stepMinutes pas d'arrondi (15 par défaut)
 */
export const slotFromPointer = (offsetY, hourHeight, hour, stepMinutes = 15) => {
  const ratio = hourHeight > 0 ? Number(offsetY) / hourHeight : 0;
  const raw = Math.max(0, Math.min(MINUTES_PER_HOUR, ratio * MINUTES_PER_HOUR));
  const stepped = Math.min(
    MINUTES_PER_HOUR - stepMinutes,
    Math.max(0, Math.floor(raw / stepMinutes) * stepMinutes)
  );
  return { hour, minute: Number.isFinite(stepped) ? stepped : 0 };
};

/** Libellé « 21:00 – 21:15 ». */
export const formatSlotRange = (start, end) => {
  const pad = (n) => String(n).padStart(2, "0");
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  if (isNaN(s.getTime())) return "";
  const startLabel = `${pad(s.getHours())}:${pad(s.getMinutes())}`;
  if (isNaN(e.getTime())) return startLabel;
  return `${startLabel} – ${pad(e.getHours())}:${pad(e.getMinutes())}`;
};
