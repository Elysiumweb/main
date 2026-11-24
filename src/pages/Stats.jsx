import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { GAMES, isRemovedGame } from "../lib/constants";
import { MatchCard } from "../components/MatchCard";
import { BarChart3, TrendingUp, Trophy, Target, Calendar, Flame, Skull, Map as MapIcon, Award, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, RadarChart, PolarGrid, PolarAngleAxis, Radar } from "recharts";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { PLAYER_STAT_KEYS, aggregatePlayers, playerStatValue, radarValues } from "../lib/playerStats";

const STAT_HIGHLIGHT = {
  goals: "text-primary",
  assists: "text-[#c4b5fd]",
  saves: "text-[#67e8f9]",
  shots: "text-foreground",
  score: "text-primary",
  mvp: "text-[#F4511E]",
};

const selectCls = "bg-card border border-border/35 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary";

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
  if (period === "season2026") {
    return "2026-01-01";
  }
  if (period === "last30") {
    const d = new Date(now); d.setDate(d.getDate()-30);
    return d.toISOString().slice(0,10);
  }
  if (period === "last90") {
    const d = new Date(now); d.setDate(d.getDate()-90);
    return d.toISOString().slice(0,10);
  }
  return "";
};

const getPeriodEnd = (period) => {
  if (period==="season2026") return "2026-12-31";
  return "";
};

const normalizeMaps = (maps) => {
  if (!maps) return [];
  if (typeof maps === "string" && maps.trim()) {
    return maps.split("\n").filter(Boolean).map(line=>{
      const parts = line.split("|").map(s=>s.trim());
      if (parts.length>=2) {
        const [a,b]=parts[1].split("-").map(s=>s.trim());
        return { name: parts[0]||line, scoreUs: a||"", scoreThem: b||"" };
      }
      return { name: line, scoreUs:"", scoreThem:"" };
    });
  }
  if (!Array.isArray(maps)) return [];
  return maps.map(m=>{
    if (typeof m==="string") {
      const parts = m.split("|").map(s=>s.trim());
      if (parts.length>=2) {
        const [a,b]=parts[1].split("-").map(s=>s.trim());
        return { name: parts[0]||m, scoreUs: a||"", scoreThem: b||"" };
      }
      return { name: m, scoreUs:"", scoreThem:"" };
    }
    return { name: m.map || m.name || "", scoreUs: m.scoreUs ?? "", scoreThem: m.scoreThem ?? "" };
  }).filter(m=> m.name || m.scoreUs || m.scoreThem);
};

export default function Stats() {
  const { t } = useLang();
  const [matches, setMatches] = useState(null);
  const [roster, setRoster] = useState([]);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [game, setGame] = useState("all");
  const [period, setPeriod] = useState("all");

  useEffect(() => {
    setError(false); setMatches(null);
    const unsubscribeMatches = onSnapshot(collection(db, "matches"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.status === "finished" && !isRemovedGame(m.game));
      list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      setMatches(list);
    }, (e) => { console.error(e); setError(true); });
    const unsubscribeRoster = onSnapshot(collection(db, "roster"), (snap) => setRoster(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((player) => !isRemovedGame(player.game))), console.error);
    return () => { unsubscribeMatches(); unsubscribeRoster(); };
  }, [retryKey]);

  const filtered = useMemo(() => {
    if (!matches) return [];
    let list = matches;
    if (game !== "all") list = list.filter((m) => m.game === game);
    const periodStart = getPeriodStart(period);
    const periodEnd = getPeriodEnd(period);
    if (periodStart) list = list.filter((m) => (m.date || "") >= periodStart);
    if (periodEnd) list = list.filter((m) => (m.date || "") <= periodEnd);
    return list;
  }, [matches, game, period]);

  const stats = useMemo(() => {
    const total = filtered.length;
    if (total === 0) return null;

    const getResultCode = (m) => {
      const us = Number(m.scoreUs);
      const them = Number(m.scoreThem);
      if (us > them) return "W";
      if (us < them) return "L";
      return "D";
    };

    const wins = filtered.filter((m) => getResultCode(m) === "W").length;
    const losses = filtered.filter((m) => getResultCode(m) === "L").length;
    const draws = total - wins - losses;
    const winRate = ((wins / total) * 100).toFixed(1);

    const avgUs = (filtered.reduce((sum, m) => sum + (Number(m.scoreUs) || 0), 0) / total).toFixed(1);
    const avgThem = (filtered.reduce((sum, m) => sum + (Number(m.scoreThem) || 0), 0) / total).toFixed(1);

    let currentStreak = 0;
    let currentType = "";
    for (const m of filtered) {
      const resultType = getResultCode(m);
      if (currentType === "") currentType = resultType;
      if (resultType === currentType) currentStreak++;
      else break;
    }

    let bestStreak = 0;
    let streak = 0;
    for (let i = filtered.length - 1; i >= 0; i--) {
      const resultType = getResultCode(filtered[i]);
      if (resultType === "W") {
        streak++;
        if (streak > bestStreak) bestStreak = streak;
      } else {
        streak = 0;
      }
    }

    const perGame = GAMES.map((g) => {
      const gm = filtered.filter((m) => m.game === g);
      const gw = gm.filter((m) => getResultCode(m) === "W").length;
      const gl = gm.filter((m) => getResultCode(m) === "L").length;
      const gd = gm.length - gw - gl;
      return { game: g, total: gm.length, wins: gw, losses: gl, draws: gd, winRate: gm.length ? ((gw / gm.length) * 100).toFixed(1) : "0.0" };
    });

    // Maps aggregation
    const mapsAgg = new Map();
    filtered.forEach(m=>{
      normalizeMaps(m.maps).forEach(map=>{
        const key = (map.name||"Unknown").trim();
        const entry = mapsAgg.get(key) || { name: key, played:0, wins:0, losses:0 };
        const us = Number(map.scoreUs); const them = Number(map.scoreThem);
        if (!isNaN(us) && !isNaN(them)) {
          entry.played++;
          if (us>them) entry.wins++; else if (us<them) entry.losses++;
        } else {
          // If map scores missing, count as played without result
          entry.played++;
        }
        mapsAgg.set(key, entry);
      });
    });
    const perMap = [...mapsAgg.values()].map(m=>({
      ...m,
      winRate: m.played ? ((m.wins / m.played)*100).toFixed(1) : "0.0",
    })).sort((a,b)=> b.played - a.played || b.winRate - a.winRate);

    // Player leaderboard — statistiques officielles : but, passe, arrêt, tir, score, MVP
    const playerAgg = new Map();
    filtered.forEach(m=>{
      const result = getResultCode(m);
      (m.players||[]).forEach(p=>{
        const key = p.playerId || p.pseudo;
        if (!key) return;
        const entry = playerAgg.get(key) || {
          id: p.playerId || "", pseudo: p.pseudo, played:0, wins:0,
          goals:0, assists:0, saves:0, shots:0, score:0, mvp:0,
        };
        entry.played++;
        if (result==="W") entry.wins++;
        if (m.mvp && (m.mvp===p.playerId || m.mvp===p.pseudo)) entry.mvp++;
        entry.goals += playerStatValue(p, "goals");
        entry.assists += playerStatValue(p, "assists");
        entry.saves += playerStatValue(p, "saves");
        entry.shots += playerStatValue(p, "shots");
        entry.score += playerStatValue(p, "score");
        playerAgg.set(key, entry);
      });
    });
    const legacyLeaderboard = [...playerAgg.values()].map(p=>({
      ...p,
      winRate: p.played ? ((p.wins / p.played)*100).toFixed(1) : "0.0",
    })).sort((a,b)=> b.mvp - a.mvp || b.score - a.score || b.winRate - a.winRate || b.played - a.played);
    const richPlayers = aggregatePlayers(filtered, roster);
    // Pool complet (non tronqué) : sert au classement et aux leaders par statistique.
    const playerPool = richPlayers.length ? richPlayers.map((player) => ({ ...player.stats, id: player.id, pseudo: player.pseudo, player })) : legacyLeaderboard;
    const leaderboard = playerPool.slice(0, 20);

    let rollingWins = 0;
    const evolution = [...filtered].reverse().map((match, index) => {
      if (getResultCode(match) === "W") rollingWins += 1;
      return { date: match.date || `#${index + 1}`, winRate: Number(((rollingWins / (index + 1)) * 100).toFixed(1)) };
    });
    const competitions = [...filtered.reduce((map, match) => {
      const name = match.competition?.trim() || "Hors compétition";
      map.set(name, (map.get(name) || 0) + 1);
      return map;
    }, new Map())].map(([name, value]) => ({ name, value }));

    return { total, wins, losses, draws, winRate, avgUs, avgThem, currentStreak, currentType, bestStreak, perGame, perMap, leaderboard, playerPool, richPlayers, evolution, competitions };
  }, [filtered, roster]);

  const firstCompared = stats?.richPlayers.find((player) => player.id === compareA) || stats?.richPlayers[0];
  const secondCompared = stats?.richPlayers.find((player) => player.id === compareB) || stats?.richPlayers[1];
  const radarData = firstCompared && secondCompared
    ? PLAYER_STAT_KEYS.map((key) => ({
      metric: t(`stat.${key}`),
      first: radarValues(firstCompared)[key],
      second: radarValues(secondCompared)[key],
    }))
    : [];
  // Leaders par statistique : meilleurs joueurs sur chacune des six stats.
  const leaders = (stats?.playerPool || [])
    .length
    ? PLAYER_STAT_KEYS.map((key) => ({
      key,
      label: t(`stat.${key}`),
      top: [...stats.playerPool]
        .filter((player) => (player[key] || 0) > 0)
        .sort((a, b) => (b[key] || 0) - (a[key] || 0))
        .slice(0, 3),
    })).filter((row) => row.top.length > 0)
    : [];
  const chartTooltipStyle = { background: "oklch(0.16 0.008 85)", border: "1px solid oklch(0.84 0.095 98/0.35)", color: "oklch(0.95 0.012 95)" };

  return (
    <div className="min-h-[70vh] bg-transparent">
      <section className="relative overflow-hidden pt-6 sm:pt-10">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb className="opacity-80" items={[{ label: t("stats.title") }]} />
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="text-primary" size={20} />
            <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl uppercase leading-[0.95] text-gold" data-testid="stats-title">{t("stats.title")}</h1>
          </div>
          <p className="text-foreground/50 mt-4 tracking-wide">{t("stats.sub")}</p>
          <p className="text-xs text-primary/80 mt-2" data-testid="stats-player-stats-note">{t("stats.playerStats.sub")}</p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4 mb-4" data-testid="stats-filters">
          <div>
            <label className="text-xs uppercase tracking-[0.25em] text-muted-foreground block mb-1.5">{t("stats.filter.game")}</label>
            <select value={game} onChange={(e) => setGame(e.target.value)} className={selectCls} data-testid="stats-filter-game">
              <option value="all">{t("results.filter.all")}</option>
              {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.25em] text-muted-foreground block mb-1.5">{t("stats.filter.period")}</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className={selectCls} data-testid="stats-filter-period">
              <option value="all">{t("stats.period.all")}</option>
              <option value="season2026">Saison 2026</option>
              <option value="last30">30 derniers jours</option>
              <option value="last90">90 derniers jours</option>
              <option value="month">{t("stats.period.month")}</option>
              <option value="quarter">{t("stats.period.quarter")}</option>
              <option value="year">{t("stats.period.year")}</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-10" data-testid="stats-presets">
          <span className="text-xs uppercase tracking-widest text-muted-foreground/60 mr-2 py-1">Raccourcis :</span>
          {[
            ["season2026","Saison 2026"],
            ["last30","30 derniers jours"],
            ["last90","90 derniers jours"],
            ["year","Année en cours"],
          ].map(([key,label])=>(
            <button key={key} onClick={()=> setPeriod(key)} data-testid={`stats-preset-${key}`}
              className={`text-xs border px-3 py-1.5 uppercase tracking-widest ${period===key ? "border-primary text-primary bg-primary/10" : "border-border/30 text-muted-foreground hover:text-foreground"}`}>{label}</button>
          ))}
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-12" data-testid="stats-kpis">
              <div className="border border-primary/30 bg-primary/5 p-5 text-center">
                <p className="text-xs uppercase tracking-[0.25em] text-primary/80 mb-1">{t("stats.winRate")}</p>
                <p className="font-display font-black text-3xl text-primary">{stats.winRate}%</p>
              </div>
              <div className="panel clip-blade-sm p-5 text-center">
                <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-1">{t("stats.totalMatches")}</p>
                <p className="font-display font-black text-3xl text-foreground">{stats.total}</p>
              </div>
              <div className="border border-emerald-300/40 bg-emerald-300/5 p-5 text-center">
                <p className="text-xs uppercase tracking-[0.25em] text-emerald-300 mb-1 flex items-center justify-center gap-1.5">
                  <Trophy size={11} aria-hidden="true" />{t("stats.wins")}
                </p>
                <p className="font-display font-black text-3xl text-emerald-300">{stats.wins}</p>
              </div>
              <div className="border border-red-300/40 bg-red-300/5 p-5 text-center">
                <p className="text-xs uppercase tracking-[0.25em] text-red-300 mb-1 flex items-center justify-center gap-1.5">
                  <Skull size={11} aria-hidden="true" />{t("stats.losses")}
                </p>
                <p className="font-display font-black text-3xl text-red-300">{stats.losses}</p>
              </div>
              <div className="panel clip-blade-sm p-5 text-center">
                <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-1">{t("stats.draws")}</p>
                <p className="font-display font-black text-3xl text-foreground">{stats.draws}</p>
              </div>
            </div>

            {/* Streaks & Avg Score */}
            <div className="grid md:grid-cols-2 gap-6 mb-12">
              <div className="panel clip-blade-sm p-6" data-testid="stats-streaks">
                <div className="flex items-center gap-3 mb-4">
                  <Flame className="text-primary" size={16} />
                  <h3 className="font-display text-sm uppercase tracking-[0.3em] text-foreground">{t("stats.currentStreak")}</h3>
                </div>
                <p className="font-display font-black text-2xl flex items-center gap-2">
                  {stats.currentType === "W" ? (
                    <Trophy size={20} className="text-emerald-300" aria-hidden="true" />
                  ) : stats.currentType === "L" ? (
                    <Skull size={20} className="text-red-300" aria-hidden="true" />
                  ) : (
                    <span className="text-muted-foreground" aria-hidden="true">=</span>
                  )}
                  <span className={stats.currentType === "W" ? "text-emerald-300" : stats.currentType === "L" ? "text-red-300" : "text-muted-foreground"}>
                    {stats.currentStreak} {stats.currentType === "W" ? t("stats.series.wins") : stats.currentType === "L" ? t("stats.series.losses") : t("stats.draws").toLowerCase()}
                  </span>
                </p>
                <div className="mt-4 pt-4 border-t border-border/25">
                  <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-1">{t("stats.bestStreak")}</p>
                  <p className="font-display font-bold text-xl text-primary">{stats.bestStreak} {t("stats.series.wins")}</p>
                </div>
              </div>
              <div className="panel clip-blade-sm p-6" data-testid="stats-avg">
                <div className="flex items-center gap-3 mb-4">
                  <Target className="text-primary" size={16} />
                  <h3 className="font-display text-sm uppercase tracking-[0.3em] text-foreground">{t("stats.avgScore")}</h3>
                </div>
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-1">Elysium</p>
                    <p className="font-display font-black text-2xl text-primary">{stats.avgUs}</p>
                  </div>
                  <span className="text-muted-foreground text-2xl">—</span>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-1">{t("common.adversary")}</p>
                    <p className="font-display font-black text-2xl text-foreground">{stats.avgThem}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Real data visualisations */}
            <div className="grid lg:grid-cols-2 gap-6 mb-12" data-testid="stats-charts">
              <div className="panel clip-blade-sm p-5">
                <h3 className="font-display text-sm uppercase tracking-[0.25em] text-foreground mb-5">Évolution du win rate</h3>
                <div className="h-72" aria-label="Graphique d'évolution du win rate">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.evolution} margin={{ left: -20, right: 12 }}><CartesianGrid stroke="rgba(255,255,255,.08)" strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fill: "oklch(0.72 0.02 90)", fontSize: 10 }} minTickGap={28} /><YAxis domain={[0, 100]} tick={{ fill: "oklch(0.72 0.02 90)", fontSize: 10 }} /><Tooltip contentStyle={chartTooltipStyle} formatter={(value) => [`${value}%`, "Win rate"]} /><Line type="monotone" dataKey="winRate" stroke="oklch(0.84 0.095 98)" strokeWidth={3} dot={{ fill: "oklch(0.84 0.095 98)", r: 3 }} activeDot={{ r: 6 }} /></LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="panel clip-blade-sm p-5">
                <h3 className="font-display text-sm uppercase tracking-[0.25em] text-foreground mb-5">Répartition par compétition</h3>
                <div className="h-72" aria-label="Graphique de répartition par compétition">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart><Pie data={stats.competitions} dataKey="value" nameKey="name" innerRadius={52} outerRadius={88} paddingAngle={2}>{stats.competitions.map((entry, index) => <Cell key={entry.name} fill={["oklch(0.84 0.095 98)", "#F4511E", "#67e8f9", "#a7f3d0", "#c4b5fd"][index % 5]} />)}</Pie><Tooltip contentStyle={chartTooltipStyle} /><Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.72 0.02 90)" }} /></PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Per Game */}
            <div className="mb-12" data-testid="stats-per-game">
              <div className="flex items-center gap-3 mb-6">
                <TrendingUp className="text-primary" size={16} />
                <h3 className="font-display text-sm uppercase tracking-[0.3em] text-foreground">{t("stats.perGame")}</h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {stats.perGame.map((pg) => (
                  <div key={pg.game} className="panel clip-blade-sm p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-display font-bold text-foreground">{pg.game}</p>
                      <span className="text-xs uppercase tracking-[0.25em] text-primary">{pg.total} {t("stats.totalMatches").toLowerCase()}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="h-2 bg-primary/10 overflow-hidden">
                          <div className="h-full bg-gold" style={{ width: `${pg.winRate}%` }} />
                        </div>
                      </div>
                      <span className="font-display font-bold text-primary">{pg.winRate}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{pg.wins}W – {pg.losses}L{pg.draws ? ` – ${pg.draws}D` : ""}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Per Map */}
            {stats.perMap.length>0 && (
              <div className="mb-12" data-testid="stats-per-map">
                <div className="flex items-center gap-3 mb-6">
                  <MapIcon className="text-primary" size={16} />
                  <h3 className="font-display text-sm uppercase tracking-[0.3em] text-foreground">Win rate par map / manche</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-1 mb-4" data-testid="stats-round-heatmap" aria-label="Heatmap des manches">
                  {stats.perMap.map((map) => {
                    const rate = Number(map.winRate);
                    const background = rate >= 60 ? `rgba(110,231,183,${0.18 + rate / 180})` : rate < 40 ? `rgba(252,165,165,${0.18 + (100 - rate) / 180})` : "rgba(216,202,130,.22)";
                    return <div key={map.name} style={{ background }} className="min-h-20 p-3 border border-border/25 flex flex-col justify-between" title={`${map.played} manches · ${map.winRate}%`}><span className="text-xs text-foreground truncate">{map.name}</span><span className="font-display font-black text-lg text-foreground">{map.winRate}%</span></div>;
                  })}
                </div>
                <div className="panel clip-blade-sm overflow-x-auto bg-card">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground uppercase tracking-widest border-b border-border/25">
                      <tr><th className="text-left py-2 px-4">Map</th><th className="text-center">Jouées</th><th className="text-center">V</th><th className="text-center">D</th><th className="text-right px-4">Win rate</th></tr>
                    </thead>
                    <tbody>
                      {stats.perMap.map(m=>(
                        <tr key={m.name} className="border-t border-border/20">
                          <td className="py-2 px-4 text-foreground">{m.name}</td>
                          <td className="text-center text-muted-foreground">{m.played}</td>
                          <td className="text-center text-emerald-300">{m.wins}</td>
                          <td className="text-center text-red-300">{m.losses}</td>
                          <td className="text-right px-4 font-bold text-primary">{m.winRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Leaderboard players */}
            {stats.leaderboard.length>0 && (
              <div className="mb-12" data-testid="stats-leaderboard">
                <div className="flex items-center gap-3 mb-6">
                  <Award className="text-primary" size={16} />
                  <h3 className="font-display text-sm uppercase tracking-[0.3em] text-foreground">{t("stats.leaderboard")}</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-1">{t("stats.leaderboard.sub")}</p>
                <p className="text-xs text-muted-foreground/70 mb-3">{t("stats.replayNote")}</p>
                <div className="panel clip-blade-sm overflow-x-auto bg-card">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground uppercase tracking-widest border-b border-border/25">
                      <tr>
                        <th className="text-left py-2 px-4">Joueur</th>
                        <th className="text-center">Matchs</th>
                        <th className="text-center">V / D</th>
                        <th className="text-center">Win rate</th>
                        {PLAYER_STAT_KEYS.map((key) => (
                          <th key={key} className="text-center px-2">{t(`stat.${key}`)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stats.leaderboard.map((p,i)=>(
                        <tr key={p.id||p.pseudo||i} className="border-t border-border/20">
                          <td className="py-2 px-4 text-foreground"><span className="text-muted-foreground mr-2">{i+1}.</span>{p.id ? <Link to={`/equipe/${p.id}`} className="hover:text-primary hover:underline">{p.pseudo}</Link> : p.pseudo}</td>
                          <td className="text-center text-muted-foreground">{p.played}</td>
                          <td className="text-center"><span className="text-emerald-300">{p.wins}</span> / <span className="text-red-300">{p.losses ?? "—"}</span></td>
                          <td className="text-center font-bold text-primary">{p.winRate}%</td>
                          {PLAYER_STAT_KEYS.map((key) => (
                            <td key={key} className={`text-center px-2 ${key === "mvp" ? "font-bold text-primary" : "text-foreground"}`} data-testid={`stats-player-${key}-${p.id||p.pseudo||i}`}>
                              {key === "mvp" ? ((p.mvp || 0) > 0 ? `${p.mvp}×` : "—") : (p[key] ?? "—")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {leaders.length > 0 && (
                  <div className="mt-6" data-testid="stats-leaders">
                    <div className="flex items-center gap-3 mb-1">
                      <TrendingUp className="text-primary" size={14} />
                      <h4 className="font-display text-xs uppercase tracking-[0.3em] text-foreground">{t("stats.leaders")}</h4>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">{t("stats.leaders.sub")}</p>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {leaders.map((row) => (
                        <div key={row.key} className="panel clip-blade-sm p-4" data-testid={`stats-leader-${row.key}`}>
                          <p className={`text-[10px] uppercase tracking-[0.25em] mb-3 ${STAT_HIGHLIGHT[row.key] || "text-primary"}`}>{row.label}</p>
                          <ol className="space-y-1.5">
                            {row.top.map((player, rank) => (
                              <li key={player.id || player.pseudo || rank} className="flex items-center justify-between gap-3 text-xs">
                                <span className="text-foreground truncate">
                                  <span className="text-muted-foreground mr-2">{rank + 1}.</span>
                                  {player.id ? <Link to={`/equipe/${player.id}`} className="hover:text-primary hover:underline">{player.pseudo}</Link> : player.pseudo}
                                </span>
                                <span className={`font-bold ${STAT_HIGHLIGHT[row.key] || "text-primary"}`}>{player[row.key]}{row.key === "mvp" ? "×" : ""}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Player comparator */}
            {stats.richPlayers.length > 1 && (
              <div className="mb-12 border border-primary/25 bg-card/70 p-5 sm:p-7" data-testid="player-comparator">
                <div className="flex items-center gap-3 mb-6"><Users className="text-primary" size={17} /><h3 className="font-display text-sm uppercase tracking-[0.3em] text-foreground">Comparateur de joueurs</h3></div>
                <div className="grid sm:grid-cols-2 gap-4 mb-6">
                  {[{ value: firstCompared?.id || "", setter: setCompareA, exclude: secondCompared?.id }, { value: secondCompared?.id || "", setter: setCompareB, exclude: firstCompared?.id }].map((select, index) => <select key={index} value={select.value} onChange={(e) => select.setter(e.target.value)} className={selectCls} aria-label={`Joueur ${index + 1}`}>{stats.richPlayers.filter((player) => player.id !== select.exclude || player.id === select.value).map((player) => <option key={player.id} value={player.id}>{player.pseudo}</option>)}</select>)}
                </div>
                <div className="grid lg:grid-cols-[1fr_1.25fr_1fr] gap-5 items-center">
                  {[firstCompared, secondCompared].map((player, index) => player && <div key={player.id} className={`panel clip-blade-sm p-5 ${index === 1 ? "lg:col-start-3" : ""}`}>
                    <Link to={`/equipe/${player.id}`} className="font-display font-black text-xl text-foreground hover:text-primary">{player.pseudo}</Link>
                    <p className="text-xs uppercase tracking-widest text-primary mt-1">{player.game}{player.ingameRole ? ` · ${player.ingameRole}` : ""}</p>
                    <dl className="grid grid-cols-2 gap-3 mt-5 text-xs">
                      <div><dt className="text-muted-foreground">Matchs</dt><dd className="text-lg text-foreground font-bold">{player.stats.played}</dd></div>
                      <div><dt className="text-muted-foreground">Win rate</dt><dd className="text-lg text-primary font-bold">{player.stats.winRate}%</dd></div>
                      {PLAYER_STAT_KEYS.map((key) => (
                        <div key={key}>
                          <dt className="text-muted-foreground">{t(`stat.${key}`)}</dt>
                          <dd className={`text-lg font-bold ${STAT_HIGHLIGHT[key] || "text-foreground"}`} data-testid={`compare-${key}-${player.id}`}>
                            {key === "mvp" ? player.stats.mvp : (player.stats[key] ?? 0)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {player.palmares && <div className="mt-4 pt-4 border-t border-border/25"><p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Palmarès</p><p className="text-xs text-foreground/80 whitespace-pre-line line-clamp-4">{player.palmares}</p></div>}
                  </div>)}
                  <div className="h-72 lg:col-start-2 lg:row-start-1" aria-label="Radar de comparaison des joueurs"><ResponsiveContainer width="100%" height="100%"><RadarChart data={radarData}><PolarGrid stroke="rgba(255,255,255,.2)" /><PolarAngleAxis dataKey="metric" tick={{ fill: "oklch(0.72 0.02 90)", fontSize: 10 }} /><Radar name={firstCompared?.pseudo} dataKey="first" stroke="oklch(0.84 0.095 98)" fill="oklch(0.84 0.095 98)" fillOpacity={0.25} /><Radar name={secondCompared?.pseudo} dataKey="second" stroke="#F4511E" fill="#F4511E" fillOpacity={0.2} /><Legend wrapperStyle={{ fontSize: 11 }} /><Tooltip contentStyle={chartTooltipStyle} /></RadarChart></ResponsiveContainer></div>
                </div>
              </div>
            )}

            {/* Match History */}
            <div data-testid="stats-history">
              <div className="flex items-center gap-3 mb-6">
                <Calendar className="text-primary" size={16} />
                <h3 className="font-display text-sm uppercase tracking-[0.3em] text-foreground">{t("stats.history")}</h3>
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
