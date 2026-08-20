import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { MatchCard } from "../components/MatchCard";
import { MatchCountdown } from "../components/MatchCountdown";
import { HeadToHeadPanel } from "../components/HeadToHead";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { Trophy, CalendarClock, ChevronDown, CalendarDays } from "lucide-react";
import { GAMES, getElysiumTeamName } from "../lib/constants";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { SITE_URL, useSEO } from "../lib/useSEO";

const selectCls = "bg-[#1A1A1A] border border-white/20 px-3 py-2 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const PAGE_SIZE = 9;

export default function Results() {
  const { t } = useLang();
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "finished";
  const game = searchParams.get("game") || "all";
  const competition = searchParams.get("competition") || "all";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const setTab = (v) => { const p = new URLSearchParams(searchParams); p.set("tab", v); setSearchParams(p); };
  const setGame = (v) => { const p = new URLSearchParams(searchParams); v==="all" ? p.delete("game") : p.set("game", v); setSearchParams(p); };
  const setCompetition = (v) => { const p = new URLSearchParams(searchParams); v==="all" ? p.delete("competition") : p.set("competition", v); setSearchParams(p); };
  const setFrom = (v) => { const p = new URLSearchParams(searchParams); v ? p.set("from", v) : p.delete("from"); setSearchParams(p); };
  const setTo = (v) => { const p = new URLSearchParams(searchParams); v ? p.set("to", v) : p.delete("to"); setSearchParams(p); };
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setError(false);
    return onSnapshot(collection(db, "matches"), (snap) => {
      setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (e) => { console.error(e); setError(true); });
  }, [retryKey]);

  const competitions = useMemo(() => [...new Set((matches || []).map((m) => m.competition).filter(Boolean))], [matches]);

  // Matchs en direct — affichés en section dédiée, hors des onglets
  const liveMatches = useMemo(() => (matches || []).filter((m) => m.status === "live"), [matches]);

  // Prochain match (pour le compte à rebours)
  const nextMatch = useMemo(() => {
    const upcoming = (matches || []).filter((m) => m.status === "upcoming").sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    return upcoming[0] || null;
  }, [matches]);

  const filtered = useMemo(() => {
    let list = (matches || []).filter((m) => (tab === "upcoming" ? m.status === "upcoming" : m.status === "finished"));
    if (game !== "all") list = list.filter((m) => m.game === game);
    if (competition !== "all") list = list.filter((m) => m.competition === competition);
    if (from) list = list.filter((m) => (m.date || "") >= from);
    if (to) list = list.filter((m) => (m.date || "") <= to);
    list.sort((a, b) => tab === "upcoming" ? (a.date || "").localeCompare(b.date || "") : (b.date || "").localeCompare(a.date || ""));
    return list;
  }, [matches, tab, game, competition, from, to]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [tab, game, competition, from, to]);

  const sportsEventsJsonLd = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${SITE_URL}/resultats#matches`,
    name: "Matchs Elysium Esport",
    itemListElement: (matches || []).slice(0, 30).map((m, index) => {
      const teamName = getElysiumTeamName(m.roster);
      return {
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "SportsEvent",
          "@id": `${SITE_URL}/resultats#match-${m.id}`,
          name: `${teamName} vs ${m.opponentName || t("common.adversary")}`,
          startDate: m.date ? `${m.date}${m.time ? `T${m.time}` : ""}` : undefined,
          eventStatus: m.status === "upcoming" || m.status === "live" ? "https://schema.org/EventScheduled" : "https://schema.org/EventCompleted",
          sport: m.game || "Esport",
          competitor: [
            { "@type": "SportsTeam", name: teamName, memberOf: { "@id": `${SITE_URL}/#organization` } },
            { "@type": "SportsTeam", name: m.opponentName || t("common.adversary"), logo: m.opponentLogo },
          ],
          location: m.platform ? { "@type": "VirtualLocation", name: m.platform, url: m.watchUrl } : undefined,
        },
      };
    }),
  }), [matches]);

  useSEO({
    title: "Résultats & matchs — ELYSIUM Esport",
    description: "Calendrier des matchs Elysium, résultats, scores, VOD et liens live des compétitions EVA, Rocket League et Valorant.",
    url: "/resultats",
    jsonLd: sportsEventsJsonLd,
  });

  const resetFilters = () => { setSearchParams(new URLSearchParams()); };

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("results.title") }]} />
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="results-title">{t("results.title")}</h1>
          <p className="text-[#c8c8c8] mt-4 tracking-wide">{t("results.sub")}</p>
          <Link to="/calendrier" className="mt-4 inline-flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-[#D8CA82] hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]" data-testid="results-subscribe-link">
            <CalendarDays size={13} aria-hidden="true" /> {t("cal.subscribe.title")} →
          </Link>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        {/* Compte à rebours avant le prochain match + rappel */}
        {nextMatch && (
          <div className="border border-[#D8CA82]/30 bg-[#D8CA82]/5 px-5 py-4 mb-8 flex items-center flex-wrap gap-4" data-testid="results-next-countdown">
            <p className="font-display text-xs uppercase tracking-[0.3em] text-[#D8CA82]">
              {t("home.proof.nextMatch")} : {getElysiumTeamName(nextMatch.roster)} vs {nextMatch.opponentName}
            </p>
            <MatchCountdown match={nextMatch} testId="results-countdown" />
          </div>
        )}

        {/* Matchs en direct */}
        {liveMatches.length > 0 && (
          <div className="border border-red-400/50 bg-red-500/10 px-6 py-5 mb-8" data-testid="results-live-section">
            <div className="flex items-center gap-2 mb-4">
              <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-400" />
              </span>
              <p className="font-display text-xs uppercase tracking-[0.3em] text-red-300 font-bold">{t("results.liveNow")}</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="results-live-grid">
              {liveMatches.map((m) => <MatchCard key={m.id} match={m} />)}
            </div>
          </div>
        )}

        {/* Face-à-face par adversaire */}
        {matches && matches.length > 0 && (
          <div className="mb-8" data-testid="results-h2h">
            <HeadToHeadPanel matches={matches} testId="results-h2h-panel" />
          </div>
        )}

        <div
          className="flex gap-1 border-b border-white/10 mb-8"
          data-testid="results-tabs"
          role="tablist"
          aria-label={t("results.title")}
        >
          {[["finished", Trophy], ["upcoming", CalendarClock]].map(([k, Icon]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              data-testid={`results-tab-${k}`}
              role="tab"
              aria-selected={tab === k}
              className={`flex items-center gap-2 px-5 py-3 text-xs uppercase tracking-[0.25em] border-b-2 -mb-px transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82] motion-reduce:transition-none ${tab === k ? "border-[#D8CA82] text-[#D8CA82]" : "border-transparent text-[#c8c8c8] hover:text-[#f7f7f7]"}`}
            >
              <Icon size={14} aria-hidden="true" /> {t(`results.tab.${k}`)}
            </button>
          ))}
        </div>

        {/* Compteur + badges actifs — D-08 : barre de filtres partagée */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4" data-testid="results-filter-bar">
          <p className="text-xs text-[#c8c8c8]" data-testid="results-count">
            {filtered.length} résultat{filtered.length !== 1 ? "s" : ""} {game!=="all" || competition!=="all" || from || to ? "· filtres actifs" : ""}
          </p>
          {(game!=="all" || competition!=="all" || from || to) && (
            <button onClick={resetFilters} data-testid="results-filter-reset-all" className="text-xs uppercase tracking-widest text-[#D8CA82] hover:underline">Tout réinitialiser</button>
          )}
        </div>
        {(game!=="all" || competition!=="all" || from || to) && (
          <div className="flex flex-wrap gap-2 mb-4" data-testid="results-active-filters">
            {game!=="all" && <button onClick={()=>setGame("all")} data-testid="results-badge-game" className="border border-[#D8CA82]/40 bg-[#D8CA82]/10 text-[#D8CA82] text-xs px-3 py-1.5 flex items-center gap-2">Jeu: {game} ✕</button>}
            {competition!=="all" && <button onClick={()=>setCompetition("all")} data-testid="results-badge-competition" className="border border-[#D8CA82]/40 bg-[#D8CA82]/10 text-[#D8CA82] text-xs px-3 py-1.5 flex items-center gap-2">Compétition: {competition} ✕</button>}
            {from && <button onClick={()=>setFrom("")} data-testid="results-badge-from" className="border border-white/20 bg-[#1A1A1A] text-[#c8c8c8] text-xs px-3 py-1.5">Du: {from} ✕</button>}
            {to && <button onClick={()=>setTo("")} data-testid="results-badge-to" className="border border-white/20 bg-[#1A1A1A] text-[#c8c8c8] text-xs px-3 py-1.5">Au: {to} ✕</button>}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-4 mb-10 overflow-x-auto pb-2 scrollbar-thin" data-testid="results-filters" style={{scrollbarWidth:"thin"}}>
          <span className="hidden sm:inline text-xs text-[#c8c8c8]/50 mr-2">← faire défiler →</span>
          <div>
            <label htmlFor="filter-game" className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] block mb-1.5">{t("common.game")}</label>
            <select id="filter-game" value={game} onChange={(e) => setGame(e.target.value)} className={selectCls} data-testid="results-filter-game">
              <option value="all">{t("results.filter.all")}</option>
              {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="filter-competition" className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] block mb-1.5">{t("results.filter.competition")}</label>
            <select id="filter-competition" value={competition} onChange={(e) => setCompetition(e.target.value)} className={selectCls} data-testid="results-filter-competition">
              <option value="all">{t("results.filter.all")}</option>
              {competitions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="filter-from" className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] block mb-1.5">{t("results.filter.from")}</label>
            <input id="filter-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={selectCls} data-testid="results-filter-from" />
          </div>
          <div>
            <label htmlFor="filter-to" className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] block mb-1.5">{t("results.filter.to")}</label>
            <input id="filter-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={selectCls} data-testid="results-filter-to" />
          </div>
          <button onClick={resetFilters} data-testid="results-filter-reset"
            className="border border-white/20 text-[#c8c8c8] text-xs uppercase tracking-widest px-4 py-2.5 hover:border-[#D8CA82] hover:text-[#D8CA82] transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82] motion-reduce:transition-none">
            {t("results.filter.reset")}
          </button>
        </div>

        {error ? (
          <ErrorState onRetry={() => setRetryKey((k) => k + 1)} testId="results-error" />
        ) : matches === null ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="results-loading">
            {[1,2,3,4,5,6].map((i)=> (
              <div key={i} className="border border-white/10 bg-[#1A1A1A] p-6 animate-pulse">
                <div className="flex justify-between mb-4">
                  <div className="h-5 w-16 bg-white/10" />
                  <div className="h-5 w-20 bg-white/10" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-12 w-12 bg-white/5" />
                  <div className="h-6 w-12 bg-white/10" />
                  <div className="h-12 w-12 bg-white/5" />
                </div>
                <div className="mt-4 h-3 w-full bg-white/5" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          matches && matches.length===0 ? (
            <div className="border border-white/10 bg-[#1A1A1A] py-20 flex flex-col items-center gap-4" data-testid="results-empty">
              <Trophy className="text-[#D8CA82]/50" size={36} aria-hidden="true" />
              <p className="text-[#c8c8c8]">{t("results.empty")}</p>
              <p className="text-xs text-[#c8c8c8]/70">Aucune donnée publiée — l’admin peut publier un match.</p>
            </div>
          ) : (
            <div className="border border-white/10 bg-[#1A1A1A] py-20 flex flex-col items-center gap-4" data-testid="results-empty">
              <Trophy className="text-[#D8CA82]/50" size={36} aria-hidden="true" />
              <p className="text-[#c8c8c8]">Aucun résultat avec ces filtres.</p>
              <div className="flex gap-3">
                <button onClick={resetFilters} data-testid="results-empty-reset" className="border border-[#D8CA82]/50 text-[#D8CA82] text-xs uppercase tracking-widest px-5 py-2.5 hover:bg-[#D8CA82]/10">Réinitialiser</button>
                <Link to="/calendrier" className="border border-white/20 text-[#c8c8c8] text-xs uppercase tracking-widest px-5 py-2.5 hover:border-[#D8CA82]">Voir le calendrier</Link>
              </div>
            </div>
          )
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="results-grid">
              {filtered.slice(0, visibleCount).map((m) => <MatchCard key={m.id} match={m} />)}
            </div>
            {filtered.length > visibleCount && (
              <div className="mt-10 flex flex-col items-center gap-3" data-testid="results-load-more">
                <button
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  data-testid="results-load-more-btn"
                  className="border border-[#D8CA82]/50 text-[#D8CA82] text-xs font-display font-bold uppercase tracking-widest px-8 py-3 flex items-center gap-2 hover:bg-[#D8CA82]/10 transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
                >
                  <ChevronDown size={14} aria-hidden="true" /> {t("results.loadMore")}
                </button>
                <p className="text-xs text-[#c8c8c8]">
                  {Math.min(visibleCount, filtered.length)} {t("results.loaded")} {filtered.length}
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
