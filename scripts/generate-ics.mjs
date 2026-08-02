/**
 * Génère public/matches.ics — le flux iCal global des matchs officiels.
 *
 * Les visiteurs s'abonnent à ce fichier statique (Google Agenda, Apple
 * Calendar, Outlook...) depuis la page /calendrier. Il doit être régénéré
 * avant chaque déploiement :
 *
 *   npm run ics
 *
 * (ou via la CI). Le script lit la collection Firestore `matches` via l'API
 * REST publique (les règles de sécurité doivent autoriser la lecture) avec la
 * clé web du projet — aucune donnée privée n'est exposée.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "public", "matches.ics");

const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";
const apiKey = process.env.REACT_APP_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "";

const toICSDate = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
const esc = (s) =>
  String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/[\r\n]/g, " ");

const teamName = (m) => {
  const roster = typeof m.roster === "string" ? m.roster.trim() : "";
  return roster ? `Elysium ${roster}` : "Elysium";
};

const matchSummary = (m) => {
  const base = `${teamName(m)} vs ${m.opponentName || "Adversaire"}`;
  if (m.status === "finished" && m.scoreUs !== undefined && m.scoreUs !== null && m.scoreUs !== "") {
    return `${base} (${m.scoreUs}-${m.scoreThem})`;
  }
  if (m.status === "live") return `🔴 ${base} — EN DIRECT`;
  return base;
};

async function fetchMatches() {
  if (!projectId || !apiKey) {
    console.warn("[ics] REACT_APP_FIREBASE_PROJECT_ID / REACT_APP_FIREBASE_API_KEY manquants — calendrier vide généré.");
    return [];
  }
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/matches?pageSize=1000&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[ics] Réponse Firestore ${res.status} — calendrier vide généré.`);
    return [];
  }
  const data = await res.json();
  return (data.documents || [])
    .map((doc) => {
      const fields = doc.fields || {};
      const get = (k) => {
        const f = fields[k];
        if (!f) return undefined;
        if (f.stringValue !== undefined) return f.stringValue;
        if (f.integerValue !== undefined) return Number(f.integerValue);
        if (f.doubleValue !== undefined) return Number(f.doubleValue);
        if (f.timestampValue) return f.timestampValue;
        return undefined;
      };
      return {
        id: doc.name.split("/").pop(),
        opponentName: get("opponentName"),
        competition: get("competition"),
        date: get("date"),
        time: get("time"),
        timezone: get("timezone"),
        platform: get("platform"),
        watchUrl: get("watchUrl"),
        vodUrl: get("vodUrl"),
        scoreUs: get("scoreUs"),
        scoreThem: get("scoreThem"),
        roster: get("roster"),
        status: get("status"),
      };
    })
    .filter((m) => m.date);
}

const buildICS = (matches) => {
  const rows = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Elysium//Matchs officiels//FR",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Elysium — Matchs officiels",
    "X-WR-TIMEZONE:Europe/Paris",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    ...matches
      .sort((a, b) => `${a.date}T${a.time || "00:00"}`.localeCompare(`${b.date}T${b.time || "00:00"}`))
      .flatMap((m) => {
        const base = `${m.date}T${m.time ? m.time.slice(0, 5) : "20:00"}:00`;
        const start = new Date(base);
        if (isNaN(start.getTime())) return [];
        const end = new Date(start.getTime() + 2 * 3600 * 1000);
        const allDay = !m.time;
        return [
          "BEGIN:VEVENT",
          `UID:${m.id}@elysium`,
          `DTSTAMP:${toICSDate(new Date())}`,
          allDay ? `DTSTART;VALUE=DATE:${m.date.replace(/-/g, "")}` : `DTSTART:${toICSDate(start)}`,
          allDay ? `DTEND;VALUE=DATE:${new Date(start.getTime() + 86400000).toISOString().slice(0, 10).replace(/-/g, "")}` : `DTEND:${toICSDate(end)}`,
          `SUMMARY:${esc(matchSummary(m))}`,
          `DESCRIPTION:${esc(m.competition ? `Compétition : ${m.competition}` : "Match officiel Elysium")}`,
          m.platform ? `LOCATION:${esc(m.platform)}` : "",
          m.watchUrl || m.vodUrl ? `URL:${esc(m.watchUrl || m.vodUrl)}` : "",
          m.status === "cancelled" ? "STATUS:CANCELLED" : "",
          "END:VEVENT",
        ];
      }),
    "END:VCALENDAR",
  ];
  return rows.filter(Boolean).join("\r\n") + "\r\n";
};

try {
  const matches = await fetchMatches();
  const ics = buildICS(matches);
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, ics, "utf8");
  console.log(`[ics] ${matches.length} match(s) écrits dans public/matches.ics`);
} catch (err) {
  console.error("[ics] Erreur :", err);
  process.exit(1);
}
