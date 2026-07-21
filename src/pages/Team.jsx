import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { Users } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { SocialIcon } from "../components/SocialIcon";

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

  useEffect(() => {
    setError(false); setMembers(null);
    return onSnapshot(collection(db, "roster"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (a.pseudo || "").localeCompare(b.pseudo || ""));
      setMembers(list);
    }, (e) => { console.error(e); setError(true); });
  }, [retryKey]);

  const groups = ORDER.map((s) => ({ status: s, list: (members || []).filter((m) => m.status === s) })).filter((g) => g.list.length);

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20 relative">
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="team-title">{t("team.title")}</h1>
          <p className="text-[#f7f7f7]/50 mt-4 tracking-wide">{t("team.sub")}</p>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
        {error ? (
          <ErrorState onRetry={() => setRetryKey((k) => k + 1)} testId="team-error" />
        ) : members === null ? (
          <LoadingState testId="team-loading" />
        ) : members.length === 0 ? (
          <EmptyState icon={Users} text={t("team.empty")} testId="team-empty" />
        ) : (
          <div className="space-y-16" data-testid="team-grid">
            {groups.map((g) => (
              <div key={g.status}>
                <div className="flex items-center gap-4 mb-8">
                  <h2 className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#D8CA82]">{t(`team.status.${g.status}`)}</h2>
                  <div className="flex-1 h-px bg-white/10" />
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {g.list.map((m) => (
                    <Link key={m.id} to={`/equipe/${m.id}`} data-testid={`team-card-${m.id}`}
                      className="group border border-white/10 bg-[#1A1A1A] hover:border-[#D8CA82]/60 transition-colors overflow-hidden">
                      <PlayerPhoto src={m.photo} alt={m.pseudo} className="w-full h-52" />
                      <div className="p-5">
                        <p className="font-display font-bold text-lg text-[#f7f7f7] group-hover:text-[#D8CA82] transition-colors">{m.pseudo}</p>
                        <p className="text-xs uppercase tracking-[0.25em] text-[#D8CA82]/70 mt-1">{m.game}{m.ingameRole ? ` · ${m.ingameRole}` : ""}</p>
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
