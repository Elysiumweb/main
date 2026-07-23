import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { GAMES } from "../lib/constants";
import { MatchCard } from "../components/MatchCard";
import { BarChart3, TrendingUp, Trophy, Target, Calendar, Flame } from "lucide-react";

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
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [game, setGame] = useState("all");
  const [period, setPeriod] = useState("all");

  useEffect(() => {
    setError(false); setMatches(null);
    return onSnapshot(collection(db, "matches"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.status !== "upcoming");
      list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      setMatches(list);
    }, (e) => { console.error(e); setError(true); });
  }, [retryKey]);

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
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#D8CA82]/70 mb-1">{t("stats.winRate")}</p>
                <p className="font-display font-black text-3xl text-[#D8CA82]">{stats.winRate}%</p>
              </div>
              <div className="border border-white/10 bg-[#1A1A1A] p-5 text-center">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-1">{t("stats.totalMatches")}</p>
                <p className="font-display font-black text-3xl text-[#f7f7f7]">{stats.total}</p>
              </div>
              <div className="border border-emerald-400/30 bg-emerald-400/5 p-5 text-center">
                <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-400/70 mb-1">{t("stats.wins")}</p>
                <p className="font-display font-black text-3xl text-emerald-400">{stats.wins}</p>
              </div>
              <div className="border border-red-400/30 bg-red-400/5 p-5 text-center">
                <p className="text-[10px] uppercase tracking-[0.25em] text-red-400/70 mb-1">{t("stats.losses")}</p>
                <p className="font-display font-black text-3xl text-red-400">{stats.losses}</p>
              </div>
              <div className="border border-white/10 bg-[#1A1A1A] p-5 text-center">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-1">{t("stats.mapsWon")}</p>
                <p className="font-display font-black text-3xl text-[#f7f7f7]">{stats.mapsWon}</p>
              </div>
              <div className="border border-white/10 bg-[#1A1A1A] p-5 text-center">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-1">{t("stats.mapsLost")}</p>
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
                <p className="font-display font-black text-2xl">
                  <span className={stats.currentType === "W" ? "text-emerald-400" : "text-red-400"}>
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
