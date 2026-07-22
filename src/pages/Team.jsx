import { useEffect, useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { Users } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { SocialIcon } from "../components/SocialIcon";
import { GAMES } from "../lib/constants";

const ORDER = ["player", "sub", "staff"];

export const PlayerPhoto = ({ src, alt, className }) => {
  const [error, setError] = useState(false);
  if (!src || error) {
    return (
      <div className={`${className} bg-[#111111] flex items-center justify-center`}>
        <img src="/brand/logo-icon-gold.png" alt="" className="w-1/3 opacity-40" />
      </div>
    );
  }
  return <img src={src} alt={alt} onError={() => setError(true)} className={`${className} object-cover`} />;
};

export default function Team() {
  const { t } = useLang();
  const [members, setMembers] = useState(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const gameFilter = searchParams.get("game") || "all";

  useEffect(() => {
    setError(false); setMembers(null);
    return onSnapshot(collection(db, "roster"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (a.pseudo || "").localeCompare(b.pseudo || ""));
      setMembers(list);
    }, (e) => { console.error(e); setError(true); });
  }, [retryKey]);

  const filtered = useMemo(()=>{
    if(!members) return [];
    if(gameFilter==="all") return members;
    return members.filter(m=> (m.game||"").toLowerCase() === gameFilter.toLowerCase() || m.game===gameFilter);
  }, [members, gameFilter]);

  const groups = ORDER.map((s) => ({ status: s, list: filtered.filter((m) => m.status === s) })).filter((g) => g.list.length);

  const byGame = useMemo(()=>{
    const map = { all: members?.length||0 };
    GAMES.forEach(g=> map[g]= members?.filter(m=> m.game===g).length||0);
    return map;
  }, [members]);

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20 relative">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="team-title">{t("team.title")}</h1>
              <p className="text-[#f7f7f7]/50 mt-4 tracking-wide max-w-xl">{t("team.sub")}</p>
            </div>
            <div className="flex items-center gap-2 border border-white/10 bg-[#141414] p-1 self-end">
              <button onClick={()=> setSearchParams({})} data-testid="filter-all"
                className={`px-4 py-2 text-[11px] uppercase tracking-[0.25em] transition-colors ${gameFilter==="all"?"bg-[#D8CA82] text-[#111111] font-bold":"text-[#f7f7f7]/50 hover:text-[#f7f7f7]"}`}>
                {t("team.filter.all")} ({byGame.all})
              </button>
              {GAMES.map(g=>(
                <button key={g} onClick={()=> setSearchParams({game:g})} data-testid={`filter-${g}`}
                  className={`px-4 py-2 text-[11px] uppercase tracking-[0.25em] transition-colors flex items-center gap-2 ${gameFilter===g ? "bg-[#D8CA82] text-[#111111] font-bold" : "text-[#f7f7f7]/50 hover:text-[#f7f7f7]"}`}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: g==="Rocket League"?"#F4511E":"#D8CA82"}} />
                  {g==="Rocket League"? t("team.filter.rl") : t("team.filter.eva")} ({byGame[g]||0})
                </button>
              ))}
            </div>
          </div>

          {/* EVA & RL highlight */}
          <div className="mt-10 grid sm:grid-cols-2 gap-4 max-w-2xl">
            <div className={`border p-4 flex items-center gap-4 ${gameFilter==="EVA"||gameFilter==="all" ? "border-[#D8CA82]/40 bg-[#D8CA82]/5" : "border-white/10 bg-[#141414]/50"}`}>
              <p className="font-display font-black text-2xl text-[#D8CA82]">EVA</p>
              <p className="text-xs text-[#f7f7f7]/60">Esports Virtual Arenas — arène VR compétitive</p>
            </div>
            <div className={`border p-4 flex items-center gap-4 ${gameFilter==="Rocket League"||gameFilter==="all" ? "border-[#F4511E]/40 bg-[#F4511E]/5" : "border-white/10 bg-[#141414]/50"}`}>
              <p className="font-display font-black text-2xl text-[#f7f7f7]">RL</p>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#F4511E]">Nouveau pôle</p>
                <p className="text-xs text-[#f7f7f7]/60">Rocket League — car football</p>
              </div>
            </div>
          </div>
        </div>
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
                  <h2 className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#D8CA82]">{t(`team.status.${g.status}`)}</h2>
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/30">{g.list.length} joueurs</span>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {g.list.map((m) => (
                    <Link key={m.id} to={`/equipe/${m.id}`} data-testid={`team-card-${m.id}`}
                      className="group border border-white/10 bg-[#1A1A1A] hover:border-[#D8CA82]/60 transition-colors overflow-hidden">
                      <PlayerPhoto src={m.photo} alt={m.pseudo} className="w-full h-52" />
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-display font-bold text-lg text-[#f7f7f7] group-hover:text-[#D8CA82] transition-colors">{m.pseudo}</p>
                          <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${m.game==="Rocket League" ? "border-[#F4511E]/50 text-[#F4511E] bg-[#F4511E]/10" : "border-[#D8CA82]/30 text-[#D8CA82]/70"}`}>{m.game==="Rocket League" ? "RL" : m.game}</span>
                        </div>
                        {m.ingameRole && <p className="text-xs uppercase tracking-[0.25em] text-[#D8CA82]/60 mt-1">{m.ingameRole}</p>}
                        {m.bio && <p className="text-sm text-[#f7f7f7]/50 mt-3 line-clamp-2">{m.bio}</p>}
                        <div className="flex items-center gap-3 mt-4">
                          {["x", "twitch", "instagram", "youtube"].filter((k) => m.socials?.[k]).map((k) => (
                            <span key={k} className="text-[#f7f7f7]/40"><SocialIcon name={k} size={14} /></span>
                          ))}
                          <span className="ml-auto text-[10px] uppercase tracking-widest text-[#D8CA82]/60">{t("team.view")} →</span>
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
