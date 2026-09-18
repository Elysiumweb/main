import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Link } from "react-router-dom";
import { Trophy, ExternalLink, Medal, CalendarRange, Table2, ListOrdered } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { useSEO } from "../lib/useSEO";
import { MatchCard } from "../components/MatchCard";

const STATUS_ORDER = { ongoing: 0, upcoming: 1, finished: 2 };
const STATUS_CLS = {
  ongoing: "border-emerald-300/50 text-emerald-300 bg-emerald-300/10",
  upcoming: "border-sky-300/50 text-sky-300 bg-sky-300/10",
  finished: "border-white/20 text-[#f7f7f7]/50 bg-white/5",
};

export default function Competitions() {
  const { t } = useLang();
  const [items, setItems] = useState(null);
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCompetition, setSelectedCompetition] = useState(null);

  useEffect(() => {
    setError(false); setItems(null);
    const unsub1 = onSnapshot(collection(db, "competitions"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || (b.season || "").localeCompare(a.season || ""));
      setItems(list);
    }, (e) => { console.error(e); setError(true); });
    const unsub2 = onSnapshot(collection(db, "matches"), (snap)=>{
      setMatches(snap.docs.map(d=>({id:d.id,...d.data()})));
    });
    return ()=>{ unsub1(); unsub2(); };
  }, [retryKey]);

  useSEO({
    title: `${t("competitions.title")} — ELYSIUM Esport`,
    description: t("competitions.sub"),
    url: "/competitions",
  });

  const filtered = (items || []).filter((c) => statusFilter === "all" || c.status === statusFilter);

  const detailCompetition = useMemo(()=>{
    if (!selectedCompetition) return null;
    return (items||[]).find(c=>c.id===selectedCompetition) || null;
  }, [items, selectedCompetition]);

  const competitionMatches = useMemo(()=>{
    if (!detailCompetition) return [];
    const name = detailCompetition.name;
    return matches.filter(m=> m.competition===name).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  }, [detailCompetition, matches]);

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("competitions.title") }]} />
          <div className="flex items-center gap-3">
            <Trophy className="text-[#D8CA82]" size={26} aria-hidden="true" />
            <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="competitions-title">{t("competitions.title")}</h1>
          </div>
          <p className="text-[#f7f7f7]/50 mt-4 tracking-wide">{t("competitions.sub")}</p>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        <div className="flex flex-wrap gap-2 mb-10" data-testid="competitions-filters">
          {["all", "ongoing", "upcoming", "finished"].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} data-testid={`competitions-filter-${s}`}
              className={`text-xs uppercase tracking-[0.2em] border px-3 py-1.5 transition-colors ${statusFilter === s ? "border-[#D8CA82] text-[#D8CA82] bg-[#D8CA82]/10" : "border-white/15 text-[#f7f7f7]/50 hover:text-[#f7f7f7]"}`}>
              {s === "all" ? t("media.all") : t(`competitions.status.${s}`)}
            </button>
          ))}
        </div>
        {error ? (
          <ErrorState onRetry={() => setRetryKey((k) => k + 1)} testId="competitions-error" />
        ) : items === null ? (
          <LoadingState testId="competitions-loading" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Trophy} text={t("competitions.empty")} testId="competitions-empty" />
        ) : (
          <>
            {/* Timeline */}
            <div className="border border-white/10 bg-[#0c0c0c] p-6 mb-8" data-testid="competitions-timeline">
              <h2 className="font-display text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-4">Timeline des compétitions</h2>
              <div className="relative border-l border-[#D8CA82]/30 pl-6 space-y-4">
                {(filtered.slice(0,4)).map((c)=> (
                  <div key={c.id} className="relative">
                    <span className="absolute -left-[25px] top-1 w-3 h-3 bg-[#D8CA82] rounded-full" />
                    <p className="font-display font-bold text-sm text-[#f7f7f7]">{c.name} — {c.season || "2026"}</p>
                    <p className="text-xs text-[#c8c8c8]">{c.status} {c.position ? `· ${c.position}` : ""}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Real standings */}
            <div className="border border-[#D8CA82]/20 bg-[#1A1A1A] p-6 mb-8" data-testid="competitions-standings">
              <h2 className="font-display text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-4 flex items-center gap-2"><Table2 size={14}/> Classement détaillé (poule / championnat)</h2>
              {filtered.some(c=> Array.isArray(c.standings) && c.standings.length>0) ? (
                <div className="space-y-8">
                  {filtered.filter(c=> Array.isArray(c.standings) && c.standings.length>0).map(c=>(
                    <div key={c.id} className="border border-white/5 bg-[#0c0c0c] p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-display font-bold text-[#f7f7f7]">{c.name} {c.season && <span className="text-[#c8c8c8] text-xs">· {c.season}</span>}</p>
                        <span className={`text-xs uppercase tracking-widest border px-2 py-0.5 ${STATUS_CLS[c.status] || STATUS_CLS.finished}`}>{t(`competitions.status.${c.status}`)}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-[#c8c8c8] uppercase tracking-widest border-b border-white/10">
                            <tr><th className="text-left py-2">#</th><th className="text-left">Équipe</th><th className="text-center">J</th><th className="text-center">V</th><th className="text-center">N</th><th className="text-center">D</th><th className="text-center">+/-</th><th className="text-right">Pts</th></tr>
                          </thead>
                          <tbody>
                            {c.standings.map((row,i)=>(
                              <tr key={i} className={`border-t border-white/5 ${String(row.team).toLowerCase().includes("elysium") ? "bg-[#D8CA82]/5" : ""}`}>
                                <td className="py-2 text-[#c8c8c8]">{i+1}</td>
                                <td className={`py-2 font-semibold ${String(row.team).toLowerCase().includes("elysium") ? "text-[#D8CA82]" : "text-[#f7f7f7]"}`}>{row.team}</td>
                                <td className="text-center text-[#c8c8c8]">{row.played ?? 0}</td>
                                <td className="text-center text-emerald-300/80">{row.wins ?? 0}</td>
                                <td className="text-center text-[#c8c8c8]">{row.draws ?? 0}</td>
                                <td className="text-center text-red-300/60">{row.losses ?? 0}</td>
                                <td className="text-center text-[#c8c8c8]">{row.diff || "0"}</td>
                                <td className="text-right font-bold text-[#D8CA82]">{row.points ?? 0}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button onClick={()=> setSelectedCompetition(c.id)} className="mt-3 text-xs uppercase tracking-widest text-[#D8CA82] hover:underline">Voir les matchs de {c.name} →</button>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <p className="text-xs text-[#c8c8c8] mb-4">Aucun classement détaillé saisi — l'ancien affichage (position Elysium) est conservé ci-dessous. Ajoutez un tableau de classement dans l'admin pour afficher J/V/N/D/Pts.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-[#c8c8c8] uppercase tracking-widest">
                        <tr><th className="text-left py-2">Compétition</th><th className="text-left">Saison</th><th className="text-right">Position</th></tr>
                      </thead>
                      <tbody>
                        {filtered.map((c)=> (
                          <tr key={c.id} className="border-t border-white/5">
                            <td className="py-2 text-[#f7f7f7]">{c.name}</td>
                            <td className="text-[#c8c8c8]">{c.season || "—"}</td>
                            <td className="text-right font-bold text-[#D8CA82]">{c.position || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Competition cards */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10" data-testid="competitions-grid">
            {filtered.map((c) => (
              <div key={c.id} className="border border-white/10 bg-[#1A1A1A] p-6 flex flex-col hover:border-[#D8CA82]/50 transition-colors" data-testid={`competition-card-${c.id}`}>
                <div className="flex items-center justify-between mb-4">
                  <span className={`text-xs uppercase tracking-widest border px-2 py-0.5 ${STATUS_CLS[c.status] || STATUS_CLS.finished}`}>
                    {t(`competitions.status.${c.status}`)}
                  </span>
                  {c.season && (
                    <span className="text-xs uppercase tracking-widest text-[#c8c8c8] flex items-center gap-1.5">
                      <CalendarRange size={11} aria-hidden="true" /> {t("competitions.season")} {c.season}
                    </span>
                  )}
                </div>
                <h2 className="font-display font-bold text-lg text-[#f7f7f7] leading-snug">{c.name}</h2>
                {c.position ? (
                  <div className="mt-4 flex items-center gap-3" data-testid={`competition-position-${c.id}`}>
                    <Medal size={18} className="text-[#D8CA82]" aria-hidden="true" />
                    <div>
                      <p className="text-xs uppercase tracking-widest text-[#c8c8c8]">{t("competitions.position")}</p>
                      <p className="font-display font-black text-2xl text-[#D8CA82]">{c.position}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-[#c8c8c8]">{t("competitions.position.na")}</p>
                )}
                {c.standings && c.standings.length>0 && (
                  <p className="mt-2 text-xs text-[#D8CA82] flex items-center gap-1"><ListOrdered size={12}/> {c.standings.length} équipes classées</p>
                )}
                {c.notes && <p className="text-sm text-[#f7f7f7]/50 mt-3 line-clamp-2">{c.notes}</p>}
                <div className="mt-auto pt-5 flex gap-3">
                  <button onClick={()=> setSelectedCompetition(c.id)} className="inline-flex items-center gap-2 text-xs font-display uppercase tracking-widest text-[#f7f7f7]/70 hover:text-[#D8CA82] border border-white/15 px-3 py-1.5 hover:border-[#D8CA82]/40">Calendrier →</button>
                  {c.officialUrl ? (
                    <a href={c.officialUrl} target="_blank" rel="noopener noreferrer" data-testid={`competition-link-${c.id}`}
                      className="inline-flex items-center gap-2 text-xs font-display uppercase tracking-widest text-[#D8CA82] hover:underline">
                      <ExternalLink size={12} aria-hidden="true" /> {t("competitions.visit")}
                    </a>
                  ) : (
                    <Link to="/resultats" className="inline-flex items-center gap-2 text-xs font-display uppercase tracking-widest text-[#c8c8c8] hover:text-[#D8CA82]">
                      {t("results.title")} →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          {detailCompetition && (
            <div className="border border-[#D8CA82]/30 bg-[#0c0c0c] p-6" data-testid="competitions-detail">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">Calendrier — {detailCompetition.name}</h2>
                <button onClick={()=> setSelectedCompetition(null)} className="text-xs text-[#c8c8c8] hover:text-[#f7f7f7]">Fermer ✕</button>
              </div>
              {competitionMatches.length===0 ? (
                <p className="text-xs text-[#c8c8c8]">Aucun match lié à cette compétition (filtre sur champ <code>competition</code>).</p>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {competitionMatches.map(m=> <MatchCard key={m.id} match={m} />)}
                </div>
              )}
            </div>
          )}
          </>
        )}
      </section>
    </div>
  );
}
