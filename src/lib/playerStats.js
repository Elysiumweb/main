const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Statistiques joueur officielles Elysium.
 *
 * L'ordre est celui utilisé partout (admin, fiches joueur, classement) :
 * but, passe décisive, arrêt, tir, score, MVP.
 * Les fichiers .replay fournissent exactement ces valeurs.
 */
export const PLAYER_STAT_KEYS = ["goals", "assists", "saves", "shots", "score", "mvp"];

export const PLAYER_STAT_LABELS = {
  goals: "Buts",
  assists: "Passes décisives",
  saves: "Arrêts",
  shots: "Tirs",
  score: "Score",
  mvp: "MVP",
};

/** Libellés compacts pour les tableaux et champs de saisie. */
export const PLAYER_STAT_LABELS_SHORT = {
  goals: "Buts",
  assists: "Passes",
  saves: "Arrêts",
  shots: "Tirs",
  score: "Score",
  mvp: "MVP",
};

/** Abréviations pour les puces et lignes de stats condensées. */
export const PLAYER_STAT_ABBR = {
  goals: "B",
  assists: "PD",
  saves: "Arr",
  shots: "T",
  score: "Pts",
  mvp: "MVP",
};

/**
 * Valeur d'une statistique portée par une entrée joueur (match, replay…).
 * Compatibilité : les anciens documents stockaient `points` au lieu de `score`.
 */
export const playerStatValue = (entry, key) => {
  if (!entry) return 0;
  if (key === "score") return number(entry.score ?? entry.points);
  return number(entry[key]);
};

/** Ligne condensée : « 2 B · 1 PD · 3 Arr · 5 T · 450 Pts ». */
export const formatStatLine = (entry, keys = PLAYER_STAT_KEYS.filter((key) => key !== "mvp")) => keys
  .map((key) => `${playerStatValue(entry, key)} ${PLAYER_STAT_ABBR[key] || key}`)
  .join(" · ");

/**
 * Nombre de MVP porté par une entrée : booléen pour un replay (une game),
 * compteur pour un match (série) — 1 si vrai, 0 sinon.
 */
export const mvpCount = (value) => {
  if (value === true) return 1;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/** Vrai si l'entrée porte au moins une statistique chiffrée (ou un MVP). */
export const hasPlayerStats = (entry) => !!entry && (
  PLAYER_STAT_KEYS.some((key) => playerStatValue(entry, key) !== 0)
  || mvpCount(entry.mvp) > 0
);

export const matchResult = (match) => {
  const us = number(match?.scoreUs);
  const them = number(match?.scoreThem);
  if (us > them) return "W";
  if (us < them) return "L";
  return "D";
};

export const playerMatches = (matches = [], player) => (matches || []).filter((match) =>
  (match.players || []).some((entry) =>
    (player?.id && entry.playerId === player.id)
    || (player?.pseudo && entry.pseudo?.toLowerCase() === player.pseudo.toLowerCase())
  )
);

/** L'entrée du joueur dans un match (par identifiant, sinon par pseudo). */
export const matchPlayerEntry = (match, player) => (match?.players || []).find((entry) =>
  (player?.id && entry.playerId === player.id)
  || (player?.pseudo && entry.pseudo?.toLowerCase() === player.pseudo.toLowerCase())
) || null;

const isMvpOfMatch = (match, player, entry) => {
  const mvp = match?.mvp;
  if (!mvp) return false;
  const candidates = [player?.id, player?.pseudo, entry?.playerId, entry?.pseudo, entry?.name].filter(Boolean).map(String);
  return candidates.some((candidate) => candidate === String(mvp));
};

export const aggregatePlayer = (matches = [], player) => {
  const playedMatches = playerMatches(matches, player).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const summary = playedMatches.reduce((acc, match) => {
    const result = matchResult(match);
    const entry = matchPlayerEntry(match, player) || {};
    acc.played += 1;
    if (result === "W") acc.wins += 1;
    if (result === "L") acc.losses += 1;
    if (result === "D") acc.draws += 1;
    if (isMvpOfMatch(match, player, entry)) acc.mvp += 1;
    acc.goals += playerStatValue(entry, "goals");
    acc.assists += playerStatValue(entry, "assists");
    acc.saves += playerStatValue(entry, "saves");
    acc.shots += playerStatValue(entry, "shots");
    acc.score += playerStatValue(entry, "score");
    return acc;
  }, { played: 0, wins: 0, losses: 0, draws: 0, mvp: 0, goals: 0, assists: 0, saves: 0, shots: 0, score: 0 });

  const perMatch = (value) => (summary.played ? Number((value / summary.played).toFixed(2)) : 0);
  summary.winRate = summary.played ? Number(((summary.wins / summary.played) * 100).toFixed(1)) : 0;
  summary.goalsPerMatch = perMatch(summary.goals);
  summary.assistsPerMatch = perMatch(summary.assists);
  summary.savesPerMatch = perMatch(summary.saves);
  summary.shotsPerMatch = perMatch(summary.shots);
  summary.scorePerMatch = summary.played ? Number((summary.score / summary.played).toFixed(1)) : 0;
  /** Part des matchs joués où le joueur a été MVP (%). */
  summary.mvpRate = summary.played ? Number(((summary.mvp / summary.played) * 100).toFixed(1)) : 0;
  /** Réussite au tir (%) : buts / tirs. */
  summary.shotAccuracy = summary.shots ? Number(((summary.goals / summary.shots) * 100).toFixed(1)) : 0;
  /** Détail match par match (du plus récent au plus ancien). */
  summary.matches = playedMatches.map((match) => {
    const entry = matchPlayerEntry(match, player) || {};
    return {
      id: match.id,
      date: match.date,
      opponentName: match.opponentName,
      competition: match.competition || "",
      result: matchResult(match),
      mvp: isMvpOfMatch(match, player, entry),
      goals: playerStatValue(entry, "goals"),
      assists: playerStatValue(entry, "assists"),
      saves: playerStatValue(entry, "saves"),
      shots: playerStatValue(entry, "shots"),
      score: playerStatValue(entry, "score"),
    };
  });
  summary.recent = summary.matches.slice(0, 5);
  return summary;
};

export const aggregatePlayers = (matches = [], roster = []) => (roster || [])
  .filter((player) => player.status !== "staff")
  .map((player) => ({ ...player, stats: aggregatePlayer(matches, player) }))
  .filter((player) => player.stats.played > 0)
  .sort((a, b) => b.stats.mvp - a.stats.mvp || b.stats.score - a.stats.score || b.stats.winRate - a.stats.winRate || b.stats.played - a.stats.played);

/**
 * Valeurs normalisées (0-100) pour le radar de comparaison : les six
 * statistiques officielles, ramenées à une échelle lisible.
 */
export const radarValues = (player) => {
  const stats = player?.stats || {};
  return {
    goals: Math.min(100, number(stats.goalsPerMatch) * 25),
    assists: Math.min(100, number(stats.assistsPerMatch) * 25),
    saves: Math.min(100, number(stats.savesPerMatch) * 25),
    shots: Math.min(100, number(stats.shotsPerMatch) * 12.5),
    score: Math.min(100, number(stats.scorePerMatch) / 10),
    mvp: Math.min(100, number(stats.mvpRate)),
  };
};

export const normalizeCareer = (career, previousTeams = "") => {
  if (Array.isArray(career) && career.length) {
    return career.map((item) => ({
      club: item.club || "",
      role: item.role || "",
      period: item.period || "",
      achievements: item.achievements || item.palmares || "",
    })).filter((item) => item.club || item.role || item.period || item.achievements);
  }
  return String(previousTeams || "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [club = "", period = "", role = "", achievements = ""] = line.split("|").map((value) => value.trim());
    return { club, role, period, achievements };
  });
};
