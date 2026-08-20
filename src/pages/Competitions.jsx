import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Link } from "react-router-dom";
import { Trophy, ExternalLink, Medal, CalendarRange } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { useSEO } from "../lib/useSEO";

const STATUS_ORDER = { ongoing: 0, upcoming: 1, finished: 2 };
const STATUS_CLS = {
  ongoing: "border-emerald-300/50 text-emerald-300 bg-emerald-300/10",
  upcoming: "border-sky-300/50 text-sky-300 bg-sky-300/10",
  finished: "border-white/20 text-[#f7f7f7]/50 bg-white/5",
};

export default function Competitions() {
  const { t } = useLang();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    setError(false); setItems(null);
    return onSnapshot(collection(db, "competitions"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || (b.season || "").localeCompare(a.season || ""));
      setItems(list);
    }, (e) => { console.error(e); setError(true); });
  }, [retryKey]);

  useSEO({
    title: `${t("competitions.title")} — ELYSIUM Esport`,
    description: t("competitions.sub"),
    url: "/competitions",
  });

  const filtered = (items || []).filter((c) => statusFilter === "all" || c.status === statusFilter);

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
            {/* Timeline — D-03 : identité Compétitions distincte */}
            <div className="border border-white/10 bg-[#0c0c0c] p-6 mb-8" data-testid="competitions-timeline">
              <h2 className="font-display text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-4">Timeline des compétitions</h2>
              <div className="relative border-l border-[#D8CA82]/30 pl-6 space-y-4">
                {(filtered.slice(0,4)).map((c,i)=> (
                  <div key={c.id} className="relative">
                    <span className="absolute -left-[25px] top-1 w-3 h-3 bg-[#D8CA82] rounded-full" />
                    <p className="font-display font-bold text-sm text-[#f7f7f7]">{c.name} — {c.season || "2026"}</p>
                    <p className="text-xs text-[#c8c8c8]">{c.status} {c.position ? `· ${c.position}` : ""}</p>
                  </div>
                ))}
                {filtered.length===0 && <p className="text-xs text-[#c8c8c8]">Aucune compétition — la timeline apparaîtra ici.</p>}
              </div>
            </div>
            {/* Classement — bloc distinct */}
            <div className="border border-[#D8CA82]/20 bg-[#1A1A1A] p-6 mb-8" data-testid="competitions-standings">
              <h2 className="font-display text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-4">Classement actuel</h2>
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
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="competitions-grid">
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
                {c.notes && <p className="text-sm text-[#f7f7f7]/50 mt-3 line-clamp-2">{c.notes}</p>}
                <div className="mt-auto pt-5">
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
          </>
        )}
      </section>
    </div>
  );
}
