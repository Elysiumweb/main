import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { SITE_URL, useSEO, OG_VARIANTS } from "../lib/useSEO";
import { getElysiumTeamName } from "../lib/constants";
import { fmtMatchDate } from "../lib/formatters";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { ShareButtons } from "../components/ShareButtons";
import { HeadToHead } from "../components/HeadToHead";
import { MatchCountdown } from "../components/MatchCountdown";
import { OptimizedImage } from "../components/OptimizedImage";
import { LoadingState, ErrorState } from "../components/States";
import { Trophy, Skull, CalendarClock, Radio, ExternalLink, PlayCircle, Film, Award, Map as MapIcon, Users } from "lucide-react";

const OpponentLogo = ({ src, name, className = "" }) => {
  const { t } = useLang();
  const [err, setErr] = useState(false);
  const safeName = (name || t("common.adversary")).trim();
  if (!src || err) {
    const initials = safeName.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]?.toUpperCase()||"").join("")||"?";
    return (
      <div role="img" aria-label={`${t("a11y.opponentLogoFallback")} : ${safeName}`} className={`${className} flex items-center justify-center border border-white/15 bg-[#0c0c0c] text-[#a0a0a0] font-display tracking-widest text-xs uppercase select-none`}>
        <span aria-hidden="true">{initials}</span>
      </div>
    );
  }
  return <img src={src} alt={`${t("a11y.opponentLogo")} : ${safeName}`} onError={()=>setErr(true)} loading="lazy" decoding="async" className={`${className} object-contain`} />;
};

const ResultBadge = ({ match, t }) => {
  const live = match.status === "live";
  const upcoming = match.status === "upcoming";
  const us = Number(match.scoreUs);
  const them = Number(match.scoreThem);
  const result = us > them ? "win" : us < them ? "loss" : "draw";
  if (live) return <span className="text-xs font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-red-300 border-red-400/60 bg-red-500/10 flex items-center gap-1.5"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-red-400" /></span><span>{t("results.live")}</span></span>;
  if (upcoming) return <span className="text-xs font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-sky-300 border-sky-300/40 flex items-center gap-1"><CalendarClock size={11} /> <span>{t("results.upcoming")}</span></span>;
  if (result === "win") return <span className="text-xs font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-emerald-300 border-emerald-300/50 flex items-center gap-1"><Trophy size={11} /> <span>{t("results.win")}</span></span>;
  if (result === "loss") return <span className="text-xs font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-red-300 border-red-300/50 flex items-center gap-1"><Skull size={11} /> <span>{t("results.loss")}</span></span>;
  return <span className="text-xs font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-[#c8c8c8] border-white/25 flex items-center gap-1"><span>=</span><span>{t("results.draw")}</span></span>;
};

const slugify = (s) => String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80) || "adversaire";

export default function MatchDetail() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [allMatches, setAllMatches] = useState([]);
  const [rosterMembers, setRosterMembers] = useState([]);

  useEffect(() => {
    setError(false);
    setLoading(true);
    const unsub = onSnapshot(doc(db, "matches", id), (snap) => {
      if (!snap.exists()) { setMatch(null); setLoading(false); return; }
      setMatch({ id: snap.id, ...snap.data() });
      setLoading(false);
    }, (e)=>{ console.error(e); setError(true); setLoading(false); });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    // For H2H panel
    const unsub = onSnapshot(collection(db, "matches"), (snap) => {
      setAllMatches(snap.docs.map(d=>({id:d.id, ...d.data()})));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    // Roster for player links
    const unsub = onSnapshot(collection(db, "roster"), (snap) => {
      setRosterMembers(snap.docs.map(d=>({id:d.id, ...d.data()})));
    });
    return () => unsub();
  }, []);

  const teamName = useMemo(()=> getElysiumTeamName(match?.roster), [match]);
  const formattedDate = useMemo(()=> match ? fmtMatchDate(match, lang) : "", [match, lang]);
  const opponentSlug = useMemo(()=> match?.opponentName ? slugify(match.opponentName) : "", [match]);

  const maps = useMemo(()=>{
    if (!match) return [];
    // New structured format: array of {map, name, scoreUs, scoreThem} or {name, scoreUs, scoreThem}
    if (Array.isArray(match.maps) && match.maps.length>0) {
      // Handle legacy string format inside array? Normalize
      return match.maps.map((m,i)=>{
        if (typeof m === "string") {
          // Try parse "Nom | 13-7" or "Nom 13-7"
          const parts = m.split("|").map(s=>s.trim());
          if (parts.length>=2) {
            const [a,b] = parts[1].split("-").map(s=>s.trim());
            return { name: parts[0] || `Map ${i+1}`, scoreUs: a||"", scoreThem: b||"", raw: m };
          }
          return { name: m, scoreUs:"", scoreThem:"", raw:m };
        }
        return { name: m.map || m.name || `Map ${i+1}`, scoreUs: m.scoreUs ?? m.scoreElysium ?? "", scoreThem: m.scoreThem ?? m.scoreOpponent ?? "", raw: m };
      });
    }
    // Legacy string field? Check if maps stored as string lines
    if (typeof match.maps === "string" && match.maps.trim()) {
      return match.maps.split("\n").filter(Boolean).map((line,i)=>{
        const parts = line.split("|").map(s=>s.trim());
        if (parts.length>=2) {
          const [a,b]=parts[1].split("-").map(s=>s.trim());
          return { name: parts[0]||`Map ${i+1}`, scoreUs:a||"", scoreThem:b||"", raw:line };
        }
        return { name: line, scoreUs:"", scoreThem:"", raw:line };
      });
    }
    return [];
  }, [match]);

  const mvpPlayer = useMemo(()=>{
    if (!match?.mvp) return null;
    // mvp could be playerId or pseudo
    const found = rosterMembers.find(r=> r.id===match.mvp || r.pseudo===match.mvp);
    if (found) return found;
    // Check in match.players
    const inMatch = (match.players||[]).find(p=> p.playerId===match.mvp || p.pseudo===match.mvp);
    if (inMatch) return { pseudo: inMatch.pseudo, id: inMatch.playerId };
    return { pseudo: String(match.mvp) };
  }, [match, rosterMembers]);

  const jsonLd = useMemo(()=>{
    if (!match) return null;
    const startDate = match.date ? `${match.date}${match.time ? `T${match.time}` : ""}` : undefined;
    return {
      "@type": "SportsEvent",
      "@id": `${SITE_URL}/resultats/${match.id}#event`,
      name: `${teamName} vs ${match.opponentName || t("common.adversary")}`,
      startDate,
      eventStatus: match.status==="upcoming" ? "https://schema.org/EventScheduled" : match.status==="live" ? "https://schema.org/EventInProgress" : "https://schema.org/EventCompleted",
      sport: match.game || "Esport",
      competitor: [
        { "@type": "SportsTeam", name: teamName, memberOf: { "@id": `${SITE_URL}/#organization` } },
        { "@type": "SportsTeam", name: match.opponentName || t("common.adversary"), logo: match.opponentLogo },
      ],
      location: match.platform ? { "@type": "VirtualLocation", name: match.platform, url: match.watchUrl || match.vodUrl } : undefined,
      organizer: { "@id": `${SITE_URL}/#organization` },
    };
  }, [match, teamName, t]);

  useSEO({
    title: match ? `${teamName} vs ${match.opponentName || t("common.adversary")} — ${match.competition || "Match"} | ELYSIUM Esport` : "Match — ELYSIUM Esport",
    description: match ? `${match.scoreUs ?? "?"}–${match.scoreThem ?? "?"} · ${match.date||""} ${match.competition?`· ${match.competition}`:""} · ${teamName} vs ${match.opponentName}` : "Détail du match Elysium Esport",
    image: OG_VARIANTS.match,
    url: `/resultats/${id}`,
    jsonLd,
  });

  if (error) return <div className="min-h-[60vh] bg-[#111111] flex items-center justify-center"><ErrorState onRetry={()=>window.location.reload()} testId="match-detail-error" /></div>;
  if (loading) return <div className="min-h-[60vh] bg-[#111111]"><LoadingState testId="match-detail-loading" /></div>;
  if (!match) return (
    <div className="min-h-[60vh] bg-[#111111] flex flex-col items-center justify-center gap-4">
      <p className="text-[#c8c8c8]">Match introuvable.</p>
      <Link to="/resultats" className="border border-[#D8CA82]/50 text-[#D8CA82] px-5 py-2 text-xs uppercase tracking-widest">Retour aux résultats</Link>
    </div>
  );

  const upcoming = match.status==="upcoming";
  const live = match.status==="live";
  const us = Number(match.scoreUs);
  const them = Number(match.scoreThem);

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 relative">
          <PageBreadcrumb items={[{ label: t("results.title"), to: "/resultats" }, { label: `${teamName} vs ${match.opponentName}` }]} />
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="text-xs font-display tracking-[0.3em] uppercase text-[#D8CA82] border border-[#D8CA82]/40 px-2 py-0.5">{match.game||"EVA"}</span>
            {match.roster && <span className="text-xs font-display tracking-[0.25em] uppercase text-[#f7f7f7]/70 border border-white/15 px-2 py-0.5">{match.roster}</span>}
            <ResultBadge match={match} t={t} />
            {match.competition && <span className="text-xs text-[#D8CA82]/80 uppercase tracking-wider">{match.competition}</span>}
          </div>
          <h1 className="font-display font-black text-3xl sm:text-5xl text-[#f7f7f7] uppercase" data-testid="match-detail-title">{teamName} vs {match.opponentName}</h1>
          <p className="text-[#c8c8c8] mt-3">{formattedDate}{match.timezone ? ` (${match.timezone})` : ""}{match.platform ? ` — ${match.platform}` : ""}</p>
          {upcoming && <div className="mt-4"><MatchCountdown match={match} testId="match-detail-countdown" /></div>}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-10 grid lg:grid-cols-12 gap-10">
        {/* Main card */}
        <div className="lg:col-span-8 space-y-6">
          <div className="border border-white/10 bg-[#1A1A1A] p-6 sm:p-8" data-testid="match-detail-card">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col items-center gap-2 w-1/3">
                <OptimizedImage src="/brand/logo-icon-gold.png" alt={`Logo ${teamName}`} width="808" height="798" loading="lazy" className="h-16 w-auto object-contain" />
                <span className="text-sm font-display uppercase tracking-wider text-[#f7f7f7] text-center leading-tight">{teamName}</span>
              </div>
              <div className="text-center">
                {upcoming || (live && (match.scoreUs===undefined||match.scoreUs==="")) ? (
                  <p className="font-display font-black text-3xl text-[#c8c8c8]">VS</p>
                ) : (
                  <p className="font-display font-black text-5xl text-[#f7f7f7]">
                    <span className={us>them ? "text-[#D8CA82]" : "text-[#f7f7f7]"}>{match.scoreUs}</span>
                    <span className="text-[#a0a0a0] mx-3">—</span>
                    <span className="text-[#f7f7f7]">{match.scoreThem}</span>
                  </p>
                )}
                {live && <p className="text-xs uppercase tracking-widest text-red-300 mt-2 flex items-center justify-center gap-1"><Radio size={12}/> En direct</p>}
              </div>
              <div className="flex flex-col items-center gap-2 w-1/3">
                <OpponentLogo src={match.opponentLogo} name={match.opponentName} className="h-16 w-16" />
                <Link to={`/adversaires/${opponentSlug}`} className="text-sm font-display uppercase tracking-wider text-[#c8c8c8] text-center hover:text-[#D8CA82] hover:underline">{match.opponentName}</Link>
              </div>
            </div>

            <div className="mt-8 grid sm:grid-cols-2 gap-4">
              {(upcoming || live) && match.watchUrl && (
                <a href={match.watchUrl} target="_blank" rel="noopener noreferrer" data-testid="match-detail-watch"
                  className={`text-xs uppercase tracking-widest flex items-center justify-center gap-2 border px-4 py-3 ${live ? "bg-red-500/15 border-red-400/60 text-red-300 font-bold hover:bg-red-500/25" : "border-[#D8CA82]/50 text-[#D8CA82] hover:bg-[#D8CA82]/10"}`}>
                  {live ? <Radio size={14}/> : <PlayCircle size={14}/>} {live ? t("results.watchLive") : t("results.watch")}
                </a>
              )}
              {match.vodUrl && (
                <a href={match.vodUrl} target="_blank" rel="noopener noreferrer" data-testid="match-detail-vod"
                  className="text-xs uppercase tracking-widest flex items-center justify-center gap-2 border border-white/15 text-[#f7f7f7]/80 px-4 py-3 hover:border-[#D8CA82]/40 hover:text-[#D8CA82]">
                  <Film size={14}/> {t("results.vod")}
                </a>
              )}
            </div>
          </div>

          {/* Maps */}
          {maps.length>0 && (
            <div className="border border-white/10 bg-[#141414] p-6" data-testid="match-detail-maps">
              <h2 className="font-display text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-4 flex items-center gap-2"><MapIcon size={14}/> {t("results.maps")}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-widest text-[#c8c8c8] border-b border-white/10">
                    <tr><th className="text-left py-2">Map / Manche</th><th className="text-center">Elysium</th><th className="text-center">Adversaire</th><th className="text-right">Résultat</th></tr>
                  </thead>
                  <tbody>
                    {maps.map((m,i)=>{
                      const usN = Number(m.scoreUs);
                      const themN = Number(m.scoreThem);
                      const win = !isNaN(usN) && !isNaN(themN) ? usN>themN : null;
                      return (
                        <tr key={i} className="border-b border-white/5 last:border-0">
                          <td className="py-3 text-[#f7f7f7]">{m.name}</td>
                          <td className={`text-center font-bold ${win===true?"text-emerald-300": win===false?"text-red-300":"text-[#f7f7f7]"}`}>{m.scoreUs || "—"}</td>
                          <td className="text-center text-[#c8c8c8]">{m.scoreThem || "—"}</td>
                          <td className="text-right">{win===true ? <span className="text-emerald-300 text-xs uppercase">V</span> : win===false ? <span className="text-red-300 text-xs uppercase">D</span> : <span className="text-[#c8c8c8] text-xs">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Players + MVP */}
          <div className="grid sm:grid-cols-2 gap-6">
            {(match.players||[]).length>0 && (
              <div className="border border-white/10 bg-[#1A1A1A] p-6" data-testid="match-detail-players">
                <h2 className="font-display text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-4 flex items-center gap-2"><Users size={14}/> {t("results.players")}</h2>
                <div className="flex flex-wrap gap-2">
                  {(match.players||[]).map((p,idx)=>{
                    const found = rosterMembers.find(r=> r.id===p.playerId || r.pseudo===p.pseudo);
                    return found ? (
                      <Link key={p.playerId||idx} to={`/equipe/${found.id}`} className="border border-white/15 bg-[#141414] px-3 py-1.5 text-xs text-[#f7f7f7]/80 hover:border-[#D8CA82]/40 hover:text-[#D8CA82]">{p.pseudo||found.pseudo}</Link>
                    ) : (
                      <span key={p.playerId||idx} className="border border-white/15 bg-[#141414] px-3 py-1.5 text-xs text-[#f7f7f7]/80">{p.pseudo||"Joueur"}</span>
                    );
                  })}
                </div>
              </div>
            )}
            {mvpPlayer && (
              <div className="border border-[#D8CA82]/30 bg-[#D8CA82]/5 p-6" data-testid="match-detail-mvp">
                <h2 className="font-display text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-3 flex items-center gap-2"><Award size={14}/> {t("results.mvp")}</h2>
                {mvpPlayer.id ? (
                  <Link to={`/equipe/${mvpPlayer.id}`} className="text-[#f7f7f7] font-bold hover:text-[#D8CA82] hover:underline">{mvpPlayer.pseudo}</Link>
                ) : (
                  <p className="text-[#f7f7f7] font-bold">{mvpPlayer.pseudo}</p>
                )}
              </div>
            )}
          </div>

          {/* H2H */}
          {match.opponentName && allMatches.length>0 && (
            <div data-testid="match-detail-h2h">
              <HeadToHead matches={allMatches} opponentName={match.opponentName} testId="match-detail-h2h-panel" />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="lg:col-span-4 space-y-6">
          <div className="border border-white/10 bg-[#1A1A1A] p-6" data-testid="match-detail-share">
            <ShareButtons url={`${SITE_URL}/resultats/${match.id}`} text={`${teamName} vs ${match.opponentName || t("common.adversary")} ${!upcoming && !live ? `— ${match.scoreUs ?? "?"}-${match.scoreThem ?? "?"}` : ""}`} title={`Partager le match ${teamName} vs ${match.opponentName}`} testId={`match-detail-share-${match.id}`} />
            <p className="text-xs text-[#c8c8c8]/60 mt-3">Lien canonique : <span className="text-[#c8c8c8]">/resultats/{match.id}</span></p>
            <Link to="/resultats" className="mt-4 inline-flex text-xs uppercase tracking-widest text-[#D8CA82] hover:underline">← Tous les résultats</Link>
          </div>

          {opponentSlug && (
            <div className="border border-white/10 bg-[#141414] p-6" data-testid="match-detail-opponent-link">
              <p className="font-display text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-3">Fiche adversaire</p>
              <Link to={`/adversaires/${opponentSlug}`} className="flex items-center gap-3 group">
                <OpponentLogo src={match.opponentLogo} name={match.opponentName} className="h-10 w-10 border border-white/10" />
                <div>
                  <p className="text-sm text-[#f7f7f7] group-hover:text-[#D8CA82]">{match.opponentName}</p>
                  <p className="text-xs text-[#c8c8c8]">Voir le bilan complet →</p>
                </div>
              </Link>
            </div>
          )}

          <div className="border border-white/10 bg-[#0c0c0c] p-6" data-testid="match-detail-meta">
            <p className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] mb-3">Détails</p>
            <ul className="text-xs text-[#c8c8c8] space-y-2">
              <li>Date : <span className="text-[#f7f7f7]">{formattedDate}</span></li>
              {match.competition && <li>Compétition : <span className="text-[#f7f7f7]">{match.competition}</span></li>}
              {match.roster && <li>Roster : <span className="text-[#f7f7f7]">{match.roster} ({teamName})</span></li>}
              {match.game && <li>Jeu : <span className="text-[#f7f7f7]">{match.game}</span></li>}
              {match.platform && <li>Plateforme : <span className="text-[#f7f7f7]">{match.platform}</span></li>}
              <li>Statut : <span className="text-[#f7f7f7]">{match.status}</span></li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}
