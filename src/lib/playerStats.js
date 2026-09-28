const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

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

export const aggregatePlayer = (matches = [], player) => {
  const playedMatches = playerMatches(matches, player).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const summary = playedMatches.reduce((acc, match) => {
    const result = matchResult(match);
    const entry = (match.players || []).find((item) =>
      (player?.id && item.playerId === player.id)
      || (player?.pseudo && item.pseudo?.toLowerCase() === player.pseudo.toLowerCase())
    ) || {};
    acc.played += 1;
    if (result === "W") acc.wins += 1;
    if (result === "L") acc.losses += 1;
    if (result === "D") acc.draws += 1;
    if (match.mvp && (match.mvp === player?.id || match.mvp === player?.pseudo || match.mvp === entry.playerId || match.mvp === entry.pseudo)) acc.mvp += 1;
    acc.goals += number(entry.goals);
    acc.points += number(entry.points);
    acc.assists += number(entry.assists);
    return acc;
  }, { played: 0, wins: 0, losses: 0, draws: 0, mvp: 0, goals: 0, points: 0, assists: 0 });

  summary.winRate = summary.played ? Number(((summary.wins / summary.played) * 100).toFixed(1)) : 0;
  summary.pointsPerMatch = summary.played ? Number((summary.points / summary.played).toFixed(1)) : 0;
  summary.goalsPerMatch = summary.played ? Number((summary.goals / summary.played).toFixed(2)) : 0;
  summary.recent = playedMatches.slice(0, 5).map((match) => {
    const entry = (match.players || []).find((item) => item.playerId === player?.id || item.pseudo?.toLowerCase() === player?.pseudo?.toLowerCase()) || {};
    return { id: match.id, date: match.date, opponentName: match.opponentName, result: matchResult(match), goals: number(entry.goals), points: number(entry.points), assists: number(entry.assists) };
  });
  return summary;
};

export const aggregatePlayers = (matches = [], roster = []) => (roster || [])
  .filter((player) => player.status !== "staff")
  .map((player) => ({ ...player, stats: aggregatePlayer(matches, player) }))
  .filter((player) => player.stats.played > 0)
  .sort((a, b) => b.stats.mvp - a.stats.mvp || b.stats.winRate - a.stats.winRate || b.stats.played - a.stats.played);

export const radarValues = (player) => {
  const stats = player?.stats || {};
  return {
    winRate: number(stats.winRate),
    experience: Math.min(100, number(stats.played) * 5),
    mvp: Math.min(100, number(stats.mvp) * 20),
    goals: Math.min(100, number(stats.goalsPerMatch) * 25),
    points: Math.min(100, number(stats.pointsPerMatch) / 10),
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
