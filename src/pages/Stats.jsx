import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { GAMES, getElysiumTeamName } from "../lib/constants";
import { MatchCard } from "../components/MatchCard";
import { BarChart3, TrendingUp, Trophy, Target, Calendar, CalendarClock, ArrowRight, Flame, Skull } from "lucide-react";
import { PageBreadcrumb } from "../components/PageBreadcrumb";

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

  // Chargement en temps réel des matchs passés (finis) — alimente les KPIs.
  // Les matchs à venir sont exclus car ils n'ont pas encore de score.
  useEffect(() => {
    setError(false);
    setMatches(null);
    return onSnapshot(
      collection(db, "matches"),
      (snap) => {
        const list = snap
          .docs.map((d) => ({ id: d.id, ...d.data() }))
          .filter((m) => m.status !== "upcoming" && m.status !== "live");
        list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setMatches(list);
      },
      (e) => {
        console.error(e);
        setError(true);
      }
    );
  }, [retryKey]);

  // Matchs à venir — lecture ponctuelle au montage, pas d'abonnement continu.
  // Cette section est un rappel visuel vers /calendrier ; les données fraîches
  // sont déjà disponibles sur la page calendrier qui écoute en temps réel.
  const upcomingMatches = useMemo(() => {
    if (!matches) return [];
    return matches
      .filter((m) => m.status === "upcoming")
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [matches]);

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
      return {
        game: g,
        total: gm.length,
        wins: gw,
        losses: gl,
        draws: gd,
        winRate: gm.length ? ((gw / gm.length) * 100).toFixed(1) : "0.0",
      };
    });

    return { total, wins, losses, draws, winRate, avgUs, avgThem, currentStreak, currentType, bestStreak, perGame };
  }, [filtered]);

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("stats.title") }]} />
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="text-[#D8CA82]" size={20} />
            <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="stats-title">
              {t("stats.title")}
            </h1>
          </div>
          <p className="text-[#f7f7f7]/50 mt-4 tracking-wide">{t("stats.sub")}</p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        {/* Filtres */}
        <div className="flex flex-wrap items-end gap-4 mb-10" data-testid="stats-filters">
          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 block mb-1.5">
              {t("stats.filter.game")}
            </label>
            <select value={game} onChange={(e) => setGame(e.target.value)} className={selectCls} data-testid="stats-filter-game">
              <option value="all">{t("results.filter.all")}</option>
              {GAMES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 block mb-1.5">
              {t("stats.filter.period")}
            </label>
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
        ) : (
          <>
            {/* ── MATCHES À VENIR ───────────────────────────────────────────── */}
            {upcomingMatches.length > 0 && (
              <div className="border border-sky-400/40 bg-sky-400/5 px-5 py-4 mb-8 flex items-center flex-wrap gap-4" data-testid="stats-upcoming">
                <CalendarClock size={16} className="text-sky-300 shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-display uppercase tracking-[0.3em] text-sky-300 mb-1">
                    {t("home.proof.nextMatch")}
                  </p>
                  <p className="text-sm text-[#f7f7f7]">
                    {upcomingMatches.slice(0, 3).map((m, i) => (
                      <span key={m.id}>
                        {i > 0 && <span className="text-[#a0a0a0]"> · </span>}
                        <span className="font-semibold text-[#f7f7f7]">
                          {getElysiumTeamName(m.roster)}
                        </span>{" "}
                        <span className="text-[#c8c8c8]">{m.opponentName || "TBD"}</span>
                        <span className="text-[#a0a0a0] text-xs">
                          {" "}
                          {m.date} {m.time ? m.time : ""}
                        </span>
                      </span>
                    ))}
                    {upcomingMatches.length > 3 && (
                      <span className="text-[#a0a0a0] text-xs ml-1">
                        +{upcomingMatches.length - 3} autres
                      </span>
                    )}
                  </p>
                </div>
                <Link
                  to="/calendrier"
                  className="shrink-0 inline-flex items-center gap-1.5 bg-[#D8CA82] text-[#111111] text-[10px] font-display font-bold uppercase tracking-widest px-3 py-2 hover:shadow-[0_0_12px_rgba(216,202,130,0.4)] transition-shadow focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
                >
                  {t("nav.calendar")} <ArrowRight size={12} aria-hidden="true" />
                </Link>
              </div>
            )}

            {/* ── KPIs (matchs passés uniquement) ───────────────────────────── */}
            {stats ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-12" data-testid="stats-kpis">
                  <div className="border border-[#D8CA82]/30 bg-[#D8CA82]/5 p-5 text-center">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-[#D8CA82]/80 mb-1">
                      {t("stats.winRate")}
                    </p>
                    <p className="font-display font-black text-3xl text-[#D8CA82]">
                      {stats.winRate}%
                    </p>
                  </div>
                  <div className="border border-white/10 bg-[#1A1A1A] p-5 text-center">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] mb-1">
                      {t("stats.totalMatches")}
                    </p>
                    <p className="font-display font-black text-3xl text-[#f7f7f7]">
                      {stats.total}
                    </p>
                  </div>
                  <div className="border border-emerald-300/40 bg-emerald-300/5 p-5 text-center">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-300 mb-1 flex items-center justify-center gap-1.5">
                      <Trophy size={11} aria-hidden="true" />
                      {t("stats.wins")}
                    </p>
                    <p className="font-display font-black text-3xl text-emerald-300">
                      {stats.wins}
                    </p>
                  </div>
                  <div className="border border-red-300/40 bg-red-300/5 p-5 text-center">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-red-300 mb-1 flex items-center justify-center gap-1.5">
                      <Skull size={11} aria-hidden="true" />
                      {t("stats.losses")}
                    </p>
                    <p className="font-display font-black text-3xl text-red-300">
                      {stats.losses}
                    </p>
                  </div>
                  <div className="border border-white/10 bg-[#1A1A1A] p-5 text-center">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] mb-1">
                      {t("stats.draws")}
                    </p>
                    <p className="font-display font-black text-3xl text-[#f7f7f7]">
                      {stats.draws}
                    </p>
                  </div>
                </div>

                {/* Streaks & Avg Score */}
                <div className="grid md:grid-cols-2 gap-6 mb-12">
                  <div className="border border-white/10 bg-[#1A1A1A] p-6" data-testid="stats-streaks">
                    <div className="flex items-center gap-3 mb-4">
                      <Flame className="text-[#D8CA82]" size={16} />
                      <h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">
                        {t("stats.currentStreak")}
                      </h3>
                    </div>
                    <p className="font-display font-black text-2xl flex items-center gap-2">
                      {stats.currentType === "W" ? (
                        <Trophy size={20} className="text-emerald-300" aria-hidden="true" />
                      ) : stats.currentType === "L" ? (
                        <Skull size={20} className="text-red-300" aria-hidden="true" />
                      ) : (
                        <span className="text-[#c8c8c8]" aria-hidden="true">
                          =
                        </span>
                      )}
                      <span
                        className={
                          stats.currentType === "W"
                            ? "text-emerald-300"
                            : stats.currentType === "L"
                            ? "text-red-300"
                            : "text-[#c8c8c8]"
                        }
                      >
                        {stats.currentStreak}{" "}
                        {stats.currentType === "W"
                          ? t("stats.series.wins")
                          : stats.currentType === "L"
                          ? t("stats.series.losses")
                          : t("stats.draws").toLowerCase()}
                      </span>
                    </p>
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <p className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-1">
                        {t("stats.bestStreak")}
                      </p>
                      <p className="font-display font-bold text-xl text-[#D8CA82]">
                        {stats.bestStreak} {t("stats.series.wins")}
                      </p>
                    </div>
                  </div>
                  <div className="border border-white/10 bg-[#1A1A1A] p-6" data-testid="stats-avg">
                    <div className="flex items-center gap-3 mb-4">
                      <Target className="text-[#D8CA82]" size={16} />
                      <h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">
                        {t("stats.avgScore")}
                      </h3>
                    </div>
                    <div className="flex items-center gap-6">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-1">
                          Elysium
                        </p>
                        <p className="font-display font-black text-2xl text-[#D8CA82]">
                          {stats.avgUs}
                        </p>
                      </div>
                      <span className="text-[#f7f7f7]/20 text-2xl">—</span>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-1">
                          Adversaire
                        </p>
                        <p className="font-display font-black text-2xl text-[#f7f7f7]">
                          {stats.avgThem}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Per Game */}
                <div className="mb-12" data-testid="stats-per-game">
                  <div className="flex items-center gap-3 mb-6">
                    <TrendingUp className="text-[#D8CA82]" size={16} />
                    <h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">
                      {t("stats.perGame")}
                    </h3>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {stats.perGame.map((pg) => (
                      <div key={pg.game} className="border border-white/10 bg-[#1A1A1A] p-5">
                        <div className="flex items-center justify-between mb-3">
                          <p className="font-display font-bold text-[#f7f7f7]">{pg.game}</p>
                          <span className="text-[10px] uppercase tracking-[0.25em] text-[#D8CA82]">
                            {pg.total} {t("stats.totalMatches").toLowerCase()}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <div className="h-2 bg-white/10 overflow-hidden">
                              <div className="h-full bg-[#D8CA82]" style={{ width: `${pg.winRate}%` }} />
                            </div>
                          </div>
                          <span className="font-display font-bold text-[#D8CA82]">
                            {pg.winRate}%
                          </span>
                        </div>
                        <p className="text-xs text-[#f7f7f7]/40 mt-2">
                          {pg.wins}W – {pg.losses}L{pg.draws ? ` – ${pg.draws}D` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Match History */}
                <div data-testid="stats-history">
                  <div className="flex items-center gap-3 mb-6">
                    <Calendar className="text-[#D8CA82]" size={16} />
                    <h3 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">
                      {t("stats.history")}
                    </h3>
                  </div>
                  {filtered.length === 0 ? (
                    <EmptyState icon={Calendar} text={t("stats.noHistory")} testId="stats-history-empty" />
                  ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filtered.slice(0, 12).map((m) => (
                        <MatchCard key={m.id} match={m} />
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : upcomingMatches.length > 0 ? (
              /* Pas encore de matchs passés dans la période filtrée,
                 mais il y a des matchs à venir — on affiche le rappel
                 comme seul contenu statistics significatif. */
              <div className="border border-sky-400/40 bg-sky-400/5 px-5 py-8 text-center" data-testid="stats-pending-only">
                <CalendarClock size={24} className="mx-auto text-sky-300 mb-3" aria-hidden="true" />
                <p className="text-sm text-[#c8c8c8] mb-4">{t("stats.noHistory")}</p>
                <Link
                  to="/calendrier"
                  className="inline-flex items-center gap-1.5 bg-[#D8CA82] text-[#111111] text-xs font-display font-bold uppercase tracking-widest px-4 py-2.5 hover:shadow-[0_0_12px_rgba(216,202,130,0.4)] transition-shadow focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
                >
                  {t("nav.calendar")} <ArrowRight size={12} aria-hidden="true" />
                </Link>
              </div>
            ) : (
              /* Aucun match passé ET aucun match à venir dans la période */
              <EmptyState icon={Trophy} text={t("stats.empty")} testId="stats-empty" />
            )}
          </>
        )}
      </section>
    </div>
  );
}
