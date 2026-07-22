import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { ArrowRight, Trophy, Swords, Radio, PlayCircle, Youtube } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { SOCIALS } from "../lib/constants";
import { SocialIcon } from "../components/SocialIcon";
import { MatchCard } from "../components/MatchCard";
import { videoEmbedUrl } from "./MediaGallery";

export default function Home() {
  const { t } = useLang();
  const [matches, setMatches] = useState([]);
  const [videos, setVideos] = useState([]);
  const [discord, setDiscord] = useState(null);

  useEffect(() => {
    const u = onSnapshot(collection(db, "media"), (snap) => {
      const vids = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.type === "video");
      vids.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setVideos(vids.slice(0, 2));
    }, () => {});
    fetch("https://discord.com/api/v9/invites/RH3ZZkMJsw?with_counts=true")
      .then((r) => r.json())
      .then((d) => setDiscord({ online: d.approximate_presence_count, members: d.approximate_member_count }))
      .catch(() => {});
    return u;
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "matches"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.status !== "upcoming");
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
          <div className="relative border border-[#9146FF]/30 bg-[#1A1A1A] p-8 group overflow-hidden" data-testid="home-game-rocketleague">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-[#9146FF]/10 to-transparent pointer-events-none" />
            <p className="font-display font-black text-4xl text-[#9146FF]">RL</p>
            <p className="text-xs tracking-[0.3em] uppercase text-[#f7f7f7]/40 mt-1">Rocket League</p>
            <p className="text-[#f7f7f7]/60 mt-4 leading-relaxed">{t("home.games.rocketleague")}</p>
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

      {/* LIVE TWITCH / YOUTUBE */}
      <section className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-24" data-testid="home-live">
          <div className="flex items-center gap-4 mb-10 flex-wrap">
            <Radio className="text-[#D8CA82]" size={20} />
            <h2 className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#f7f7f7]">{t("home.live.title")}</h2>
            <div className="flex-1 h-px bg-white/10" />
            <a href="https://www.twitch.tv/elysiumxeva" target="_blank" rel="noopener noreferrer" data-testid="home-live-twitch-cta"
              className="bg-[#D8CA82] text-[#111111] text-xs font-display font-bold uppercase tracking-widest px-4 py-2 flex items-center gap-2 hover:shadow-[0_0_12px_rgba(216,202,130,0.4)] transition-shadow">
              <PlayCircle size={14} /> {t("home.live.watch")}
            </a>
            <a href="https://www.youtube.com/@elysiumfr" target="_blank" rel="noopener noreferrer" data-testid="home-live-youtube-cta"
              className="border border-white/25 text-[#f7f7f7]/70 text-xs uppercase tracking-widest px-4 py-2 flex items-center gap-2 hover:border-[#D8CA82] hover:text-[#D8CA82] transition-colors">
              <Youtube size={14} /> {t("home.live.youtube")}
            </a>
          </div>
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="border border-white/10 bg-[#0d0d0d]">
              <iframe title="Twitch Elysium" data-testid="home-twitch-embed"
                src={`https://player.twitch.tv/?channel=elysiumxeva&parent=${window.location.hostname}&muted=true`}
                className="w-full aspect-video" allowFullScreen />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-4">{t("home.live.replays")}</p>
              {videos.length === 0 ? (
                <p className="text-[#f7f7f7]/40" data-testid="home-replays-empty">{t("home.live.noReplays")}</p>
              ) : (
                <div className="space-y-4" data-testid="home-replays">
                  {videos.map((v) => {
                    const embed = videoEmbedUrl(v.url);
                    return embed ? (
                      <iframe key={v.id} title={v.title} src={embed} className="w-full aspect-video border border-white/10" allowFullScreen />
                    ) : (
                      <a key={v.id} href={v.url} target="_blank" rel="noopener noreferrer" className="block text-[#D8CA82] underline text-sm">{v.title}</a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* DISCORD */}
      <section className="border-t border-white/10 bg-[#0c0c0c] relative overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-24 relative grid lg:grid-cols-2 gap-12 items-center" data-testid="home-discord">
          <div>
            <h2 className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#f7f7f7] mb-6">{t("home.discord.title")}</h2>
            {discord && (
              <div className="flex gap-8 mb-8" data-testid="home-discord-stats">
                <div>
                  <p className="font-display font-black text-4xl text-[#D8CA82]">{discord.online}</p>
                  <p className="text-xs uppercase tracking-[0.25em] text-[#f7f7f7]/40 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> {t("home.discord.online")}
                  </p>
                </div>
                <div>
                  <p className="font-display font-black text-4xl text-[#f7f7f7]">{discord.members}</p>
                  <p className="text-xs uppercase tracking-[0.25em] text-[#f7f7f7]/40">{t("home.discord.members")}</p>
                </div>
              </div>
            )}
            <a href="https://discord.gg/RH3ZZkMJsw" target="_blank" rel="noopener noreferrer" data-testid="home-discord-cta"
              className="inline-flex items-center gap-3 bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-4 hover:shadow-[0_0_24px_rgba(216,202,130,0.45)] transition-shadow">
              <SocialIcon name="discord" size={18} /> {t("home.discord.cta")}
            </a>
          </div>
          <div className="border border-white/10 bg-[#141414] p-8" data-testid="home-discord-rules">
            <p className="text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-5">{t("home.discord.faq")}</p>
            <ul className="space-y-4">
              {[1, 2, 3].map((i) => (
                <li key={i} className="flex gap-4 text-sm text-[#f7f7f7]/70">
                  <span className="font-display font-bold text-[#D8CA82] shrink-0">0{i}</span>
                  {t(`home.discord.rule${i}`)}
                </li>
              ))}
            </ul>
          </div>
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
