import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { GAMES, computePlayerLeaderboard, getPlayerOfTheMonth, getPrimaryStatKey, getGameShortLabel } from "../lib/constants";
import { MatchCard } from "../components/MatchCard";
import { PlayerPhoto } from "./Team";
import { BarChart3, TrendingUp, Trophy, Target, Calendar, Flame, Skull, Crown } from "lucide-react";

const selectCls = "bg-[#1A1A1A] border border-white/20 px-3 py-2 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

const getPeriodStart = (period) => {
  const now = new Date();
  if (period === "month") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  }
  if (period === "quarter") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  }
  if (period === "year") {
    return `${now.getFullYear()}-01-01`;
  }
  return "";
};

export default function Stats() {
  const { t } = useLang();
  const [matches, setMatches] = useState(null);
  const [roster, setRoster] = useState([]);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [game, setGame] = useState("all");
  const [period, setPeriod] = useState("all");

  useEffect(() => {
    setError(false); setMatches(null);
    const u1 = onSnapshot(collection(db, "matches"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.status !== "upcoming" && m.status !== "live");
      list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      setMatches(list);
    }, (e) => { console.error(e); setError(true); });
    const u2 = onSnapshot(collection(db, "roster"), (snap) => setRoster(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
    return () => { u1(); u2(); };
  }, [retryKey]);

  // Leaderboard par joueur (alimenté par les stats des matchs)
  const leaderboard = useMemo(() => {
    if (!matches || !roster) return [];
    let list = computePlayerLeaderboard(roster, matches);
    if (game !== "all") list = list.filter((p) => p.game === game);
    return list;
  }, [matches, roster, game]);

  const playerOfMonth = useMemo(() => getPlayerOfTheMonth(roster || [], matches || []), [roster, matches]);

  const filtered = useMemo(() => {
    if (!matches) return [];
    let list = matches;
    if (game !== "all") list = list.filter((m) => m.game === game);
    const periodStart = getPeriodStart(period);
    if (periodStart) list = list.filter((m) => (m.date || "") >= periodStart);
    return list;
  }, [matches, game, period]);

  const stats = useMemo(() => {
    const total = filtered.length;
    if (total === 0) return null;
    const wins = filtered.filter((m) => Number(m.scoreUs) > Number(m.scoreThem)).length;
    const losses = filtered.filter((m) => Number(m.scoreUs) < Number(m.scoreThem)).length;
    const draws = total - wins - losses;
    const winRate = ((wins / total) * 100).toFixed(1);

    // Maps
    let mapsWon = 0, mapsLost = 0;
    filtered.forEach((m) => {
      (m.maps || []).forEach((map) => {
        if (map.name) {
          mapsWon += Number(map.us) || 0;
          mapsLost += Number(map.them) || 0;
        }
      });
    });

    // Avg score
    const avgUs = (filtered.reduce((s, m) => s + (Number(m.scoreUs) || 0), 0) / total).toFixed(1);
    const avgThem = (filtered.reduce((s, m) => s + (Number(m.scoreThem) || 0), 0) / total).toFixed(1);

    // Current streak (from most recent)
    let currentStreak = 0;
    let currentType = "";
    for (const m of filtered) {
      const r = Number(m.scoreUs) > Number(m.scoreThem) ? "W" : "L";
      if (currentType === "") currentType = r;
      if (r === currentType) currentStreak++;
      else break;
    }

    // Best streak
    let bestStreak = 0;
    let streak = 0;
    let streakType = "";
    for (let i = filtered.length - 1; i >= 0; i--) {
      const m = filtered[i];
      const r = Number(m.scoreUs) > Number(m.scoreThem) ? "W" : "L";
      if (r === streakType) { streak++; }
      else { streakType = r; streak = 1; }
      if (streakType === "W" && streak > bestStreak) bestStreak = streak;
    }

    // Per game breakdown
    const perGame = GAMES.map((g) => {
      const gm = filtered.filter((m) => m.game === g);
      const gw = gm.filter((m) => Number(m.scoreUs) > Number(m.scoreThem)).length;
      return { game: g, total: gm.length, wins: gw, winRate: gm.length ? ((gw / gm.length) * 100).toFixed(1) : "0.0" };
    });

    return { total, wins, losses, draws, winRate, mapsWon, mapsLost, avgUs, avgThem, currentStreak, currentType, bestStreak, perGame };
  }, [filtered]);

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20 relative">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="text-[#D8CA82]" size={20} />
            <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="stats-title">{t("stats.title")}</h1>
          </div>
          <p className="text-[#f7f7f7]/50 mt-4 tracking-wide">{t("stats.sub")}</p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4 mb-10" data-testid="stats-filters">
          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 block mb-1.5">{t("stats.filter.game")}</label>
            <select value={game} onChange={(e) => setGame(e.target.value)} className={selectCls} data-testid="stats-filter-game">
              <option value="all">{t("results.filter.all")}</option>
              {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 block mb-1.5">{t("stats.filter.period")}</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className={selectCls} data-testid="stats-filter-period">
              <option value="all">{t("stats.period.all")}</option>
              <option value="month">{t("stats.period.month")}</option>
              <option value="quarter">{t("stats.period.quarter")}</option>
              <option value="year">{t("stats.period.year")}</option>
            </select>
          </div>
        </div>

        {error ? (
          <ErrorState onRetry={() => setRetryKey((k) => k + 1)} testId="stats-error" />
        ) : matches === null ? (
          <LoadingState testId="stats-loading" />
        ) : stats === null ? (
          <EmptyState icon={Trophy} text={t("stats.empty")} testId="stats-empty" />
        ) : (
          <>
            {/* KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-12" data-testid="stats-kpis">
              <div className="border border-[#D8CA82]/30 bg-[#D8CA82]/5 p-5 text-center">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#D8CA82]/80 mb-1">{t("stats.winRate")}</p>
                <p className="font-display font-black text-3xl text-[#D8CA82]">{stats.winRate}%</p>
              </div>
              <div className="border border-white/10 bg-[#1A1A1A] p-5 text-center">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] mb-1">{t("stats.totalMatches")}</p>
                <p className="font-display font-black text-3xl text-[#f7f7f7]">{stats.total}</p>
              </div>
              <div className="border border-emerald-300/40 bg-emerald-300/5 p-5 text-center">
                <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-300 mb-1 flex items-center justify-center gap-1.5">
                  <Trophy size={11} aria-hidden="true" />{t("stats.wins")}
                </p>
                <p className="font-display font-black text-3xl text-emerald-300">{stats.wins}</p>
              </div>
              <div className="border border-red-300/40 bg-red-300/5 p-5 text-center">
                <p className="text-[10px] uppercase tracking-[0.25em] text-red-300 mb-1 flex items-center justify-center gap-1.5">
                  <Skull size={11} aria-hidden="true" />{t("stats.losses")}
                </p>
                <p className="font-display font-black text-3xl text-red-300">{stats.losses}</p>
              </div>
              <div className="border border-white/10 bg-[#1A1A1A] p-5 text-center">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] mb-1">{t("stats.mapsWon")}</p>
                <p className="font-display font-black text-3xl text-[#f7f7f7]">{stats.mapsWon}</p>
              </div>
              <div className="border border-white/10 bg-[#1A1A1A] p-5 text-center">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] mb-1">{t("stats.mapsLost")}</p>
                <p className="font-display font-black text-3xl text-[#f7f7f7]">{stats.mapsLost}</p>
              </div>
            </div>

            {/* Streaks & Avg Score */}
            <div className="grid md:grid-cols-2 gap-6 mb-12">
              <div className="border border-white/10 bg-[#1A1A1A] p-6" data-testid="stats-streaks">
                <div className="flex items-center gap-3 mb-4">
                  <Flame className="text-[#D8CA82]" size={16} />
                  <h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">{t("stats.currentStreak")}</h3>
                </div>
                <p className="font-display font-black text-2xl flex items-center gap-2">
                  {stats.currentType === "W" ? (
                    <Trophy size={20} className="text-emerald-300" aria-hidden="true" />
                  ) : (
                    <Skull size={20} className="text-red-300" aria-hidden="true" />
                  )}
                  <span className={stats.currentType === "W" ? "text-emerald-300" : "text-red-300"}>
                    {stats.currentStreak} {stats.currentType === "W" ? t("stats.series.wins") : t("stats.series.losses")}
                  </span>
                </p>
                <div className="mt-4 pt-4 border-t border-white/10">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-1">{t("stats.bestStreak")}</p>
                  <p className="font-display font-bold text-xl text-[#D8CA82]">{stats.bestStreak} {t("stats.series.wins")}</p>
                </div>
              </div>
              <div className="border border-white/10 bg-[#1A1A1A] p-6" data-testid="stats-avg">
                <div className="flex items-center gap-3 mb-4">
                  <Target className="text-[#D8CA82]" size={16} />
                  <h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">{t("stats.avgScore")}</h3>
                </div>
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-1">Elysium</p>
                    <p className="font-display font-black text-2xl text-[#D8CA82]">{stats.avgUs}</p>
                  </div>
                  <span className="text-[#f7f7f7]/20 text-2xl">—</span>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-1">Adversaire</p>
                    <p className="font-display font-black text-2xl text-[#f7f7f7]">{stats.avgThem}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Per Game */}
            <div className="mb-12" data-testid="stats-per-game">
              <div className="flex items-center gap-3 mb-6">
                <TrendingUp className="text-[#D8CA82]" size={16} />
                <h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">{t("stats.perGame")}</h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {stats.perGame.map((pg) => (
                  <div key={pg.game} className="border border-white/10 bg-[#1A1A1A] p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-display font-bold text-[#f7f7f7]">{pg.game}</p>
                      <span className="text-[10px] uppercase tracking-[0.25em] text-[#D8CA82]">{pg.total} {t("stats.totalMatches").toLowerCase()}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="h-2 bg-white/10 overflow-hidden">
                          <div className="h-full bg-[#D8CA82]" style={{ width: `${pg.winRate}%` }} />
                        </div>
                      </div>
                      <span className="font-display font-bold text-[#D8CA82]">{pg.winRate}%</span>
                    </div>
                    <p className="text-xs text-[#f7f7f7]/40 mt-2">{pg.wins}W – {pg.total - pg.wins}L</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Joueur du mois */}
            {playerOfMonth && (
              <div className="mb-12 border border-[#D8CA82]/40 bg-gradient-to-br from-[#D8CA82]/10 to-transparent p-6" data-testid="stats-player-of-month">
                <div className="flex items-center gap-3 mb-6">
                  <Crown size={18} className="text-[#D8CA82]" aria-hidden="true" />
                  <h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">{t("stats.playerOfMonth")}</h3>
                </div>
                <div className="flex items-center gap-6 flex-wrap">
                  <PlayerPhoto src={playerOfMonth.photo} alt={playerOfMonth.pseudo} className="h-24 w-24 border border-[#D8CA82]/40" />
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-display font-black text-2xl text-[#D8CA82] uppercase">{playerOfMonth.pseudo}</p>
                    <p className="text-xs uppercase tracking-[0.25em] text-[#f7f7f7]/50 mt-1">
                      {playerOfMonth.game}{playerOfMonth.roster ? ` · ${playerOfMonth.roster}` : ""}{playerOfMonth.ingameRole ? ` — ${playerOfMonth.ingameRole}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-x-8 gap-y-2 mt-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40">{t("stats.playerWinRate")}</p>
                        <p className="font-display font-bold text-xl text-emerald-300">{playerOfMonth.winRate}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40">{getPrimaryStatKey(playerOfMonth.game) === "kills" ? t("stats.kd") : t("stats.goalsPerGame")}</p>
                        <p className="font-display font-bold text-xl text-[#D8CA82]">{playerOfMonth.ratio}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40">{t("stats.playerGames")}</p>
                        <p className="font-display font-bold text-xl text-[#f7f7f7]">{playerOfMonth.matchesPlayed}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40">W/L</p>
                        <p className="font-display font-bold text-xl text-[#f7f7f7]">
                          <span className="text-emerald-300">{playerOfMonth.wins}</span> / <span className="text-red-300">{playerOfMonth.losses}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                  <Link to={`/equipe/${playerOfMonth.id}`} className="text-xs font-display uppercase tracking-widest text-[#D8CA82] hover:underline border border-[#D8CA82]/40 px-4 py-2 hover:bg-[#D8CA82]/10 transition-colors">
                    {t("team.view")} →
                  </Link>
                </div>
              </div>
            )}

            {/* Leaderboard joueurs */}
            <div className="mb-12" data-testid="stats-leaderboard">
              <div className="flex items-center gap-3 mb-2">
                <Trophy className="text-[#D8CA82]" size={16} />
                <h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">{t("stats.leaderboard")}</h3>
              </div>
              <p className="text-xs text-[#f7f7f7]/40 mb-6">{t("stats.leaderboard.sub")}</p>
              {leaderboard.length === 0 ? (
                <p className="text-[#f7f7f7]/40 text-sm" data-testid="stats-leaderboard-empty">{t("stats.empty")}</p>
              ) : (
                <div className="border border-white/10 bg-[#141414] overflow-x-auto" data-testid="stats-leaderboard-table">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-widest text-[#f7f7f7]/40">
                        <th className="px-4 py-3">{t("stats.rank")}</th>
                        <th className="px-4 py-3">Joueur</th>
                        <th className="px-4 py-3 text-center">{t("stats.playerGames")}</th>
                        <th className="px-4 py-3 text-center">W</th>
                        <th className="px-4 py-3 text-center">L</th>
                        <th className="px-4 py-3 text-center">{t("stats.playerWinRate")}</th>
                        <th className="px-4 py-3 text-center">{getPrimaryStatKey(game !== "all" ? game : "EVA") === "kills" ? t("stats.kd") : t("stats.goalsPerGame")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.slice(0, 15).map((p, i) => (
                        <tr key={p.id} className="border-b border-white/5 hover:bg-white/5" data-testid={`stats-leaderboard-row-${p.id}`}>
                          <td className="px-4 py-2.5">
                            <span className={`font-display font-black ${i === 0 ? "text-[#D8CA82] text-lg" : i < 3 ? "text-[#f7f7f7] font-bold" : "text-[#f7f7f7]/40"}`}>
                              {i === 0 ? <Crown size={14} className="inline -mt-0.5 mr-1 text-[#D8CA82]" aria-hidden="true" /> : null}
                              {i + 1}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <Link to={`/equipe/${p.id}`} className="flex items-center gap-3 group">
                              <PlayerPhoto src={p.photo} alt={p.pseudo} className="h-9 w-9" />
                              <span className="font-display font-bold text-[#f7f7f7] group-hover:text-[#D8CA82] transition-colors">{p.pseudo}</span>
                              <span className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/30">{getGameShortLabel(p.game)}</span>
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-center text-[#f7f7f7]/60">{p.matchesPlayed}</td>
                          <td className="px-4 py-2.5 text-center text-emerald-300 font-bold">{p.wins}</td>
                          <td className="px-4 py-2.5 text-center text-red-300 font-bold">{p.losses}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="font-display font-bold text-[#D8CA82]">{p.winRate}%</span>
                            <div className="w-16 mx-auto mt-1 h-1 bg-white/10 overflow-hidden">
                              <div className="h-full bg-[#D8CA82]" style={{ width: `${p.winRate}%` }} />
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-center font-display font-bold text-[#f7f7f7]">{p.ratio}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Match History */}
            <div data-testid="stats-history">
              <div className="flex items-center gap-3 mb-6">
                <Calendar className="text-[#D8CA82]" size={16} />
                <h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">{t("stats.history")}</h3>
              </div>
              {filtered.length === 0 ? (
                <EmptyState icon={Calendar} text={t("stats.noHistory")} testId="stats-history-empty" />
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.slice(0, 12).map((m) => <MatchCard key={m.id} match={m} />)}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
