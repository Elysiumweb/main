import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, onSnapshot, collection, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { useSEO, SITE_URL } from "../lib/useSEO";
import { LoadingState } from "../components/States";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { MatchCard } from "../components/MatchCard";
import { Trophy, Medal, ExternalLink, CalendarRange, Users, Layers, Award } from "lucide-react";
import { getElysiumTeamName } from "../lib/constants";

export default function CompetitionDetail() {
  const { id: rawId } = useParams();
  const { t } = useLang();
  const [comp, setComp] = useState(undefined);
  const [matches, setMatches] = useState([]);

  const compId = useMemo(() => rawId?.split("-")[0] || rawId, [rawId]);

  useEffect(() => {
    if (!compId) return;
    return onSnapshot(doc(db, "competitions", compId), (s) => setComp(s.exists() ? { id: s.id, ...s.data() } : null), () => setComp(null));
  }, [compId]);

  useEffect(() => {
    if (!comp) return;
    // Listen to matches where competitionId == comp.id OR competition == comp.name (legacy text)
    const unsub1 = onSnapshot(collection(db, "matches"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const filtered = list.filter((m) => m.competitionId === comp.id || (!m.competitionId && m.competition === comp.name));
      filtered.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      setMatches(filtered);
    });
    return () => unsub1();
  }, [comp]);

  const stats = useMemo(() => {
    if (!matches.length) return null;
    const wins = matches.filter((m) => Number(m.scoreUs) > Number(m.scoreThem)).length;
    const losses = matches.filter((m) => Number(m.scoreUs) < Number(m.scoreThem)).length;
    return { total: matches.length, wins, losses, draws: matches.length - wins - losses };
  }, [matches]);

  useSEO({
    title: comp ? `${comp.name} — Compétition ${comp.season || ""} — Elysium` : "Compétition — Elysium",
    description: comp ? `${comp.name} · ${comp.level || ""} ${comp.region || ""} ${comp.prizePool ? `· Prize pool ${comp.prizePool}` : ""}` : "Détail compétition Elysium",
    url: `/competitions/${compId}`,
    noIndex: comp === null,
  });

  if (comp === undefined) return <div className="min-h-[60vh] flex items-center justify-center bg-[#111111]"><LoadingState testId="competition-detail-loading" /></div>;
  if (comp === null) return <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 bg-[#111111]"><p className="text-[#f7f7f7]/50">Compétition introuvable</p><Link to="/competitions" className="text-[#D8CA82] text-sm hover:underline">← Compétitions</Link></div>;

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-6">
        <PageBreadcrumb items={[{ label: t("competitions.title"), to: "/competitions" }, { label: comp.name }]} />
      </div>
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10 relative">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className={`text-[10px] uppercase tracking-widest border px-2 py-0.5 ${comp.status === "ongoing" ? "border-emerald-300/50 text-emerald-300 bg-emerald-300/10" : comp.status === "upcoming" ? "border-sky-300/50 text-sky-300 bg-sky-300/10" : "border-white/20 text-[#f7f7f7]/50 bg-white/5"}`}>{t(`competitions.status.${comp.status}`)}</span>
            {comp.season && <span className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/40 flex items-center gap-1"><CalendarRange size={11} /> Saison {comp.season}</span>}
            {comp.level && <span className="text-[10px] uppercase tracking-widest text-[#D8CA82] border border-[#D8CA82]/30 px-2 py-0.5">{comp.level}</span>}
            {comp.region && <span className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/50">{comp.region}</span>}
          </div>
          <h1 className="font-display font-black text-3xl sm:text-5xl text-[#f7f7f7] uppercase" data-testid="competition-detail-title">{comp.name}</h1>
          <div className="flex flex-wrap gap-6 mt-6 text-sm text-[#c8c8c8]">
            {comp.game && <span className="flex items-center gap-1.5"><Layers size={14} className="text-[#D8CA82]" /> {comp.game}{comp.roster ? ` · ${comp.roster} (${getElysiumTeamName(comp.roster)})` : ""}</span>}
            {comp.organizer && <span className="flex items-center gap-1.5"><Users size={14} className="text-[#D8CA82]" /> {comp.organizer}</span>}
            {comp.prizePool && <span className="flex items-center gap-1.5"><Award size={14} className="text-[#D8CA82]" /> {comp.prizePool}</span>}
            {comp.position && <span className="flex items-center gap-1.5"><Medal size={14} className="text-[#D8CA82]" /> Position : <span className="text-[#D8CA82] font-bold">{comp.position}</span></span>}
          </div>
          {(comp.startDate || comp.endDate) && <p className="text-xs text-[#f7f7f7]/50 mt-2">{comp.startDate || "?"} → {comp.endDate || "?"}{comp.format ? ` · Format : ${comp.format}` : ""}</p>}
          {comp.notes && <p className="text-sm text-[#f7f7f7]/60 mt-4 max-w-3xl whitespace-pre-wrap">{comp.notes}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            {comp.officialUrl && <a href={comp.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#D8CA82] border border-[#D8CA82]/40 px-3 py-2 hover:bg-[#D8CA82]/10"><ExternalLink size={12} /> Site officiel</a>}
            {comp.bracketUrl && <a href={comp.bracketUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#D8CA82] border border-[#D8CA82]/40 px-3 py-2 hover:bg-[#D8CA82]/10"><Trophy size={12} /> Bracket</a>}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-10">
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-10" data-testid="competition-stats">
            <div className="border border-white/10 bg-[#1A1A1A] p-5 text-center"><p className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/40">Matchs</p><p className="font-display font-black text-2xl text-[#f7f7f7] mt-1">{stats.total}</p></div>
            <div className="border border-emerald-300/40 bg-emerald-300/5 p-5 text-center"><p className="text-[10px] uppercase tracking-widest text-emerald-300">Victoires</p><p className="font-display font-black text-2xl text-emerald-300 mt-1">{stats.wins}</p></div>
            <div className="border border-red-300/40 bg-red-300/5 p-5 text-center"><p className="text-[10px] uppercase tracking-widest text-red-300">Défaites</p><p className="font-display font-black text-2xl text-red-300 mt-1">{stats.losses}</p></div>
          </div>
        )}

        <h2 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7] mb-6 flex items-center gap-2"><Trophy size={16} className="text-[#D8CA82]" /> Matchs de la compétition ({matches.length})</h2>
        {matches.length === 0 ? <p className="text-[#f7f7f7]/40 border border-white/10 bg-[#1A1A1A] p-6">Aucun match lié à cette compétition pour le moment.</p> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="competition-matches">{matches.map((m) => <MatchCard key={m.id} match={m} />)}</div>}
      </section>
    </div>
  );
}
