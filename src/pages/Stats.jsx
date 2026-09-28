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
import { aggregatePlayers, radarValues } from "../lib/playerStats";

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
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.status !== "upcoming" && m.status !== "live" && !isRemovedGame(m.game));
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

    // Player leaderboard
    const playerAgg = new Map();
    filtered.forEach(m=>{
      const result = getResultCode(m);
      (m.players||[]).forEach(p=>{
        const key = p.playerId || p.pseudo;
        if (!key) return;
        const entry = playerAgg.get(key) || { id: p.playerId, pseudo: p.pseudo, played:0, wins:0, mvp:0 };
        entry.played++;
        if (result==="W") entry.wins++;
        if (m.mvp && (m.mvp===p.playerId || m.mvp===p.pseudo)) entry.mvp++;
        playerAgg.set(key, entry);
      });
    });
    const legacyLeaderboard = [...playerAgg.values()].map(p=>({
      ...p,
      winRate: p.played ? ((p.wins / p.played)*100).toFixed(1) : "0.0",
    })).sort((a,b)=> b.mvp - a.mvp || b.winRate - a.winRate || b.played - a.played).slice(0,20);
    const richPlayers = aggregatePlayers(filtered, roster);
    const leaderboard = richPlayers.length ? richPlayers.map((player) => ({ ...player.stats, id: player.id, pseudo: player.pseudo, player })).slice(0, 20) : legacyLeaderboard;

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

    return { total, wins, losses, draws, winRate, avgUs, avgThem, currentStreak, currentType, bestStreak, perGame, perMap, leaderboard, richPlayers, evolution, competitions };
  }, [filtered, roster]);

  const firstCompared = stats?.richPlayers.find((player) => player.id === compareA) || stats?.richPlayers[0];
  const secondCompared = stats?.richPlayers.find((player) => player.id === compareB) || stats?.richPlayers[1];
  const radarData = firstCompared && secondCompared ? Object.entries({ winRate: "Win rate", experience: "Expérience", mvp: "MVP", goals: "Buts", points: "Points" }).map(([key, label]) => ({ metric: label, first: radarValues(firstCompared)[key], second: radarValues(secondCompared)[key] })) : [];
  const chartTooltipStyle = { background: "#1A1A1A", border: "1px solid rgba(216,202,130,.35)", color: "#f7f7f7" };

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("stats.title") }]} />
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="text-[#D8CA82]" size={20} />
            <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="stats-title">{t("stats.title")}</h1>
          </div>
          <p className="text-[#f7f7f7]/50 mt-4 tracking-wide">{t("stats.sub")}</p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4 mb-4" data-testid="stats-filters">
          <div>
            <label className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] block mb-1.5">{t("stats.filter.game")}</label>
            <select value={game} onChange={(e) => setGame(e.target.value)} className={selectCls} data-testid="stats-filter-game">
              <option value="all">{t("results.filter.all")}</option>
              {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] block mb-1.5">{t("stats.filter.period")}</label>
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
          <span className="text-xs uppercase tracking-widest text-[#c8c8c8]/60 mr-2 py-1">Raccourcis :</span>
          {[
            ["season2026","Saison 2026"],
            ["last30","30 derniers jours"],
            ["last90","90 derniers jours"],
            ["year","Année en cours"],
          ].map(([key,label])=>(
            <button key={key} onClick={()=> setPeriod(key)} data-testid={`stats-preset-${key}`}
              className={`text-xs border px-3 py-1.5 uppercase tracking-widest ${period===key ? "border-[#D8CA82] text-[#D8CA82] bg-[#D8CA82]/10" : "border-white/15 text-[#c8c8c8] hover:text-[#f7f7f7]"}`}>{label}</button>
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
              <div className="border border-[#D8CA82]/30 bg-[#D8CA82]/5 p-5 text-center">
                <p className="text-xs uppercase tracking-[0.25em] text-[#D8CA82]/80 mb-1">{t("stats.winRate")}</p>
                <p className="font-display font-black text-3xl text-[#D8CA82]">{stats.winRate}%</p>
              </div>
              <div className="border border-white/10 bg-[#1A1A1A] p-5 text-center">
                <p className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] mb-1">{t("stats.totalMatches")}</p>
                <p className="font-display font-black text-3xl text-[#f7f7f7]">{stats.total}</p>
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
              <div className="border border-white/10 bg-[#1A1A1A] p-5 text-center">
                <p className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] mb-1">{t("stats.draws")}</p>
                <p className="font-display font-black text-3xl text-[#f7f7f7]">{stats.draws}</p>
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
                  ) : stats.currentType === "L" ? (
                    <Skull size={20} className="text-red-300" aria-hidden="true" />
                  ) : (
                    <span className="text-[#c8c8c8]" aria-hidden="true">=</span>
                  )}
                  <span className={stats.currentType === "W" ? "text-emerald-300" : stats.currentType === "L" ? "text-red-300" : "text-[#c8c8c8]"}>
                    {stats.currentStreak} {stats.currentType === "W" ? t("stats.series.wins") : stats.currentType === "L" ? t("stats.series.losses") : t("stats.draws").toLowerCase()}
                  </span>
                </p>
                <div className="mt-4 pt-4 border-t border-white/10">
                  <p className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] mb-1">{t("stats.bestStreak")}</p>
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
                    <p className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] mb-1">Elysium</p>
                    <p className="font-display font-black text-2xl text-[#D8CA82]">{stats.avgUs}</p>
                  </div>
                  <span className="text-[#c8c8c8] text-2xl">—</span>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] mb-1">{t("common.adversary")}</p>
                    <p className="font-display font-black text-2xl text-[#f7f7f7]">{stats.avgThem}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Real data visualisations */}
            <div className="grid lg:grid-cols-2 gap-6 mb-12" data-testid="stats-charts">
              <div className="border border-white/10 bg-[#1A1A1A] p-5">
                <h3 className="font-display text-sm uppercase tracking-[0.25em] text-[#f7f7f7] mb-5">Évolution du win rate</h3>
                <div className="h-72" aria-label="Graphique d'évolution du win rate">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.evolution} margin={{ left: -20, right: 12 }}><CartesianGrid stroke="rgba(255,255,255,.08)" strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fill: "#c8c8c8", fontSize: 10 }} minTickGap={28} /><YAxis domain={[0, 100]} tick={{ fill: "#c8c8c8", fontSize: 10 }} /><Tooltip contentStyle={chartTooltipStyle} formatter={(value) => [`${value}%`, "Win rate"]} /><Line type="monotone" dataKey="winRate" stroke="#D8CA82" strokeWidth={3} dot={{ fill: "#D8CA82", r: 3 }} activeDot={{ r: 6 }} /></LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="border border-white/10 bg-[#1A1A1A] p-5">
                <h3 className="font-display text-sm uppercase tracking-[0.25em] text-[#f7f7f7] mb-5">Répartition par compétition</h3>
                <div className="h-72" aria-label="Graphique de répartition par compétition">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart><Pie data={stats.competitions} dataKey="value" nameKey="name" innerRadius={52} outerRadius={88} paddingAngle={2}>{stats.competitions.map((entry, index) => <Cell key={entry.name} fill={["#D8CA82", "#F4511E", "#67e8f9", "#a7f3d0", "#c4b5fd"][index % 5]} />)}</Pie><Tooltip contentStyle={chartTooltipStyle} /><Legend wrapperStyle={{ fontSize: 11, color: "#c8c8c8" }} /></PieChart>
                  </ResponsiveContainer>
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
                      <span className="text-xs uppercase tracking-[0.25em] text-[#D8CA82]">{pg.total} {t("stats.totalMatches").toLowerCase()}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="h-2 bg-white/10 overflow-hidden">
                          <div className="h-full bg-[#D8CA82]" style={{ width: `${pg.winRate}%` }} />
                        </div>
                      </div>
                      <span className="font-display font-bold text-[#D8CA82]">{pg.winRate}%</span>
                    </div>
                    <p className="text-xs text-[#c8c8c8] mt-2">{pg.wins}W – {pg.losses}L{pg.draws ? ` – ${pg.draws}D` : ""}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Per Map */}
            {stats.perMap.length>0 && (
              <div className="mb-12" data-testid="stats-per-map">
                <div className="flex items-center gap-3 mb-6">
                  <MapIcon className="text-[#D8CA82]" size={16} />
                  <h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">Win rate par map / manche</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-1 mb-4" data-testid="stats-round-heatmap" aria-label="Heatmap des manches">
                  {stats.perMap.map((map) => {
                    const rate = Number(map.winRate);
                    const background = rate >= 60 ? `rgba(110,231,183,${0.18 + rate / 180})` : rate < 40 ? `rgba(252,165,165,${0.18 + (100 - rate) / 180})` : "rgba(216,202,130,.22)";
                    return <div key={map.name} style={{ background }} className="min-h-20 p-3 border border-white/10 flex flex-col justify-between" title={`${map.played} manches · ${map.winRate}%`}><span className="text-xs text-[#f7f7f7] truncate">{map.name}</span><span className="font-display font-black text-lg text-[#f7f7f7]">{map.winRate}%</span></div>;
                  })}
                </div>
                <div className="border border-white/10 bg-[#1A1A1A] overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-[#c8c8c8] uppercase tracking-widest border-b border-white/10">
                      <tr><th className="text-left py-2 px-4">Map</th><th className="text-center">Jouées</th><th className="text-center">V</th><th className="text-center">D</th><th className="text-right px-4">Win rate</th></tr>
                    </thead>
                    <tbody>
                      {stats.perMap.map(m=>(
                        <tr key={m.name} className="border-t border-white/5">
                          <td className="py-2 px-4 text-[#f7f7f7]">{m.name}</td>
                          <td className="text-center text-[#c8c8c8]">{m.played}</td>
                          <td className="text-center text-emerald-300">{m.wins}</td>
                          <td className="text-center text-red-300">{m.losses}</td>
                          <td className="text-right px-4 font-bold text-[#D8CA82]">{m.winRate}%</td>
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
                  <Award className="text-[#D8CA82]" size={16} />
                  <h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">{t("stats.leaderboard")}</h3>
                </div>
                <p className="text-xs text-[#c8c8c8] mb-3">{t("stats.leaderboard.sub")}</p>
                <div className="border border-white/10 bg-[#1A1A1A] overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-[#c8c8c8] uppercase tracking-widest border-b border-white/10">
                      <tr><th className="text-left py-2 px-4">Joueur</th><th className="text-center">Matchs</th><th className="text-center">V / D</th><th className="text-center">Win rate</th><th className="text-center">MVP</th><th className="text-center">Buts</th><th className="text-center">Points</th></tr>
                    </thead>
                    <tbody>
                      {stats.leaderboard.map((p,i)=>(
                        <tr key={p.id||p.pseudo||i} className="border-t border-white/5">
                          <td className="py-2 px-4 text-[#f7f7f7]"><span className="text-[#c8c8c8] mr-2">{i+1}.</span>{p.id ? <Link to={`/equipe/${p.id}`} className="hover:text-[#D8CA82] hover:underline">{p.pseudo}</Link> : p.pseudo}</td>
                          <td className="text-center text-[#c8c8c8]">{p.played}</td>
                          <td className="text-center"><span className="text-emerald-300">{p.wins}</span> / <span className="text-red-300">{p.losses ?? "—"}</span></td>
                          <td className="text-center font-bold text-[#D8CA82]">{p.winRate}%</td>
                          <td className="text-center text-[#D8CA82]">{p.mvp>0 ? `${p.mvp}×` : "—"}</td>
                          <td className="text-center text-[#c8c8c8]">{p.goals ?? "—"}</td>
                          <td className="text-center text-[#c8c8c8]">{p.points ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Player comparator */}
            {stats.richPlayers.length > 1 && (
              <div className="mb-12 border border-[#D8CA82]/25 bg-[#141414] p-5 sm:p-7" data-testid="player-comparator">
                <div className="flex items-center gap-3 mb-6"><Users className="text-[#D8CA82]" size={17} /><h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">Comparateur de joueurs</h3></div>
                <div className="grid sm:grid-cols-2 gap-4 mb-6">
                  {[{ value: firstCompared?.id || "", setter: setCompareA, exclude: secondCompared?.id }, { value: secondCompared?.id || "", setter: setCompareB, exclude: firstCompared?.id }].map((select, index) => <select key={index} value={select.value} onChange={(e) => select.setter(e.target.value)} className={selectCls} aria-label={`Joueur ${index + 1}`}>{stats.richPlayers.filter((player) => player.id !== select.exclude || player.id === select.value).map((player) => <option key={player.id} value={player.id}>{player.pseudo}</option>)}</select>)}
                </div>
                <div className="grid lg:grid-cols-[1fr_1.25fr_1fr] gap-5 items-center">
                  {[firstCompared, secondCompared].map((player, index) => player && <div key={player.id} className={`border border-white/10 bg-[#1A1A1A] p-5 ${index === 1 ? "lg:col-start-3" : ""}`}>
                    <Link to={`/equipe/${player.id}`} className="font-display font-black text-xl text-[#f7f7f7] hover:text-[#D8CA82]">{player.pseudo}</Link>
                    <p className="text-xs uppercase tracking-widest text-[#D8CA82] mt-1">{player.game}{player.ingameRole ? ` · ${player.ingameRole}` : ""}</p>
                    <dl className="grid grid-cols-2 gap-3 mt-5 text-xs"><div><dt className="text-[#c8c8c8]">Matchs</dt><dd className="text-lg text-[#f7f7f7] font-bold">{player.stats.played}</dd></div><div><dt className="text-[#c8c8c8]">Win rate</dt><dd className="text-lg text-[#D8CA82] font-bold">{player.stats.winRate}%</dd></div><div><dt className="text-[#c8c8c8]">MVP</dt><dd className="text-lg text-[#f7f7f7] font-bold">{player.stats.mvp}</dd></div><div><dt className="text-[#c8c8c8]">Buts / match</dt><dd className="text-lg text-[#f7f7f7] font-bold">{player.stats.goalsPerMatch}</dd></div></dl>
                    {player.palmares && <div className="mt-4 pt-4 border-t border-white/10"><p className="text-[10px] uppercase tracking-widest text-[#c8c8c8] mb-2">Palmarès</p><p className="text-xs text-[#f7f7f7]/80 whitespace-pre-line line-clamp-4">{player.palmares}</p></div>}
                  </div>)}
                  <div className="h-72 lg:col-start-2 lg:row-start-1" aria-label="Radar de comparaison des joueurs"><ResponsiveContainer width="100%" height="100%"><RadarChart data={radarData}><PolarGrid stroke="rgba(255,255,255,.2)" /><PolarAngleAxis dataKey="metric" tick={{ fill: "#c8c8c8", fontSize: 10 }} /><Radar name={firstCompared?.pseudo} dataKey="first" stroke="#D8CA82" fill="#D8CA82" fillOpacity={0.25} /><Radar name={secondCompared?.pseudo} dataKey="second" stroke="#F4511E" fill="#F4511E" fillOpacity={0.2} /><Legend wrapperStyle={{ fontSize: 11 }} /><Tooltip contentStyle={chartTooltipStyle} /></RadarChart></ResponsiveContainer></div>
                </div>
              </div>
            )}

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
