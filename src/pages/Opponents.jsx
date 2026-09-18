import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { useSEO } from "../lib/useSEO";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { Swords, Trophy } from "lucide-react";

const slugify = (s) => String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80) || "adversaire";

const OpponentLogo = ({ src, name, className="" }) => {
  const [err, setErr] = useState(false);
  if (!src || err) {
    const initials = (name||"?").split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()||"").join("")||"?";
    return <div className={`${className} flex items-center justify-center border border-white/15 bg-[#0c0c0c] text-[#a0a0a0] text-xs`}>{initials}</div>;
  }
  return <img src={src} alt={`Logo ${name}`} onError={()=>setErr(true)} className={`${className} object-contain`} />;
};

export default function Opponents() {
  const { t } = useLang();
  const [matches, setMatches] = useState(null);
  const [opponentsCol, setOpponentsCol] = useState([]);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(()=>{
    setError(false);
    const unsub1 = onSnapshot(collection(db,"matches"), (snap)=> setMatches(snap.docs.map(d=>({id:d.id,...d.data()}))), (e)=>{console.error(e); setError(true);});
    const unsub2 = onSnapshot(collection(db,"opponents"), (snap)=> setOpponentsCol(snap.docs.map(d=>({id:d.id,...d.data()}))), ()=>{});
    return ()=>{ unsub1(); unsub2(); };
  },[retryKey]);

  useSEO({ title: "Adversaires — ELYSIUM Esport", description: "Historique des confrontations d'Elysium contre ses adversaires.", url: "/adversaires" });

  const opponents = useMemo(()=>{
    if (!matches) return [];
    const map = new Map();
    matches.forEach(m=>{
      if (!m.opponentName) return;
      const slug = slugify(m.opponentName);
      const existing = map.get(slug) || { slug, name: m.opponentName, logo: m.opponentLogo, count:0, wins:0, losses:0, draws:0 };
      existing.count++;
      const us = Number(m.scoreUs); const them = Number(m.scoreThem);
      if (!isNaN(us) && !isNaN(them) && m.status!=="upcoming" && m.status!=="live") {
        if (us>them) existing.wins++; else if (us<them) existing.losses++; else existing.draws++;
      }
      if (m.opponentLogo && !existing.logo) existing.logo = m.opponentLogo;
      // Enrich from opponents collection
      const colMatch = opponentsCol.find(o=> slugify(o.name)===slug || o.slug===slug);
      if (colMatch) {
        existing.logo = colMatch.logo || existing.logo;
        existing.country = colMatch.country;
        existing.id = colMatch.id;
      }
      map.set(slug, existing);
    });
    return [...map.values()].sort((a,b)=> b.count - a.count || a.name.localeCompare(b.name));
  }, [matches, opponentsCol]);

  if (error) return <div className="min-h-[60vh] bg-[#111111]"><ErrorState onRetry={()=>setRetryKey(k=>k+1)} testId="opponents-error" /></div>;
  if (matches===null) return <div className="min-h-[60vh] bg-[#111111]"><LoadingState testId="opponents-loading" /></div>;

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{label:"Adversaires"}]} />
          <div className="flex items-center gap-3">
            <Swords className="text-[#D8CA82]" size={26} />
            <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="opponents-title">Adversaires</h1>
          </div>
          <p className="text-[#f7f7f7]/50 mt-4">Bilan complet par adversaire, logos et historique des confrontations.</p>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        {opponents.length===0 ? <EmptyState icon={Trophy} text="Aucun adversaire enregistré." testId="opponents-empty" /> : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="opponents-grid">
            {opponents.map(o=>(
              <Link key={o.slug} to={`/adversaires/${o.slug}`} data-testid={`opponent-card-${o.slug}`} className="border border-white/10 bg-[#1A1A1A] p-6 flex flex-col hover:border-[#D8CA82]/50 transition-colors">
                <div className="flex items-center gap-4 mb-4">
                  <OpponentLogo src={o.logo} name={o.name} className="h-12 w-12 border border-white/10" />
                  <div>
                    <p className="font-display font-bold text-[#f7f7f7]">{o.name}</p>
                    <p className="text-xs text-[#c8c8c8]">{o.count} confrontation(s) · {o.wins}V {o.losses}D {o.draws?`${o.draws}N`:""}</p>
                  </div>
                </div>
                <p className="mt-auto text-xs uppercase tracking-widest text-[#D8CA82]">Voir la fiche →</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
