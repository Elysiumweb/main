import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { ArrowRight, Trophy, Swords } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { SOCIALS } from "../lib/constants";
import { SocialIcon } from "../components/SocialIcon";
import { MatchCard } from "../components/MatchCard";

export default function Home() {
  const { t } = useLang();
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    return onSnapshot(collection(db, "matches"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      setMatches(list.slice(0, 3));
    }, (e) => console.error(e));
  }, []);

  return (
    <div className="bg-[#111111]">
      {/* HERO */}
      <section className="relative overflow-hidden min-h-[88vh] flex items-center" data-testid="home-hero">
        <div className="pattern-overlay" />
        <div className="absolute -right-24 top-1/2 -translate-y-1/2 opacity-[0.07] pointer-events-none">
          <img src="/brand/logo-icon-gold.png" alt="" className="w-[640px] max-w-none" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-24 relative w-full">
          <div className="max-w-3xl">
            <p className="anim-fade-up text-[#D8CA82] font-display text-xs sm:text-sm tracking-[0.5em] uppercase mb-6">
              Esport Team — Est. 2026
            </p>
            <h1 className="anim-fade-up font-display font-black text-5xl sm:text-6xl lg:text-8xl text-[#f7f7f7] leading-none" style={{ animationDelay: "0.1s" }}>
              ELYSIUM
            </h1>
            <p className="anim-fade-up font-display text-[#D8CA82] text-lg sm:text-2xl tracking-[0.3em] uppercase mt-4" style={{ animationDelay: "0.2s" }} data-testid="home-tagline">
              {t("home.tagline")}
            </p>
            <img src="/brand/accent-blade.png" alt="" className="anim-fade-up w-48 my-8 opacity-80" style={{ animationDelay: "0.25s" }} />
            <p className="anim-fade-up text-[#f7f7f7]/60 text-base sm:text-lg max-w-xl leading-relaxed" style={{ animationDelay: "0.3s" }}>
              {t("home.heroSub")}
            </p>
            <div className="anim-fade-up flex flex-wrap gap-4 mt-10" style={{ animationDelay: "0.4s" }}>
              <Link to="/recrutement" data-testid="home-cta-join"
                className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-4 inline-flex items-center gap-2 hover:shadow-[0_0_24px_rgba(216,202,130,0.45)] transition-shadow">
                {t("home.cta.join")} <ArrowRight size={16} />
              </Link>
              <Link to="/resultats" data-testid="home-cta-results"
                className="border border-white/25 text-[#f7f7f7] font-display uppercase tracking-widest text-sm px-8 py-4 hover:border-[#D8CA82] hover:text-[#D8CA82] transition-colors">
                {t("home.cta.results")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* MANIFESTO */}
      <section className="border-y border-white/10 bg-[#0c0c0c] relative overflow-hidden" data-testid="home-manifesto">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-24 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-4">
            <img src="/brand/logo-vertical-gold.png" alt="Elysium" className="w-56 mx-auto lg:mx-0 gold-glow" />
          </div>
          <div className="lg:col-span-8">
            <h2 className="font-display text-[#D8CA82] text-base md:text-lg tracking-[0.4em] uppercase mb-6">{t("home.manifesto.title")}</h2>
            <p className="text-[#f7f7f7]/80 text-xl sm:text-2xl leading-relaxed font-light">
              {t("home.manifesto.text")}
            </p>
          </div>
        </div>
      </section>

      {/* GAMES */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-24" data-testid="home-games">
        <div className="flex items-center gap-4 mb-10">
          <Swords className="text-[#D8CA82]" size={20} />
          <h2 className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#f7f7f7]">{t("home.games.title")}</h2>
          <div className="flex-1 h-px bg-white/10" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="relative border border-[#D8CA82]/30 bg-[#1A1A1A] p-8 group overflow-hidden" data-testid="home-game-eva">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-[#D8CA82]/10 to-transparent pointer-events-none" />
            <p className="font-display font-black text-4xl text-[#D8CA82]">EVA</p>
            <p className="text-xs tracking-[0.3em] uppercase text-[#f7f7f7]/40 mt-1">Esports Virtual Arenas</p>
            <p className="text-[#f7f7f7]/60 mt-4 leading-relaxed">{t("home.games.eva")}</p>
          </div>
          <div className="border border-white/10 bg-[#141414] p-8 flex items-center justify-center min-h-[180px]">
            <p className="font-display text-[#f7f7f7]/25 tracking-[0.3em] uppercase text-sm">Coming soon</p>
          </div>
        </div>
      </section>

      {/* LATEST RESULTS */}
      <section className="border-t border-white/10 bg-[#0c0c0c]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-24" data-testid="home-latest-results">
          <div className="flex items-center gap-4 mb-10">
            <Trophy className="text-[#D8CA82]" size={20} />
            <h2 className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#f7f7f7]">{t("home.latest.title")}</h2>
            <div className="flex-1 h-px bg-white/10" />
            <Link to="/resultats" className="text-xs uppercase tracking-widest text-[#D8CA82] hover:underline" data-testid="home-latest-all-link">
              {t("home.latest.all")}
            </Link>
          </div>
          {matches.length === 0 ? (
            <p className="text-[#f7f7f7]/40 tracking-wide" data-testid="home-latest-empty">{t("home.latest.empty")}</p>
          ) : (
            <div className="grid md:grid-cols-3 gap-6">
              {matches.map((m) => <MatchCard key={m.id} match={m} />)}
            </div>
          )}
        </div>
      </section>

      {/* SOCIALS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-24" data-testid="home-socials">
        <h2 className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#f7f7f7] mb-10">{t("home.socials.title")}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {SOCIALS.map((s) => (
            <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" data-testid={`home-social-${s.icon}`}
              className="border border-white/10 bg-[#1A1A1A] p-6 flex flex-col items-center gap-3 hover:border-[#D8CA82]/60 hover:-translate-y-1 transition-transform group">
              <span className="text-[#f7f7f7]/60 group-hover:text-[#D8CA82] transition-colors"><SocialIcon name={s.icon} size={28} /></span>
              <span className="text-xs font-display uppercase tracking-widest text-[#f7f7f7]/50">{s.name}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
