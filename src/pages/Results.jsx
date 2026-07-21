import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { MatchCard } from "../components/MatchCard";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { Trophy, CalendarClock } from "lucide-react";
import { GAMES } from "../lib/constants";

const selectCls = "bg-[#1A1A1A] border border-white/20 px-3 py-2 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

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

  useEffect(() => {
    setError(false); setMatches(null);
    return onSnapshot(collection(db, "matches"), (snap) => {
      setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (e) => { console.error(e); setError(true); });
  }, [retryKey]);

  const competitions = useMemo(() => [...new Set((matches || []).map((m) => m.competition).filter(Boolean))], [matches]);

  const filtered = useMemo(() => {
    let list = (matches || []).filter((m) => (tab === "upcoming" ? m.status === "upcoming" : m.status !== "upcoming"));
    if (game !== "all") list = list.filter((m) => m.game === game);
    if (competition !== "all") list = list.filter((m) => m.competition === competition);
    if (from) list = list.filter((m) => (m.date || "") >= from);
    if (to) list = list.filter((m) => (m.date || "") <= to);
    list.sort((a, b) => tab === "upcoming" ? (a.date || "").localeCompare(b.date || "") : (b.date || "").localeCompare(a.date || ""));
    return list;
  }, [matches, tab, game, competition, from, to]);

  const resetFilters = () => { setGame("all"); setCompetition("all"); setFrom(""); setTo(""); };

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20 relative">
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="results-title">{t("results.title")}</h1>
          <p className="text-[#f7f7f7]/50 mt-4 tracking-wide">{t("results.sub")}</p>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        <div className="flex gap-1 border-b border-white/10 mb-8" data-testid="results-tabs">
          {[["finished", Trophy], ["upcoming", CalendarClock]].map(([k, Icon]) => (
            <button key={k} onClick={() => setTab(k)} data-testid={`results-tab-${k}`}
              className={`flex items-center gap-2 px-5 py-3 text-xs uppercase tracking-[0.25em] border-b-2 -mb-px transition-colors ${tab === k ? "border-[#D8CA82] text-[#D8CA82]" : "border-transparent text-[#f7f7f7]/50 hover:text-[#f7f7f7]"}`}>
              <Icon size={14} /> {t(`results.tab.${k}`)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-4 mb-10" data-testid="results-filters">
          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 block mb-1.5">{t("common.game")}</label>
            <select value={game} onChange={(e) => setGame(e.target.value)} className={selectCls} data-testid="results-filter-game">
              <option value="all">{t("results.filter.all")}</option>
              {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 block mb-1.5">{t("results.filter.competition")}</label>
            <select value={competition} onChange={(e) => setCompetition(e.target.value)} className={selectCls} data-testid="results-filter-competition">
              <option value="all">{t("results.filter.all")}</option>
              {competitions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 block mb-1.5">{t("results.filter.from")}</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={selectCls} data-testid="results-filter-from" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 block mb-1.5">{t("results.filter.to")}</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={selectCls} data-testid="results-filter-to" />
          </div>
          <button onClick={resetFilters} data-testid="results-filter-reset"
            className="border border-white/20 text-[#f7f7f7]/60 text-xs uppercase tracking-widest px-4 py-2.5 hover:border-[#D8CA82] hover:text-[#D8CA82] transition-colors">
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="results-grid">
            {filtered.map((m) => <MatchCard key={m.id} match={m} />)}
          </div>
        )}
      </section>
    </div>
  );
}
