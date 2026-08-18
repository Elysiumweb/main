import { GAMES } from "./constants";

/**
 * Helpers match enrichi – F-01
 * - format BOx, manches/maps, VOD, bracket, report
 */
export const parseMaps = (maps) => {
  if (!Array.isArray(maps)) return [];
  return maps
    .map((m) => ({
      name: String(m.name || m.map || m.carte || "").trim(),
      scoreUs: m.scoreUs ?? m.us ?? "",
      scoreThem: m.scoreThem ?? m.them ?? "",
      map: String(m.map || "").trim(),
      mode: String(m.mode || "").trim(),
    }))
    .filter((m) => m.name || m.map || m.scoreUs !== "" || m.scoreThem !== "");
};

export const formatLabel = (format) => {
  if (!format) return "";
  const f = String(format).toUpperCase();
  if (["BO1", "BO3", "BO5", "BO7"].includes(f)) return f;
  return f;
};

export const matchStatusLabel = (status, t) => {
  const key = `results.status.${status}`;
  const translated = t ? t(key) : "";
  if (translated && translated !== key) return translated;
  const map = {
    upcoming: "À venir",
    live: "En direct",
    finished: "Terminé",
    postponed: "Reporté",
    cancelled: "Annulé",
  };
  return map[status] || status;
};

export const matchStatusClass = (status) => {
  switch (status) {
    case "live":
      return "border-red-400/60 text-red-300 bg-red-500/10";
    case "upcoming":
      return "border-sky-300/40 text-sky-300 bg-sky-300/10";
    case "postponed":
      return "border-amber-300/40 text-amber-300 bg-amber-300/10";
    case "cancelled":
      return "border-white/20 text-[#f7f7f7]/40 bg-white/5 line-through";
    default:
      return "border-white/20 text-[#f7f7f7]/60 bg-white/5";
  }
};

export const computeSeriesStats = (maps) => {
  const list = parseMaps(maps);
  let wins = 0;
  let losses = 0;
  list.forEach((m) => {
    const us = Number(m.scoreUs);
    const them = Number(m.scoreThem);
    if (!isNaN(us) && !isNaN(them) && m.scoreUs !== "" && m.scoreThem !== "") {
      if (us > them) wins += 1;
      else if (them > us) losses += 1;
    }
  });
  return { total: list.length, wins, losses, draws: list.length - wins - losses };
};

export const getCompetitionId = (match) => match?.competitionId || match?.competitionDocId || "";

export const getVodUrl = (match) => match?.vodUrl || match?.replayUrl || "";

export const getBracketUrl = (match) => match?.bracketUrl || "";

export const getReportArticleId = (match) => match?.reportArticleId || match?.articleId || "";
