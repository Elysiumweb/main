/**
 * Import de planning au format iCalendar (.ics).
 *
 * Utilisé par les managers depuis la page Planning : ils déposent un fichier
 * .ics exporté d'un autre agenda (Google, Outlook, FFR, Discord...) et le
 * planning est créé automatiquement sur le roster de leur choix.
 *
 * Le module est volontairement sans dépendance (pas de lib externe) et pur :
 *   parseICS(text)        -> { events, skipped, calendarName, hasRecurrence }
 *   expandICS(events, …)  -> occurrences datées dans une fenêtre
 *
 * Formats gérés :
 *   - DATE (`20260215`), DATE-TIME UTC (`…Z`), DATE-TIME flottant,
 *     DATE-TIME avec TZID (fuseau réel, DST incluse) ;
 *   - lignes pliées (folding RFC 5545), échappements `\\n`, `\\,`, `\\;` ;
 *   - VTIMEZONE / VALARM ignorés, événements ANNULÉS ignorés ;
 *   - RRULE DAILY / WEEKLY (BYDAY) / MONTHLY / YEARLY, INTERVAL, COUNT, UNTIL,
 *     EXDATE, RDATE et RECURRENCE-ID (occurrence déplacée) ;
 *   - DURATION (à défaut de DTEND).
 *
 * Tout ce qui n'est pas compris est compté dans `skipped` plutôt que de
 * planter l'import : un fichier exotique ne doit jamais bloquer le manager.
 */

export const MAX_IMPORT_EVENTS = 300;
export const DEFAULT_IMPORT_HORIZON_DAYS = 180;
/** Garde-fou : nombre max d'occurrences générées par événement récurrent. */
const MAX_OCCURRENCES_PER_EVENT = 2000;

const DAY_MS = 24 * 3600 * 1000;
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]; // index = Date#getDay()

/** Clé d'unicité utilisée pour repérer un événement déjà présent en base. */
export const eventSignature = (title, startIso) =>
  `${String(title || "").trim().toLowerCase()}|${String(startIso || "").slice(0, 16)}`;

// ---------------------------------------------------------------------------
// Lecture du fichier
// ---------------------------------------------------------------------------

/** Déplie les lignes (RFC 5545 §3.1) et normalise les fins de ligne. */
const unfold = (text) => String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "");

/**
 * Découpe `NAME;PARAM=VALUE:VALUE`.
 * Les deux-points ne sont cherchés que hors guillemets (une valeur peut en
 * contenir, jamais un nom de propriété).
 */
const splitProperty = (line) => {
  let inQuotes = false;
  let idx = -1;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ":" && !inQuotes) { idx = i; break; }
  }
  if (idx === -1) return null;
  const head = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const chunks = head.split(";");
  const name = (chunks.shift() || "").trim().toUpperCase();
  if (!name) return null;
  const params = {};
  chunks.forEach((chunk) => {
    const eq = chunk.indexOf("=");
    if (eq === -1) return;
    const key = chunk.slice(0, eq).trim().toUpperCase();
    const raw = chunk.slice(eq + 1).trim().replace(/^"|"$/g, "");
    params[key] = raw;
  });
  return { name, params, value };
};

const unescapeText = (value) => String(value || "")
  .replace(/\\[nN]/g, "\n")
  .replace(/\\,/g, ",")
  .replace(/\\;/g, ";")
  .replace(/\\\\/g, "\\")
  .trim();

// ---------------------------------------------------------------------------
// Dates (UTC / flottant / TZID)
// ---------------------------------------------------------------------------

const tzCache = new Map();
const isValidTimeZone = (timeZone) => {
  if (!timeZone) return false;
  if (tzCache.has(timeZone)) return tzCache.get(timeZone);
  let ok = false;
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat("en-US", { timeZone });
    ok = true;
  } catch (e) { ok = false; }
  tzCache.set(timeZone, ok);
  return ok;
};

/** Décalage (ms) du fuseau `timeZone` pour l'instant donné. */
const zoneOffsetMs = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
  );
  return asUtc - date.getTime();
};

/**
 * Convertit une heure « murale » (celle écrite dans le fichier) en Date réelle
 * dans le fuseau demandé. Deux passes pour rester juste autour des
 * changements d'heure. Fuseau inconnu / absent => heure locale du navigateur.
 */
const wallTimeToDate = (year, month, day, hour, minute, sec, timeZone) => {
  if (!isValidTimeZone(timeZone)) return new Date(year, month - 1, day, hour, minute, sec);
  const guess = Date.UTC(year, month - 1, day, hour, minute, sec);
  const first = guess - zoneOffsetMs(new Date(guess), timeZone);
  const adjusted = guess - zoneOffsetMs(new Date(first), timeZone);
  return new Date(adjusted);
};

/**
 * Décode une valeur DATE / DATE-TIME ICS.
 * @returns {{ date: Date, allDay: boolean } | null}
 */
export const parseICSDate = (value, params = {}) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/i);
  if (!match) return null;
  const [, ys, mos, ds, hs, mis, ss, zulu] = match;
  const year = Number(ys);
  const month = Number(mos);
  const day = Number(ds);
  if (!year || !month || !day || month > 12 || day > 31) return null;
  const hasTime = hs !== undefined && hs !== null;
  const declaredDate = String(params.VALUE || "").toUpperCase() === "DATE";
  if (!hasTime || declaredDate) {
    return { date: new Date(year, month - 1, day, 0, 0, 0, 0), allDay: true };
  }
  const hour = Number(hs);
  const minute = Number(mis || 0);
  const second = Number(ss || 0);
  if (zulu) return { date: new Date(Date.UTC(year, month - 1, day, hour, minute, second)), allDay: false };
  return { date: wallTimeToDate(year, month, day, hour, minute, second, params.TZID), allDay: false };
};

/** Durée ISO 8601 simplifiée (`PT1H30M`, `P1D`, `P2W`). */
export const parseDuration = (value) => {
  const match = String(value || "").trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match) return null;
  const [, sign, weeks, days, hours, minutes, seconds] = match;
  if (!weeks && !days && !hours && !minutes && !seconds) return null;
  const ms = (
    Number(weeks || 0) * 7 * DAY_MS
    + Number(days || 0) * DAY_MS
    + Number(hours || 0) * 3600 * 1000
    + Number(minutes || 0) * 60 * 1000
    + Number(seconds || 0) * 1000
  );
  return sign === "-" ? -ms : ms;
};

// ---------------------------------------------------------------------------
// Récurrence
// ---------------------------------------------------------------------------

export const parseRRule = (value) => {
  const rule = {
    freq: null, interval: 1, count: null, until: null, untilDayOnly: false,
    byDay: [], byMonthDay: [], unsupported: false,
  };
  String(value || "").split(";").forEach((chunk) => {
    if (!chunk) return;
    const [rawKey, rawValue = ""] = chunk.split("=");
    const key = rawKey.trim().toUpperCase();
    const val = rawValue.trim();
    if (key === "FREQ") rule.freq = val.toUpperCase();
    else if (key === "INTERVAL") rule.interval = Math.max(1, Number(val) || 1);
    else if (key === "COUNT") rule.count = Math.max(0, Number(val) || 0);
    else if (key === "UNTIL") {
      const parsed = parseICSDate(val, {});
      if (parsed) {
        rule.until = parsed.date;
        rule.untilDayOnly = parsed.allDay;
      }
    } else if (key === "BYDAY") {
      rule.byDay = val.split(",").map((d) => d.trim().toUpperCase()).filter(Boolean);
    } else if (key === "BYMONTHDAY") {
      rule.byMonthDay = val.split(",").map((d) => Number(d)).filter((n) => Number.isFinite(n) && n !== 0);
    } else if (["BYSETPOS", "BYWEEKNO", "BYYEARDAY", "BYHOUR", "BYMINUTE"].includes(key)) {
      // Combinaisons non gérées : on importera au moins la première occurrence.
      rule.unsupported = true;
    }
  });
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(rule.freq)) rule.unsupported = true;
  if (rule.freq === "MONTHLY" && rule.byDay.some((d) => /^[+-]?\d/.test(d))) rule.unsupported = true;
  if (rule.freq === "YEARLY" && (rule.byDay.length > 0 || rule.byMonthDay.length > 0)) rule.unsupported = true;
  return rule;
};

const dayOffsetFromMonday = (code) => {
  const idx = WEEKDAYS.indexOf(String(code || "").slice(-2).toUpperCase());
  return idx === -1 ? null : (idx + 6) % 7; // 0 = lundi … 6 = dimanche
};

const startedOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Développe un événement (potentiellement récurrent) en occurrences réelles.
 * @returns {{ occurrences: Array<{start:string,end:string,allDay:boolean}>, truncated:boolean, approximate:boolean }}
 */
export const expandEvent = (event, options = {}) => {
  const {
    from = new Date(),
    to = new Date(Date.now() + DEFAULT_IMPORT_HORIZON_DAYS * DAY_MS),
    max = MAX_IMPORT_EVENTS,
  } = options;

  const empty = { occurrences: [], truncated: false, approximate: false };
  const startDate = new Date(event?.start);
  if (!event || isNaN(startDate.getTime())) return empty;

  const endDate = new Date(event.end);
  const fallbackDuration = event.allDay ? DAY_MS : 3600 * 1000;
  const durationMs = !isNaN(endDate.getTime()) && endDate > startDate
    ? endDate.getTime() - startDate.getTime()
    : fallbackDuration;

  const fromMs = from ? new Date(from).getTime() : -Infinity;
  const toMs = to ? new Date(to).getTime() : startDate.getTime() + DEFAULT_IMPORT_HORIZON_DAYS * DAY_MS;
  const excluded = new Set(
    [...(event.excluded || []), ...(event.exdates || [])]
      .map((value) => new Date(value).getTime())
      .filter((ms) => !isNaN(ms))
  );

  const occurrences = [];
  let truncated = false;
  let approximate = false;

  const push = (date) => {
    const ms = new Date(date).getTime();
    if (isNaN(ms)) return false;
    if (excluded.has(ms)) return false;
    // Un événement qui chevauche la fenêtre reste visible.
    if (ms + durationMs < fromMs || ms > toMs) return false;
    if (occurrences.length >= max) { truncated = true; return false; }
    occurrences.push({
      start: new Date(ms).toISOString(),
      end: new Date(ms + durationMs).toISOString(),
      allDay: !!event.allDay,
    });
    return true;
  };

  const rule = event.rrule || null;
  if (!rule || rule.unsupported) {
    // Pas de règle exploitable : la première occurrence reste importable.
    if (rule?.unsupported) approximate = true;
    push(startDate);
    (event.rdates || []).slice(0, max).forEach((iso) => push(iso));
    return { occurrences, truncated, approximate };
  }

  const interval = Math.max(1, Number(rule.interval) || 1);
  const count = Number.isFinite(rule.count) ? rule.count : null;
  const untilMs = rule.until
    ? new Date(rule.until).getTime() + (rule.untilDayOnly ? DAY_MS - 1 : 0)
    : Infinity;
  const timeOfDay = {
    h: startDate.getHours(), m: startDate.getMinutes(), s: startDate.getSeconds(), ms: startDate.getMilliseconds(),
  };
  const atTime = (year, month, day) => {
    const d = new Date(year, month, day, timeOfDay.h, timeOfDay.m, timeOfDay.s, timeOfDay.ms);
    return d;
  };

  let emitted = 0; // occurrences valides depuis DTSTART (pour COUNT)
  const seen = new Set();
  const accept = (date) => {
    const ms = new Date(date).getTime();
    if (isNaN(ms)) return false;
    if (seen.has(ms)) return true;
    if (count !== null && emitted >= count) return false;
    if (ms > untilMs) return false;
    if (ms < startDate.getTime()) return false; // avant DTSTART : jamais une occurrence
    seen.add(ms);
    emitted += 1;
    push(date);
    return true;
  };
  const stop = () => (count !== null && emitted >= count) || truncated;

  // RFC 5545 : DTSTART fait toujours partie de l'ensemble récurrent, même si
  // BYDAY / BYMONTHDAY ne le mentionne pas.
  accept(startDate);

  if (rule.freq === "DAILY") {
    for (let i = 0; i < MAX_OCCURRENCES_PER_EVENT && !stop(); i += 1) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i * interval);
      if (d.getTime() > Math.min(toMs, untilMs)) break;
      accept(d);
    }
  } else if (rule.freq === "WEEKLY") {
    const offsets = (rule.byDay.length ? rule.byDay : [WEEKDAYS[startDate.getDay()]])
      .map(dayOffsetFromMonday)
      .filter((n) => n !== null)
      .sort((a, b) => a - b);
    const monday = startedOfDay(startDate);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    for (let week = 0; week < MAX_OCCURRENCES_PER_EVENT && !stop(); week += 1) {
      const weekMonday = new Date(monday);
      weekMonday.setDate(weekMonday.getDate() + week * interval * 7);
      if (weekMonday.getTime() > Math.min(toMs, untilMs) + 7 * DAY_MS) break;
      for (let i = 0; i < offsets.length && !stop(); i += 1) {
        const candidate = atTime(weekMonday.getFullYear(), weekMonday.getMonth(), weekMonday.getDate() + offsets[i]);
        if (candidate.getTime() > untilMs) break;
        accept(candidate);
      }
    }
  } else if (rule.freq === "MONTHLY") {
    const dayOfMonth = rule.byMonthDay.length ? Math.abs(rule.byMonthDay[0]) : startDate.getDate();
    for (let i = 0; i < MAX_OCCURRENCES_PER_EVENT && !stop(); i += 1) {
      const base = new Date(startDate.getFullYear(), startDate.getMonth() + i * interval, 1);
      if (base.getTime() > Math.min(toMs, untilMs)) break;
      const candidate = atTime(base.getFullYear(), base.getMonth(), dayOfMonth);
      // 31 février -> le mois est sauté, il ne doit pas décaler les suivants.
      if (candidate.getMonth() === base.getMonth()) accept(candidate);
    }
  } else if (rule.freq === "YEARLY") {
    const dayOfMonth = rule.byMonthDay.length ? Math.abs(rule.byMonthDay[0]) : startDate.getDate();
    for (let i = 0; i < MAX_OCCURRENCES_PER_EVENT && !stop(); i += 1) {
      const year = startDate.getFullYear() + i * interval;
      const candidate = atTime(year, startDate.getMonth(), dayOfMonth);
      if (candidate.getTime() > Math.min(toMs, untilMs)) break;
      if (candidate.getMonth() === startDate.getMonth()) accept(candidate);
    }
  }

  // Les RDATE ajoutent des occurrences ponctuelles à la série.
  (event.rdates || []).forEach((iso) => push(iso));

  return { occurrences, truncated, approximate };
};

// ---------------------------------------------------------------------------
// Parsing du fichier
// ---------------------------------------------------------------------------

const emptyComponent = () => ({
  uid: "", title: "", description: "", location: "", url: "",
  status: "", start: null, end: null, durationMs: null,
  rrule: null, exdates: [], rdates: [], recurrenceId: null,
});

const finalize = (current, sink) => {
  if (!current) return;
  const status = String(current.status || "").toUpperCase();
  if (status === "CANCELLED") { sink.counts.cancelled += 1; return; }
  if (!current.start) { sink.counts.invalid += 1; return; }

  const startDate = current.start.date;
  let endDate = current.end?.date || null;
  if (!endDate && current.durationMs !== null) {
    endDate = new Date(startDate.getTime() + current.durationMs);
  }
  if (!endDate) {
    endDate = new Date(startDate.getTime() + (current.start.allDay ? DAY_MS : 3600 * 1000));
  }
  if (endDate <= startDate) endDate = new Date(startDate.getTime() + 3600 * 1000);

  sink.events.push({
    uid: current.uid || "",
    title: current.title,
    description: current.description,
    location: current.location,
    url: current.url,
    allDay: !!current.start.allDay,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    rrule: current.rrule,
    exdates: current.exdates.map((d) => d.toISOString()),
    rdates: current.rdates.map((d) => d.toISOString()),
    recurrenceId: current.recurrenceId ? current.recurrenceId.toISOString() : null,
  });
};

/**
 * Lit un contenu iCalendar.
 * @returns {{
 *   events: Array<object>, calendarName: string,
 *   counts: { total:number, cancelled:number, invalid:number, recurring:number },
 *   error: string|null
 * }}
 */
export const parseICS = (text) => {
  const result = {
    events: [],
    calendarName: "",
    counts: { total: 0, cancelled: 0, invalid: 0, recurring: 0 },
    error: null,
  };
  if (typeof text !== "string" || text.trim() === "") {
    result.error = "empty";
    return result;
  }
  if (!/BEGIN:VCALENDAR|BEGIN:VEVENT/i.test(text)) {
    result.error = "not-ics";
    return result;
  }

  const lines = unfold(text).split("\n");
  let current = null;
  let inEvent = false;
  let skipDepth = 0; // VTIMEZONE / VALARM : propriétés ignorées

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    const prop = splitProperty(line);
    if (!prop) return;

    if (prop.name === "BEGIN") {
      const component = prop.value.trim().toUpperCase();
      if (component === "VEVENT" && skipDepth === 0) {
        current = emptyComponent();
        inEvent = true;
      } else if (component === "VTIMEZONE" || component === "VALARM" || component === "VTODO" || component === "VJOURNAL") {
        skipDepth += 1;
      }
      return;
    }

    if (prop.name === "END") {
      const component = prop.value.trim().toUpperCase();
      if (component === "VEVENT" && inEvent) {
        finalize(current, result);
        current = null;
        inEvent = false;
      } else if (["VTIMEZONE", "VALARM", "VTODO", "VJOURNAL"].includes(component) && skipDepth > 0) {
        skipDepth -= 1;
      }
      return;
    }

    // Propriété de calendrier (hors VEVENT) : nom de l'agenda importé.
    if (prop.name === "X-WR-CALNAME" && skipDepth === 0 && !result.calendarName) {
      result.calendarName = unescapeText(prop.value);
      return;
    }

    if (skipDepth > 0 || !inEvent || !current) return;

    switch (prop.name) {
      case "SUMMARY":
        current.title = unescapeText(prop.value);
        break;
      case "DESCRIPTION":
        current.description = unescapeText(prop.value);
        break;
      case "LOCATION":
        current.location = unescapeText(prop.value);
        break;
      case "URL":
        current.url = String(prop.value || "").trim();
        break;
      case "UID":
        current.uid = String(prop.value || "").trim();
        break;
      case "STATUS":
        current.status = String(prop.value || "").trim();
        break;
      case "DTSTART":
        current.start = parseICSDate(prop.value, prop.params);
        break;
      case "DTEND":
        current.end = parseICSDate(prop.value, prop.params);
        break;
      case "DURATION":
        current.durationMs = parseDuration(prop.value);
        break;
      case "RECURRENCE-ID":
        current.recurrenceId = parseICSDate(prop.value, prop.params)?.date || null;
        break;
      case "RRULE":
        current.rrule = parseRRule(prop.value);
        break;
      case "EXDATE":
        prop.value.split(",").forEach((value) => {
          const parsed = parseICSDate(value, prop.params);
          if (parsed) current.exdates.push(parsed.date);
        });
        break;
      case "RDATE":
        prop.value.split(",").forEach((value) => {
          const parsed = parseICSDate(value, prop.params);
          if (parsed) current.rdates.push(parsed.date);
        });
        break;
      default:
        break;
    }
  });

  // Occurrences déplacées (RECURRENCE-ID) : la série de base ne doit plus
  // générer l'occurrence remplacée, sinon l'événement apparaîtrait deux fois.
  const overridesByUid = new Map();
  result.events.forEach((event) => {
    if (!event.uid || !event.recurrenceId) return;
    const list = overridesByUid.get(event.uid) || [];
    list.push(event.recurrenceId);
    overridesByUid.set(event.uid, list);
  });
  result.events.forEach((event) => {
    if (!event.uid || event.recurrenceId) return;
    const overrides = overridesByUid.get(event.uid);
    if (overrides) event.exdates = [...event.exdates, ...overrides];
    // L'occurrence déplacée elle-même se comporte comme un événement simple.
  });

  result.counts.total = result.events.length;
  result.counts.recurring = result.events.filter((event) => event.rrule && !event.rrule.unsupported).length;
  return result;
};

/**
 * Développe tous les événements sur une fenêtre et renvoie des occurrences
 * prêtes à être écrites dans Firestore.
 *
 * @returns {{ occurrences: Array<object>, truncated: boolean, approximate: boolean }}
 */
export const expandICS = (events, {
  from = new Date(),
  to = new Date(Date.now() + DEFAULT_IMPORT_HORIZON_DAYS * DAY_MS),
  max = MAX_IMPORT_EVENTS,
} = {}) => {
  const occurrences = [];
  let truncated = false;
  let approximate = false;
  (events || []).forEach((event) => {
    if (occurrences.length >= max) { truncated = true; return; }
    const remaining = max - occurrences.length;
    const expanded = expandEvent(event, { from, to, max: remaining });
    if (expanded.truncated) truncated = true;
    if (expanded.approximate) approximate = true;
    expanded.occurrences.forEach((occurrence) => {
      occurrences.push({
        uid: event.uid,
        title: event.title,
        description: event.description,
        location: event.location,
        url: event.url,
        allDay: occurrence.allDay,
        start: occurrence.start,
        end: occurrence.end,
      });
    });
  });
  occurrences.sort((a, b) => new Date(a.start) - new Date(b.start));
  return { occurrences, truncated, approximate };
};

/** Vrai si le fichier dépasse la taille raisonnable pour un calendrier. */
export const isIcsFileTooLarge = (file, maxBytes = 2 * 1024 * 1024) =>
  !!file && typeof file.size === "number" && file.size > maxBytes;

/** Lit un File/Blob en texte (FileReader en secours des vieux navigateurs). */
export const readFileAsText = (file) => {
  if (!file) return Promise.reject(new Error("no-file"));
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read-error"));
    reader.readAsText(file);
  });
};
