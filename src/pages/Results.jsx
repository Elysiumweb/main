import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
  const [tab, setTab] = useState("finished");
  const [game, setGame] = useState("all");
  const [competition, setCompetition] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setError(false); setMatches(null);
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
          name: `${teamName} vs ${m.opponentName || "adversaire"}`,
          startDate: m.date ? `${m.date}${m.time ? `T${m.time}` : ""}` : undefined,
          eventStatus: m.status === "upcoming" || m.status === "live" ? "https://schema.org/EventScheduled" : "https://schema.org/EventCompleted",
          sport: m.game || "Esport",
          competitor: [
            { "@type": "SportsTeam", name: teamName, memberOf: { "@id": `${SITE_URL}/#organization` } },
            { "@type": "SportsTeam", name: m.opponentName || "Adversaire", logo: m.opponentLogo },
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

  const resetFilters = () => { setGame("all"); setCompetition("all"); setFrom(""); setTo(""); };

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

        <div className="flex flex-wrap items-end gap-4 mb-10" data-testid="results-filters">
          <div>
            <label htmlFor="filter-game" className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] block mb-1.5">{t("common.game")}</label>
            <select id="filter-game" value={game} onChange={(e) => setGame(e.target.value)} className={selectCls} data-testid="results-filter-game">
              <option value="all">{t("results.filter.all")}</option>
              {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="filter-competition" className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] block mb-1.5">{t("results.filter.competition")}</label>
            <select id="filter-competition" value={competition} onChange={(e) => setCompetition(e.target.value)} className={selectCls} data-testid="results-filter-competition">
              <option value="all">{t("results.filter.all")}</option>
              {competitions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="filter-from" className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] block mb-1.5">{t("results.filter.from")}</label>
            <input id="filter-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={selectCls} data-testid="results-filter-from" />
          </div>
          <div>
            <label htmlFor="filter-to" className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] block mb-1.5">{t("results.filter.to")}</label>
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
          <LoadingState testId="results-loading" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={tab === "upcoming" ? CalendarClock : Trophy}
            text={tab === "upcoming" ? t("results.noUpcoming") : t("results.empty")} testId="results-empty" />
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
                <p className="text-[11px] text-[#f7f7f7]/40">
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
