import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { GAMES, ROSTERS } from "../lib/constants";
import { MatchCard } from "../components/MatchCard";
import { BarChart3, TrendingUp, Trophy, Target, Calendar, Flame, Skull, Users, Map as MapIcon } from "lucide-react";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { parseMaps } from "../lib/matchUtils";

const selectCls = "bg-[#1A1A1A] border border-white/20 px-3 py-2 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

const getPeriodStart = (period) => {
  const now = new Date();
  if (period === "month") { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); }
  if (period === "quarter") { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); }
  if (period === "year") return `${now.getFullYear()}-01-01`;
  return "";
};

export default function Stats() {
  const { t } = useLang();
  const [matches, setMatches] = useState(null);
  const [rosterMembers, setRosterMembers] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [game, setGame] = useState("all");
  const [roster, setRoster] = useState("all");
  const [competition, setCompetition] = useState("all");
  const [season, setSeason] = useState("all");
  const [period, setPeriod] = useState("all");

  useEffect(() => {
    setError(false); setMatches(null);
    const unsubs = [
      onSnapshot(collection(db, "matches"), (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.status !== "upcoming" && m.status !== "live");
        list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setMatches(list);
      }, (e) => { console.error(e); setError(true); }),
      onSnapshot(collection(db, "roster"), (s) => setRosterMembers(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "competitions"), (s) => setCompetitions(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [retryKey]);

  const rosterOptions = useMemo(() => game === "all" ? [] : (ROSTERS[game] || []), [game]);

  const filtered = useMemo(() => {
    if (!matches) return [];
    let list = matches;
    if (game !== "all") list = list.filter((m) => m.game === game);
    if (roster !== "all") list = list.filter((m) => m.roster === roster);
    if (competition !== "all") list = list.filter((m) => m.competitionId === competition || m.competition === competition);
    if (season !== "all") {
      // season filter via competition season or match date year
      list = list.filter((m) => {
        if (m.competitionId) {
          const comp = competitions.find((c) => c.id === m.competitionId);
          if (comp?.season) return String(comp.season) === String(season);
        }
        return (m.date || "").startsWith(String(season));
      });
    }
    const periodStart = getPeriodStart(period);
    if (periodStart) list = list.filter((m) => (m.date || "") >= periodStart);
    return list;
  }, [matches, game, roster, competition, season, period, competitions]);

  const seasons = useMemo(() => {
    const set = new Set();
    (matches || []).forEach((m) => {
      if (m.date) set.add(m.date.slice(0, 4));
      if (m.competitionId) {
        const comp = competitions.find((c) => c.id === m.competitionId);
        if (comp?.season) set.add(String(comp.season));
      }
    });
    return Array.from(set).sort().reverse();
  }, [matches, competitions]);

  const stats = useMemo(() => {
    const total = filtered.length;
    if (total === 0) return null;
    const getResultCode = (m) => {
      const us = Number(m.scoreUs); const them = Number(m.scoreThem);
      if (us > them) return "W"; if (us < them) return "L"; return "D";
    };
    const wins = filtered.filter((m) => getResultCode(m) === "W").length;
    const losses = filtered.filter((m) => getResultCode(m) === "L").length;
    const draws = total - wins - losses;
    const winRate = ((wins / total) * 100).toFixed(1);
    const avgUs = (filtered.reduce((sum, m) => sum + (Number(m.scoreUs) || 0), 0) / total).toFixed(1);
    const avgThem = (filtered.reduce((sum, m) => sum + (Number(m.scoreThem) || 0), 0) / total).toFixed(1);
    let currentStreak = 0; let currentType = "";
    for (const m of filtered) {
      const rt = getResultCode(m);
      if (currentType === "") currentType = rt;
      if (rt === currentType) currentStreak++; else break;
    }
    // best streak
    let bestStreak = 0; let streak = 0;
    for (let i = filtered.length - 1; i >= 0; i--) {
      const rt = getResultCode(filtered[i]);
      if (rt === "W") { streak++; if (streak > bestStreak) bestStreak = streak; } else streak = 0;
    }
    const perGame = GAMES.map((g) => {
      const gm = filtered.filter((m) => m.game === g);
      const gw = gm.filter((m) => getResultCode(m) === "W").length;
      const gl = gm.filter((m) => getResultCode(m) === "L").length;
      const gd = gm.length - gw - gl;
      return { game: g, total: gm.length, wins: gw, losses: gl, draws: gd, winRate: gm.length ? ((gw / gm.length) * 100).toFixed(1) : "0.0" };
    });
    // per map stats
    const allMaps = filtered.flatMap((m) => parseMaps(m.maps || []));
    const mapsWon = allMaps.filter((m)=> Number(m.scoreUs) > Number(m.scoreThem)).length;
    const mapsLost = allMaps.filter((m)=> Number(m.scoreThem) > Number(m.scoreUs)).length;
    // per map/mode breakdown
    const perMap = {};
    allMaps.forEach((m)=>{
      const key = m.map || m.name || "Inconnu";
      if (!perMap[key]) perMap[key] = { map: key, total:0, wins:0, losses:0 };
      perMap[key].total +=1;
      if (Number(m.scoreUs) > Number(m.scoreThem)) perMap[key].wins +=1;
      else if (Number(m.scoreThem) > Number(m.scoreUs)) perMap[key].losses +=1;
    });
    const perMapList = Object.values(perMap).sort((a,b)=> b.total - a.total).slice(0,8);
    // player stats from compositions
    const playerMap = {};
    filtered.forEach((m)=>{
      const result = getResultCode(m);
      (m.players||[]).forEach((p)=>{
        const id = p.playerId || p.pseudo;
        if (!id) return;
        if (!playerMap[id]) playerMap[id] = { id, pseudo: p.pseudo || id, total:0, wins:0, losses:0 };
        playerMap[id].total +=1;
        if (result==="W") playerMap[id].wins+=1;
        else if (result==="L") playerMap[id].losses+=1;
      });
    });
    const playerStats = Object.values(playerMap).map((pl)=> ({ ...pl, winRate: pl.total ? ((pl.wins/pl.total)*100).toFixed(1) : "0.0" })).sort((a,b)=> b.total - a.total || b.winRate - a.winRate).slice(0,12);
    // form last 5 / 10
    const form5 = filtered.slice(0,5).map(getResultCode);
    const form10 = filtered.slice(0,10).map(getResultCode);
    const lastUpdated = filtered[0]?.updatedAt?.toDate ? filtered[0].updatedAt.toDate().toLocaleString() : filtered[0]?.date || "—";
    return { total, wins, losses, draws, winRate, avgUs, avgThem, currentStreak, currentType, bestStreak, perGame, mapsWon, mapsLost, perMapList, playerStats, form5, form10, lastUpdated, allMapsTotal: allMaps.length };
  }, [filtered]);

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("stats.title") }]} />
          <div className="flex items-center gap-3 mb-2"><BarChart3 className="text-[#D8CA82]" size={20} /><h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="stats-title">{t("stats.title")}</h1></div>
          <p className="text-[#f7f7f7]/50 mt-4 tracking-wide">{t("stats.sub")}</p>
          <p className="text-[11px] text-[#f7f7f7]/30 mt-2">Source : matchs officiels saisis · Dernière mise à jour : {stats?.lastUpdated || "—"}</p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        <div className="flex flex-wrap items-end gap-4 mb-10" data-testid="stats-filters">
          <div><label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 block mb-1.5">{t("stats.filter.game")}</label><select value={game} onChange={(e) => { setGame(e.target.value); setRoster("all"); }} className={selectCls} data-testid="stats-filter-game"><option value="all">{t("results.filter.all")}</option>{GAMES.map((g) => <option key={g} value={g}>{g}</option>)}</select></div>
          {rosterOptions.length>0 && <div><label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 block mb-1.5">Roster</label><select value={roster} onChange={(e)=>setRoster(e.target.value)} className={selectCls} data-testid="stats-filter-roster"><option value="all">Tous</option>{rosterOptions.map((r)=><option key={r} value={r}>{r}</option>)}</select></div>}
          <div><label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 block mb-1.5">{t("stats.filter.period")}</label><select value={period} onChange={(e) => setPeriod(e.target.value)} className={selectCls} data-testid="stats-filter-period"><option value="all">{t("stats.period.all")}</option><option value="month">{t("stats.period.month")}</option><option value="quarter">{t("stats.period.quarter")}</option><option value="year">{t("stats.period.year")}</option></select></div>
          <div><label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 block mb-1.5">Compétition</label><select value={competition} onChange={(e)=>setCompetition(e.target.value)} className={selectCls} data-testid="stats-filter-competition"><option value="all">Toutes</option>{competitions.map((c)=><option key={c.id} value={c.id}>{c.name} {c.season?`(${c.season})`:""}</option>)}</select></div>
          <div><label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 block mb-1.5">Saison</label><select value={season} onChange={(e)=>setSeason(e.target.value)} className={selectCls} data-testid="stats-filter-season"><option value="all">Toutes</option>{seasons.map((s)=><option key={s} value={s}>{s}</option>)}</select></div>
        </div>

        {error ? <ErrorState onRetry={() => setRetryKey((k) => k + 1)} testId="stats-error" /> : matches === null ? <LoadingState testId="stats-loading" /> : stats === null ? <EmptyState icon={Trophy} text={t("stats.empty")} testId="stats-empty" /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8" data-testid="stats-kpis">
              <div className="border border-[#D8CA82]/30 bg-[#D8CA82]/5 p-5 text-center"><p className="text-[10px] uppercase tracking-[0.25em] text-[#D8CA82]/80 mb-1">{t("stats.winRate")}</p><p className="font-display font-black text-3xl text-[#D8CA82]">{stats.winRate}%</p></div>
              <div className="border border-white/10 bg-[#1A1A1A] p-5 text-center"><p className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] mb-1">{t("stats.totalMatches")}</p><p className="font-display font-black text-3xl text-[#f7f7f7]">{stats.total}</p></div>
              <div className="border border-emerald-300/40 bg-emerald-300/5 p-5 text-center"><p className="text-[10px] uppercase tracking-[0.25em] text-emerald-300 mb-1 flex items-center justify-center gap-1.5"><Trophy size={11} />{t("stats.wins")}</p><p className="font-display font-black text-3xl text-emerald-300">{stats.wins}</p></div>
              <div className="border border-red-300/40 bg-red-300/5 p-5 text-center"><p className="text-[10px] uppercase tracking-[0.25em] text-red-300 mb-1 flex items-center justify-center gap-1.5"><Skull size={11} />{t("stats.losses")}</p><p className="font-display font-black text-3xl text-red-300">{stats.losses}</p></div>
              <div className="border border-white/10 bg-[#1A1A1A] p-5 text-center"><p className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] mb-1">{t("stats.draws")}</p><p className="font-display font-black text-3xl text-[#f7f7f7]">{stats.draws}</p></div>
              <div className="border border-white/10 bg-[#1A1A1A] p-5 text-center"><p className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] mb-1">Manches</p><p className="font-display font-black text-lg text-[#f7f7f7]">{stats.mapsWon}W – {stats.mapsLost}L <span className="text-[#f7f7f7]/40 text-sm">/ {stats.allMapsTotal}</span></p></div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="border border-white/10 bg-[#1A1A1A] p-6" data-testid="stats-form">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-3">Forme</p>
                <div className="flex gap-6">
                  <div><p className="text-xs text-[#f7f7f7]/40 mb-1">5 derniers</p><div className="flex gap-1">{stats.form5.map((c,i)=> <span key={i} className={`h-6 w-6 flex items-center justify-center text-xs font-bold border ${c==="W"?"bg-emerald-300/20 border-emerald-300/40 text-emerald-300":c==="L"?"bg-red-300/20 border-red-300/40 text-red-300":"bg-white/5 border-white/10 text-[#f7f7f7]/40"}`}>{c}</span>)}</div></div>
                  <div><p className="text-xs text-[#f7f7f7]/40 mb-1">10 derniers</p><div className="flex gap-1 flex-wrap">{stats.form10.map((c,i)=> <span key={i} className={`h-6 w-6 flex items-center justify-center text-xs font-bold border ${c==="W"?"bg-emerald-300/20 border-emerald-300/40 text-emerald-300":c==="L"?"bg-red-300/20 border-red-300/40 text-red-300":"bg-white/5 border-white/10 text-[#f7f7f7]/40"}`}>{c}</span>)}</div></div>
                </div>
              </div>
              <div className="border border-white/10 bg-[#1A1A1A] p-6" data-testid="stats-streaks">
                <div className="flex items-center gap-3 mb-4"><Flame className="text-[#D8CA82]" size={16} /><h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">{t("stats.currentStreak")}</h3></div>
                <p className="font-display font-black text-2xl flex items-center gap-2">{stats.currentType === "W" ? <Trophy size={20} className="text-emerald-300" /> : stats.currentType === "L" ? <Skull size={20} className="text-red-300" /> : <span className="text-[#c8c8c8]">=</span>}<span className={stats.currentType === "W" ? "text-emerald-300" : stats.currentType === "L" ? "text-red-300" : "text-[#c8c8c8]"}>{stats.currentStreak} {stats.currentType === "W" ? t("stats.series.wins") : stats.currentType === "L" ? t("stats.series.losses") : t("stats.draws").toLowerCase()}</span></p>
                <div className="mt-4 pt-4 border-t border-white/10"><p className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-1">{t("stats.bestStreak")}</p><p className="font-display font-bold text-xl text-[#D8CA82]">{stats.bestStreak} {t("stats.series.wins")}</p></div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-12">
              <div className="border border-white/10 bg-[#1A1A1A] p-6" data-testid="stats-avg">
                <div className="flex items-center gap-3 mb-4"><Target className="text-[#D8CA82]" size={16} /><h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">{t("stats.avgScore")}</h3></div>
                <div className="flex items-center gap-6"><div><p className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-1">Elysium</p><p className="font-display font-black text-2xl text-[#D8CA82]">{stats.avgUs}</p></div><span className="text-[#f7f7f7]/20 text-2xl">—</span><div><p className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-1">Adversaire</p><p className="font-display font-black text-2xl text-[#f7f7f7]">{stats.avgThem}</p></div></div>
              </div>
              <div className="border border-white/10 bg-[#1A1A1A] p-6" data-testid="stats-per-map">
                <div className="flex items-center gap-3 mb-4"><MapIcon className="text-[#D8CA82]" size={16} /><h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">Par carte / mode</h3></div>
                {stats.perMapList.length===0 ? <p className="text-xs text-[#f7f7f7]/40">Aucune donnée manche renseignée.</p> : <div className="space-y-2">{stats.perMapList.map((pm)=> <div key={pm.map} className="flex items-center justify-between border border-white/5 bg-[#111111] px-3 py-2"><span className="text-xs text-[#f7f7f7]">{pm.map}</span><span className="text-xs text-[#f7f7f7]/60">{pm.wins}W – {pm.losses}L / {pm.total}</span></div>)}</div>}
              </div>
            </div>

            <div className="mb-12" data-testid="stats-per-game">
              <div className="flex items-center gap-3 mb-6"><TrendingUp className="text-[#D8CA82]" size={16} /><h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">{t("stats.perGame")}</h3></div>
              <div className="grid sm:grid-cols-2 gap-4">{stats.perGame.map((pg) => (<div key={pg.game} className="border border-white/10 bg-[#1A1A1A] p-5"><div className="flex items-center justify-between mb-3"><p className="font-display font-bold text-[#f7f7f7]">{pg.game}</p><span className="text-[10px] uppercase tracking-[0.25em] text-[#D8CA82]">{pg.total} {t("stats.totalMatches").toLowerCase()}</span></div><div className="flex items-center gap-4"><div className="flex-1"><div className="h-2 bg-white/10 overflow-hidden"><div className="h-full bg-[#D8CA82]" style={{ width: `${pg.winRate}%` }} /></div></div><span className="font-display font-bold text-[#D8CA82]">{pg.winRate}%</span></div><p className="text-xs text-[#f7f7f7]/40 mt-2">{pg.wins}W – {pg.losses}L{pg.draws ? ` – ${pg.draws}D` : ""}</p></div>))}</div>
            </div>

            <div className="mb-12" data-testid="stats-players">
              <div className="flex items-center gap-3 mb-6"><Users className="text-[#D8CA82]" size={16} /><h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">Fiches joueurs (compositions saisies)</h3></div>
              {stats.playerStats.length===0 ? <p className="text-xs text-[#f7f7f7]/40 border border-white/10 bg-[#1A1A1A] p-6">Aucune composition renseignée — les fiches joueurs s'alimentent depuis le champ “Joueurs participants” des matchs.</p> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{stats.playerStats.map((pl)=> <div key={pl.id} className="border border-white/10 bg-[#1A1A1A] p-4 flex items-center justify-between"><div><p className="text-sm font-bold text-[#f7f7f7]">{pl.pseudo}</p><p className="text-xs text-[#f7f7f7]/40">{pl.total} matchs · {pl.wins}W – {pl.losses}L</p></div><span className="font-display font-black text-[#D8CA82]">{pl.winRate}%</span></div>)}</div>}
              <p className="text-[11px] text-[#f7f7f7]/30 mt-3">Ne pas afficher de KPI “joueur du mois” sans données fiables — seuil minimal 5 matchs.</p>
            </div>

            <div data-testid="stats-history">
              <div className="flex items-center gap-3 mb-6"><Calendar className="text-[#D8CA82]" size={16} /><h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">{t("stats.history")}</h3></div>
              {filtered.length === 0 ? <EmptyState icon={Calendar} text={t("stats.noHistory")} testId="stats-history-empty" /> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{filtered.slice(0, 12).map((m) => <MatchCard key={m.id} match={m} />)}</div>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
