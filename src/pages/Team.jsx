import { useEffect, useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { Users, Search, ArrowUpDown } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { SocialIcon } from "../components/SocialIcon";
import { GAMES, getGameColor, getGameShortLabel, isRemovedGame } from "../lib/constants";
import { useRosters } from "../hooks/useRosters";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { Badge } from "../components/ui/badge";

const GAME_FILTER_KEYS = {
  "EVA": "team.filter.eva",
  "Rocket League": "team.filter.rl",
};

const gameBadgeVariant = (game) =>
  game === "Rocket League" ? "rl" : "eva";

const ORDER = ["player", "sub", "staff"];

export const PlayerPhoto = ({ src, alt, className }) => {
  const [error, setError] = useState(false);
  if (!src || error) {
    return (
      <div className={`${className} bg-background flex items-center justify-center`}>
        <img src="/brand/logo-icon-gold.png" alt="" className="w-1/3 opacity-40" />
      </div>
    );
  }
  return <img src={src} alt={alt} onError={() => setError(true)} className={`${className} object-cover`} />;
};

export default function Team() {
  const { t } = useLang();
  const { rostersForGame, gameHasRosters } = useRosters();
  const [members, setMembers] = useState(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const gameFilter = searchParams.get("game") || "all";
  const rosterFilter = searchParams.get("roster") || "all";
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("pseudo"); // pseudo | role | status

  useEffect(() => {
    setError(false); setMembers(null);
    return onSnapshot(collection(db, "roster"), (snap) => {
      // Les fiches des pôles supprimés (ex. Valorant) sont masquées du public.
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => !isRemovedGame(m.game));
      list.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (a.pseudo || "").localeCompare(b.pseudo || ""));
      setMembers(list);
    }, (e) => { console.error(e); setError(true); });
  }, [retryKey]);

  const filtered = useMemo(()=>{
    if(!members) return [];
    let list = members;
    if(gameFilter!=="all") list = list.filter(m=> (m.game||"").toLowerCase() === gameFilter.toLowerCase() || m.game===gameFilter);
    if(rosterFilter!=="all") list = list.filter(m=> m.roster===rosterFilter);
    if(query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(m => (m.pseudo||"").toLowerCase().includes(q) || (m.ingameRole||"").toLowerCase().includes(q) || (m.bio||"").toLowerCase().includes(q));
    }
    if (sortBy === "pseudo") list = [...list].sort((a, b) => (a.pseudo || "").localeCompare(b.pseudo || ""));
    else if (sortBy === "role") list = [...list].sort((a, b) => (a.ingameRole || "").localeCompare(b.ingameRole || "") || (a.pseudo || "").localeCompare(b.pseudo || ""));
    else list = [...list].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (a.pseudo || "").localeCompare(b.pseudo || ""));
    return list;
  }, [members, gameFilter, rosterFilter, query, sortBy]);

  const groups = ORDER.map((s) => ({ status: s, list: filtered.filter((m) => m.status === s) })).filter((g) => g.list.length);

  const byGame = useMemo(()=>{
    const map = { all: members?.length||0 };
    GAMES.forEach(g=> map[g]= members?.filter(m=> m.game===g).length||0);
    return map;
  }, [members]);

  return (
    <div className="min-h-[70vh] bg-transparent">
      <section className="relative overflow-hidden pt-6 sm:pt-10">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb className="opacity-80" items={[{ label: t("team.title") }]} />
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl uppercase leading-[0.95] text-gold" data-testid="team-title">{t("team.title")}</h1>
              <p className="mt-4 max-w-xl text-lg text-muted-foreground">{t("team.sub")}</p>
              <Link to="/staff" className="clip-blade-sm inline-flex mt-5 border border-primary/40 text-primary px-4 py-2 font-label text-xs font-semibold uppercase tracking-[0.2em] hover:bg-primary/10">Découvrir le staff & l'encadrement →</Link>
            </div>
            <div className="flex flex-col items-end gap-2 self-end">
              <div className="flex items-center gap-2 panel clip-blade-sm p-1">
                <button onClick={()=> setSearchParams({})} data-testid="filter-all"
                  className={`clip-blade-sm px-4 py-2 font-label text-xs font-semibold uppercase tracking-[0.2em] transition-colors ${gameFilter==="all"?"bg-gold text-primary-foreground":"text-muted-foreground hover:text-foreground"}`}>
                  {t("team.filter.all")} ({byGame.all})
                </button>
                {GAMES.map(g=>(
                  <button key={g} onClick={()=> setSearchParams({game:g})} data-testid={`filter-${g}`}
                    className={`clip-blade-sm px-4 py-2 font-label text-xs font-semibold uppercase tracking-[0.2em] transition-colors flex items-center gap-2 ${gameFilter===g ? "bg-gold text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: getGameColor(g)}} />
                    {GAME_FILTER_KEYS[g] ? t(GAME_FILTER_KEYS[g]) : g} ({byGame[g]||0})
                  </button>
                ))}
              </div>
              {/* Sous-filtres par roster (rosters gérés depuis le panel admin) */}
              {GAMES.filter((g)=> gameHasRosters(g) && (gameFilter==="all" || gameFilter===g)).map((g)=>(
                <div key={g} className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground mr-1">{getGameShortLabel(g)}</span>
                  {rostersForGame(g).map(r=>{
                    const count = members?.filter(m=> m.roster===r).length||0;
                    const active = rosterFilter===r;
                    const color = getGameColor(g);
                    return (
                      <button key={r} onClick={()=> setSearchParams(active ? (gameFilter==="all"?{}:{game:g}) : {game:g,roster:r})} data-testid={`filter-roster-${r}`}
                        style={active ? { borderColor: color, color, backgroundColor: `${color}1A` } : undefined}
                        className={`px-3 py-1.5 text-xs uppercase tracking-[0.2em] border transition-colors ${active ? "font-bold" : "border-border/30 text-muted-foreground hover:text-foreground/70"}`}>
                        {r} ({count})
                      </button>
                    );
                  })}
                </div>
              ))}
              {/* Recherche par pseudo + tri */}
              <div className="flex items-center gap-2 w-full sm:w-auto" data-testid="team-search-sort">
                <div className="relative flex-1 sm:w-52">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("team.search")}
                    aria-label={t("team.search")}
                    data-testid="team-search-input"
                    className="w-full bg-card/70 border border-border/30 pl-8 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <ArrowUpDown size={12} className="text-muted-foreground" aria-hidden="true" />
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label={t("team.sort")} data-testid="team-sort-select"
                    className="bg-card/70 border border-border/30 px-2 py-2 text-xs text-foreground focus:outline-none focus:border-primary">
                    <option value="pseudo">{t("team.sort.pseudo")}</option>
                    <option value="role">{t("team.sort.role")}</option>
                    <option value="status">{t("team.sort.status")}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* EVA & RL highlight */}
          <div className="mt-10 grid sm:grid-cols-2 gap-4 max-w-4xl">
            <div className={`border p-4 flex items-center gap-4 ${gameFilter==="EVA"||gameFilter==="all" ? "border-primary/50 bg-primary/5" : "border-border/25 bg-card/50"}`}>
              <p className="font-display font-black text-2xl text-primary">EVA</p>
              <p className="text-xs text-foreground/60">{t("team.evaSub")}</p>
            </div>
            <div className={`border p-4 flex items-center gap-4 ${gameFilter==="Rocket League"||gameFilter==="all" ? "border-[#F4511E]/50 bg-[#F4511E]/5" : "border-border/25 bg-card/50"}`}>
              <p className="font-display font-black text-2xl text-foreground">RL</p>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#F4511E]">{t("team.newPole")}</p>
                <p className="text-xs text-foreground/60">{t("team.rlSub")}</p>
              </div>
            </div>
          </div>
          {/* Groupe — composition par roster + photo de groupe — D-03 */}
          <div className="mt-10 border border-border/25 bg-background/70 p-6" data-testid="team-group-photo">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-2 h-2 bg-gold rounded-full" />
              <p className="font-display text-xs uppercase tracking-[0.3em] text-primary">Compositions par roster — photos de groupe authentiques</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {GAMES.map((g)=> {
                const count = byGame[g] || 0;
                return (
                  <div key={g} className="panel clip-blade-sm p-4 flex flex-col" data-testid={`team-roster-${g}`}>
                    <div className="h-40 bg-background border border-border/20 flex items-center justify-center overflow-hidden">
                      <img src={count>0 ? `/brand/logo-icon-${g==="EVA"?"gold":"white"}.png` : "/brand/pattern.png"} alt="" className="w-20 opacity-20 object-contain" />
                    </div>
                    <p className="font-display font-bold text-foreground mt-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{backgroundColor:getGameColor(g)}} /> {g} · {count} joueurs</p>
                    <p className="text-xs text-muted-foreground mt-1">{count>0 ? "Roster au complet — portraits plus grands, même traitement visuel" : "En cours de composition"}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(members||[]).filter(m=>m.game===g).slice(0,4).map(m=> (
                        <span key={m.id} className="text-xs border border-border/25 bg-background px-2 py-1 text-muted-foreground">{m.pseudo}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-2">
        <div className="flex flex-wrap items-center justify-between gap-4" data-testid="team-filter-bar">
          <p className="text-xs text-muted-foreground" data-testid="team-count">{filtered.length} joueur(s) {query ? `· recherche "${query}"` : ""}</p>
          {(gameFilter!=="all" || rosterFilter!=="all" || query) && (<button onClick={()=>{setSearchParams({}); setQuery("");}} data-testid="team-reset" className="text-xs uppercase tracking-widest text-primary hover:underline">Tout réinitialiser</button>)}
        </div>
        {(gameFilter!=="all" || rosterFilter!=="all" || query) && (
          <div className="flex flex-wrap gap-2 mt-3" data-testid="team-active-filters">
            {gameFilter!=="all" && <button onClick={()=>setSearchParams({})} data-testid="team-badge-game" className="border border-primary/40 bg-primary/10 text-primary text-xs px-3 py-1.5">Jeu: {gameFilter} ✕</button>}
            {rosterFilter!=="all" && <button onClick={()=>setSearchParams(gameFilter!=="all"?{game:gameFilter}:{})} data-testid="team-badge-roster" className="border border-primary/40 bg-primary/10 text-primary text-xs px-3 py-1.5">Roster: {rosterFilter} ✕</button>}
            {query && <button onClick={()=>setQuery("")} data-testid="team-badge-query" className="border border-border/35 bg-card text-muted-foreground text-xs px-3 py-1.5">Recherche: {query} ✕</button>}
          </div>
        )}
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
        {error ? (
          <ErrorState onRetry={() => setRetryKey((k) => k + 1)} testId="team-error" />
        ) : members === null ? (
          <LoadingState testId="team-loading" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Users} text={t("team.empty")} testId="team-empty" />
        ) : (
          <div className="space-y-16" data-testid="team-grid">
            {groups.map((g) => (
              <div key={g.status}>
                <div className="flex items-center gap-4 mb-8">
                  <h2 className="eyebrow">{t(`team.status.${g.status}`)}</h2>
                  <div className="flex-1 gold-line opacity-50" />
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">{g.list.length} {t("team.players")}</span>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {g.list.map((m) => (
                    <Link key={m.id} to={`/equipe/${m.id}`} data-testid={`team-card-${m.id}`}
                      className="group panel clip-blade-sm hover:border-primary/50 transition-colors overflow-hidden">
                      <PlayerPhoto src={m.photo} alt={m.pseudo} className="w-full h-64 sm:h-72" />
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-display font-bold text-lg text-foreground group-hover:text-primary transition-colors">{m.pseudo}</p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {m.roster && <Badge variant="outline" size="sm">{m.roster}</Badge>}
                            <Badge variant={gameBadgeVariant(m.game)} size="sm">{getGameShortLabel(m.game)}</Badge>
                          </div>
                        </div>
                        {m.ingameRole && <p className="text-xs uppercase tracking-[0.25em] text-primary/60 mt-1">{m.ingameRole}</p>}
                        <div className="flex flex-wrap gap-1.5 mt-2">{m.availableForMatch && <span className="text-[10px] uppercase tracking-widest text-emerald-200 border border-emerald-300/30 bg-emerald-300/5 px-2 py-1">● Dispo match</span>}{m.recruitmentStatus && m.recruitmentStatus !== "closed" && <span className="text-[10px] uppercase tracking-widest text-primary border border-primary/30 px-2 py-1">Recrutement</span>}</div>
                        {m.bio && <p className="text-sm text-foreground/50 mt-3 line-clamp-2 whitespace-pre-wrap">{m.bio}</p>}
                        <div className="flex items-center gap-3 mt-4">
                          {["x", "twitch", "instagram", "youtube", "tiktok"].filter((k) => m.socials?.[k]).map((k) => (
                            <span key={k} className="text-muted-foreground"><SocialIcon name={k} size={14} /></span>
                          ))}
                          <span className="ml-auto text-xs uppercase tracking-widest text-primary/60">{t("team.view")} →</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
