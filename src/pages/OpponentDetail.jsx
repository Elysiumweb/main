import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { SITE_URL, useSEO } from "../lib/useSEO";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { HeadToHead, computeHeadToHead } from "../components/HeadToHead";
import { MatchCard } from "../components/MatchCard";
import { LoadingState, ErrorState } from "../components/States";
import { Swords, ExternalLink, Globe, Trophy } from "lucide-react";

const slugify = (s) => String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80) || "adversaire";

const OpponentLogo = ({ src, name, className="" }) => {
  const [err, setErr] = useState(false);
  if (!src || err) {
    const initials = (name||"?").split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()||"").join("")||"?";
    return <div className={`${className} flex items-center justify-center border border-border/30 bg-background/70 text-muted-foreground text-xs`}>{initials}</div>;
  }
  return <img src={src} alt={`Logo ${name}`} onError={()=>setErr(true)} className={`${className} object-contain`} />;
};

export default function OpponentDetail() {
  const { slug } = useParams();
  const { t } = useLang();
  const [matches, setMatches] = useState(null);
  const [opponentsCol, setOpponentsCol] = useState([]);
  const [error, setError] = useState(false);

  useEffect(()=>{
    const unsub1 = onSnapshot(collection(db,"matches"), (snap)=> setMatches(snap.docs.map(d=>({id:d.id,...d.data()}))), (e)=>{console.error(e); setError(true);});
    const unsub2 = onSnapshot(collection(db,"opponents"), (snap)=> setOpponentsCol(snap.docs.map(d=>({id:d.id,...d.data()}))), ()=>{});
    return ()=>{ unsub1(); unsub2(); };
  },[]);

  const opponent = useMemo(()=>{
    if (!matches) return null;
    // Find by slug
    const allNames = [...new Set(matches.map(m=>m.opponentName).filter(Boolean))];
    const foundName = allNames.find(n=> slugify(n)===slug);
    if (!foundName) {
      // Also check opponents collection
      const col = opponentsCol.find(o=> o.slug===slug || slugify(o.name)===slug);
      if (col) return { name: col.name, slug, logo: col.logo, country: col.country, website: col.website, twitter: col.twitter, col };
      return null;
    }
    const col = opponentsCol.find(o=> o.slug===slug || slugify(o.name)===slug || slugify(o.name)===slugify(foundName));
    return { name: foundName, slug, logo: col?.logo || matches.find(m=>m.opponentName===foundName)?.opponentLogo, country: col?.country, website: col?.website, twitter: col?.twitter, col };
  }, [matches, opponentsCol, slug]);

  const h2h = useMemo(()=> matches && opponent ? computeHeadToHead(matches, opponent.name) : null, [matches, opponent]);

  const opponentMatches = useMemo(()=>{
    if (!matches || !opponent) return [];
    return matches.filter(m=> (m.opponentName||"").trim().toLowerCase()===opponent.name.trim().toLowerCase()).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  }, [matches, opponent]);

  useSEO({
    title: opponent ? `${opponent.name} — Fiche adversaire | ELYSIUM Esport` : "Adversaire — ELYSIUM Esport",
    description: opponent ? `Bilan Elysium vs ${opponent.name} : ${h2h ? `${h2h.wins} victoires, ${h2h.losses} défaites` : "historique des confrontations"}` : "Fiche adversaire Elysium Esport",
    url: `/adversaires/${slug}`,
    jsonLd: opponent ? {
      "@type": "SportsTeam",
      "@id": `${SITE_URL}/adversaires/${slug}#team`,
      name: opponent.name,
      logo: opponent.logo,
      memberOf: undefined,
    } : undefined,
  });

  if (error) return <div className="min-h-[60vh] bg-transparent"><ErrorState testId="opponent-detail-error" /></div>;
  if (matches===null) return <div className="min-h-[60vh] bg-transparent"><LoadingState testId="opponent-detail-loading" /></div>;
  if (!opponent) return (
    <div className="min-h-[60vh] bg-background flex flex-col items-center justify-center gap-4">
      <p className="text-muted-foreground">Adversaire introuvable : {slug}</p>
      <Link to="/adversaires" className="border border-primary/50 text-primary px-5 py-2 text-xs uppercase tracking-widest">Tous les adversaires</Link>
    </div>
  );

  return (
    <div className="min-h-[70vh] bg-transparent">
      <section className="relative overflow-hidden pt-6 sm:pt-10">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb className="opacity-80" items={[{label:"Adversaires", to:"/adversaires"}, {label:opponent.name}]} />
          <div className="flex items-center gap-6">
            <OpponentLogo src={opponent.logo} name={opponent.name} className="h-20 w-20 panel clip-blade-sm" />
            <div>
              <h1 className="font-display font-black text-4xl sm:text-5xl uppercase leading-[0.95] text-gold" data-testid="opponent-detail-title">{opponent.name}</h1>
              <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                {opponent.country && <span className="border border-border/30 px-2 py-0.5 uppercase tracking-widest">{opponent.country}</span>}
                {opponent.website && <a href={opponent.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary"><Globe size={12}/> Site officiel <ExternalLink size={10}/></a>}
                {opponent.twitter && <a href={opponent.twitter} target="_blank" rel="noopener noreferrer" className="hover:text-primary">X / Twitter</a>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-10 grid lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8 space-y-8">
          {h2h && <HeadToHead matches={matches} opponentName={opponent.name} testId="opponent-detail-h2h" />}

          <div>
            <h2 className="font-display text-xs uppercase tracking-[0.3em] text-primary mb-6 flex items-center gap-2"><Trophy size={14}/> Historique des confrontations ({opponentMatches.length})</h2>
            <div className="grid sm:grid-cols-2 gap-4" data-testid="opponent-detail-grid">
              {opponentMatches.map(m=> <MatchCard key={m.id} match={m} />)}
            </div>
          </div>
        </div>
        <aside className="lg:col-span-4 space-y-6">
          <div className="panel clip-blade-sm p-6">
            <p className="font-display text-xs uppercase tracking-[0.3em] text-primary mb-3">Fiche</p>
            <ul className="text-xs text-muted-foreground space-y-2">
              <li>Nom : <span className="text-foreground">{opponent.name}</span></li>
              {opponent.country && <li>Pays : <span className="text-foreground">{opponent.country}</span></li>}
              <li>Confrontations : <span className="text-foreground">{opponentMatches.length}</span></li>
              {h2h && <li>Bilan : <span className="text-emerald-300">{h2h.wins}V</span> – <span className="text-red-300">{h2h.losses}D</span> {h2h.draws?`– ${h2h.draws}N`:""} · {h2h.scoreFor}-{h2h.scoreAgainst}</li>}
            </ul>
            <Link to="/adversaires" className="mt-4 inline-flex text-xs uppercase tracking-widest text-primary hover:underline">← Tous les adversaires</Link>
          </div>
          <div className="border border-border/25 bg-background/70 p-6">
            <p className="text-xs text-muted-foreground leading-relaxed">Cette fiche est générée automatiquement à partir des matchs saisis. Les logos et informations enrichies peuvent être complétés depuis l'administration (collection <code>opponents</code>).</p>
          </div>
        </aside>
      </section>
    </div>
  );
}
