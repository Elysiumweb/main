import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { ArrowRight, Trophy, Swords, Radio, PlayCircle, Youtube, Heart, Users, CalendarClock, ExternalLink } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { SOCIALS, GAMES, getElysiumTeamName, getGameShortLabel } from "../lib/constants";
import { SocialIcon } from "../components/SocialIcon";
import { DonateBlock } from "../components/DonateButton";
import { CampaignProgress } from "../components/CampaignProgress";
import { MatchCountdown } from "../components/MatchCountdown";
import { OptimizedImage } from "../components/OptimizedImage";
import { Dialog, DialogContent, DialogTrigger } from "../components/ui/dialog";
import { videoEmbedUrl } from "./MediaGallery";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import { fmtMatchDate } from "../lib/formatters";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { setConsent, useConsent } from "../lib/consent";

/* Neutral initials plate when the opponent logo is missing/broken
   (mirrors MatchCard behavior, without implying any partnership). */
const OpponentMark = ({ src, name }) => {
  const [err, setErr] = useState(false);
  const safeName = (name || "TBD").trim();
  if (!src || err) {
    const initials = safeName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "?";
    return (
      <div role="img" aria-label={`Logo de l'équipe adverse indisponible : ${safeName}`}
        className="h-16 w-16 sm:h-20 sm:w-20 flex items-center justify-center border border-white/15 bg-[#0c0c0c] text-[#a0a0a0] font-display tracking-widest uppercase select-none">
        <span aria-hidden="true">{initials}</span>
      </div>
    );
  }
  return <img src={src} alt={`Logo de l'équipe adverse : ${safeName}`} onError={() => setErr(true)} loading="lazy" className="h-16 w-16 sm:h-20 sm:w-20 object-contain" />;
};

export default function Home() {
  const { t, lang } = useLang();
  const consent = useConsent();
  const [matches, setMatches] = useState([]);
  const [members, setMembers] = useState([]);
  const [videos, setVideos] = useState([]);
  const [discord, setDiscord] = useState(null);

  useEffect(() => {
    const u = onSnapshot(collection(db, "media"), (snap) => {
      const vids = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.type === "video");
      vids.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setVideos(vids.slice(0, 2));
    }, () => {});
    return u;
  }, []);

  // L'API Discord n'est interrogée qu'après le consentement « social » :
  // aucun appel réseau tiers avant le choix de l'utilisateur.
  useEffect(() => {
    if (!consent.social) {
      setDiscord(null);
      return;
    }
    let cancelled = false;
    fetch("https://discord.com/api/v9/invites/RH3ZZkMJsw?with_counts=true")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setDiscord({ online: d.approximate_presence_count, members: d.approximate_member_count });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [consent.social]);

  useEffect(() => {
    return onSnapshot(collection(db, "matches"), (snap) => {
      setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (e) => console.error(e));
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "roster"), (snap) => {
      setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (e) => console.error(e));
  }, []);

  // ---- preuves : prochain match, palmarès, effectif ----
  const nextMatch = useMemo(() => {
    const upcoming = matches.filter((m) => m.status === "upcoming");
    upcoming.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    return upcoming[0] || null;
  }, [matches]);

  const liveMatches = useMemo(() => matches.filter((m) => m.status === "live"), [matches]);

  const palmares = useMemo(() => {
    const finished = matches.filter((m) => m.status !== "upcoming");
    finished.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const wins = finished.filter((m) => Number(m.scoreUs) > Number(m.scoreThem)).length;
    const losses = finished.filter((m) => Number(m.scoreUs) < Number(m.scoreThem)).length;
    const draws = finished.length - wins - losses;
    const winRate = finished.length ? Math.round((wins / finished.length) * 100) : null;
    return { total: finished.length, wins, losses, draws, winRate, last: finished[0] || null };
  }, [matches]);

  const rosterStats = useMemo(() => {
    const players = members.filter((m) => m.status !== "staff");
    const byGame = GAMES.map((g) => ({ game: g, count: players.filter((p) => p.game === g).length }));
    return { total: players.length, byGame, sample: players.slice(0, 5) };
  }, [members]);

  return (
    <div className="bg-[#111111]">
      {/* HERO */}
      <section className="relative overflow-hidden min-h-[88vh] flex items-center" data-testid="home-hero" aria-labelledby="home-h1">
        <div className="pattern-overlay" />
        <div className="absolute -right-10 sm:-right-16 lg:-right-24 top-1/2 -translate-y-1/2 opacity-[0.07] pointer-events-none" aria-hidden="true">
          <OptimizedImage src="/brand/logo-icon-gold.png" alt="" width="640" height="640" loading="lazy" className="w-[260px] sm:w-[400px] lg:w-[560px] xl:w-[640px] max-w-none" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-24 relative w-full">
          <div className="max-w-3xl">
            <p className="anim-fade-up motion-reduce:animate-none text-[#D8CA82] font-display text-xs sm:text-sm tracking-[0.5em] uppercase mb-6">
              Esport Team — Est. 2026
            </p>
            <h1 id="home-h1" className="anim-fade-up motion-reduce:animate-none font-display font-black text-5xl sm:text-6xl lg:text-8xl text-[#f7f7f7] leading-none" style={{ animationDelay: "0.1s" }}>
              ELYSIUM
            </h1>
            <p className="anim-fade-up motion-reduce:animate-none font-display text-[#D8CA82] text-lg sm:text-2xl tracking-[0.3em] uppercase mt-4" style={{ animationDelay: "0.2s" }} data-testid="home-tagline">
              {t("home.tagline")}
            </p>
            <OptimizedImage src="/brand/accent-blade.png" alt="" aria-hidden="true" width="192" height="32" loading="lazy" className="anim-fade-up motion-reduce:animate-none w-48 my-8 opacity-80" style={{ animationDelay: "0.25s" }} />
            <p className="anim-fade-up motion-reduce:animate-none text-[#c8c8c8] text-base sm:text-lg max-w-xl leading-relaxed" style={{ animationDelay: "0.3s" }}>
              {t("home.heroSub")}
            </p>
            <div className="anim-fade-up motion-reduce:animate-none flex flex-wrap gap-4 mt-10" style={{ animationDelay: "0.4s" }}>
              <Button variant="gold" size="lg" asChild>
                <Link to="/recrutement" data-testid="home-cta-join"
                  onClick={() => trackEvent(ANALYTICS_EVENTS.RECRUIT_CLICK, { source: "home_hero" })}>
                  {t("home.cta.join")} <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link to="/resultats" data-testid="home-cta-results">
                  {t("home.cta.results")}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* BANDEAU LIVE — match en direct */}
      {liveMatches.length > 0 && (
        <section className="border-b border-red-400/40 bg-red-500/10" data-testid="home-live-banner" aria-label={t("live.banner")}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 flex items-center gap-4 flex-wrap">
            <span className="relative flex h-3 w-3" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-400" />
            </span>
            <p className="font-display text-xs uppercase tracking-[0.3em] text-red-300 font-bold">{t("results.liveNow")} :</p>
            {liveMatches.map((m) => (
              <span key={m.id} className="text-sm text-[#f7f7f7]">
                {getElysiumTeamName(m.roster)} vs {m.opponentName || "?"}
                {m.watchUrl && (
                  <a href={m.watchUrl} target="_blank" rel="noopener noreferrer" data-testid={`home-live-banner-link-${m.id}`}
                    onClick={() => trackEvent(ANALYTICS_EVENTS.LIVE_CLICK, { source: "home_live_banner", matchId: m.id, platform: m.platform || "watchUrl" })}
                    className="ml-3 inline-flex items-center gap-1.5 bg-red-500 text-white text-[11px] font-display font-bold uppercase tracking-widest px-3 py-1.5 hover:bg-red-400 transition-colors">
                    <Radio size={12} aria-hidden="true" /> {t("live.banner.watch")}
                  </a>
                )}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* MANIFESTO */}
      <section className="border-y border-white/10 bg-[#0c0c0c] relative overflow-hidden" data-testid="home-manifesto" aria-labelledby="home-manifesto-h2">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-24 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-4">
            <OptimizedImage src="/brand/logo-vertical-gold.png" alt="Logo vertical Elysium" width="224" height="280" loading="lazy" className="w-40 sm:w-48 lg:w-56 mx-auto lg:mx-0 gold-glow" />
          </div>
          <div className="lg:col-span-8">
            <h2 id="home-manifesto-h2" className="font-display text-[#D8CA82] text-base md:text-lg tracking-[0.4em] uppercase mb-6">{t("home.manifesto.title")}</h2>
            <p className="text-[#c8c8c8] text-xl sm:text-2xl leading-relaxed font-light">
              {t("home.manifesto.text")}
            </p>
          </div>
        </div>
      </section>

      {/* GAMES */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-24" data-testid="home-games" aria-labelledby="home-games-h2">
        <div className="flex items-center gap-4 mb-10">
          <Swords className="text-[#D8CA82]" size={20} aria-hidden="true" />
          <h2 id="home-games-h2" className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#f7f7f7]">{t("home.games.title")}</h2>
          <div className="flex-1 h-px bg-white/10" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="relative border border-[#D8CA82]/30 bg-[#1A1A1A] p-8 group overflow-hidden flex flex-col" data-testid="home-game-eva">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 motion-reduce:group-hover:opacity-0 transition-opacity duration-200 ease-out bg-gradient-to-br from-[#D8CA82]/10 to-transparent pointer-events-none" />
            <div className="flex items-start justify-between">
              <p className="font-display font-black text-4xl text-[#D8CA82]">EVA</p>
              <Badge variant="eva" size="md">{t("home.games.eva.team")}</Badge>
            </div>
            <p className="text-xs tracking-[0.3em] uppercase text-[#c8c8c8] mt-2">{t("home.games.eva.short")}</p>
            <p className="text-[#c8c8c8] mt-4 leading-relaxed flex-1">{t("home.games.eva")}</p>
            <Link to="/equipe?game=EVA" className="mt-6 inline-flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-[#D8CA82] hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]">
              {t("home.games.discover")} <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </div>
          <div className="relative border border-white/10 bg-[#141414] p-8 group overflow-hidden flex flex-col hover:border-[#D8CA82]/50 u-micro" data-testid="home-game-rl">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 motion-reduce:group-hover:opacity-0 transition-opacity duration-200 ease-out bg-gradient-to-br from-[#D8CA82]/[0.07] to-transparent pointer-events-none" />
            <div className="absolute -right-6 -top-6 w-24 h-24 opacity-10 pointer-events-none" aria-hidden="true">
              <div className="w-full h-full border-2 border-[#D8CA82] rotate-12" />
            </div>
            <div className="flex items-start justify-between">
              <p className="font-display font-black text-4xl text-[#f7f7f7] group-hover:text-[#D8CA82] u-micro">RL</p>
              <Badge variant="outline" size="md" className="group-hover:text-[#D8CA82] group-hover:border-[#D8CA82]/50 u-micro">{t("home.games.rl.team")}</Badge>
            </div>
            <p className="text-xs tracking-[0.3em] uppercase text-[#c8c8c8] mt-2">{t("home.games.rl.short")}</p>
            <p className="text-[#c8c8c8] mt-4 leading-relaxed flex-1">{t("home.games.rl")}</p>
            <div className="mt-6 flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest bg-[#D8CA82] text-[#111111] px-2.5 py-1 font-bold">{t("home.badge.new")}</span>
              <Link to="/equipe?game=Rocket%20League" className="inline-flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-[#c8c8c8] hover:text-[#D8CA82] u-micro focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]">
                {t("home.games.discover")} <ArrowRight size={12} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className="relative border border-[#FF4655]/20 bg-[#141414] p-8 group overflow-hidden flex flex-col hover:border-[#FF4655]/60 u-micro" data-testid="home-game-valo">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 motion-reduce:group-hover:opacity-0 transition-opacity duration-200 ease-out bg-gradient-to-br from-[#FF4655]/[0.09] to-transparent pointer-events-none" />
            <div className="flex items-start justify-between">
              <p className="font-display font-black text-4xl text-[#f7f7f7] group-hover:text-[#FF4655] u-micro">VALO</p>
              <Badge variant="outline" size="md" className="group-hover:text-[#FF4655] group-hover:border-[#FF4655]/50 u-micro">{t("home.games.valo.team")}</Badge>
            </div>
            <p className="text-xs tracking-[0.3em] uppercase text-[#c8c8c8] mt-2">{t("home.games.valo.short")}</p>
            <p className="text-[#c8c8c8] mt-4 leading-relaxed flex-1">{t("home.games.valo")}</p>
            <div className="mt-6 flex items-center gap-3 flex-wrap">
              <span className="text-[10px] uppercase tracking-widest border border-[#FF4655]/30 text-[#FF4655]/90 px-2 py-1">Valeureux · Vaillant</span>
              <Link to="/equipe?game=Valorant" className="inline-flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-[#c8c8c8] hover:text-[#FF4655] u-micro focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF4655]">
                {t("home.games.discover")} <ArrowRight size={12} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className="border border-white/10 bg-[#0c0c0c] p-8 flex flex-col justify-center relative overflow-hidden">
            <p className="font-display text-[#c8c8c8] tracking-[0.3em] uppercase text-xs mb-3">Elysium • 2026</p>
            <p className="text-[#c8c8c8] text-sm leading-relaxed">{t("home.games.pillars")}</p>
            <div className="mt-6 h-px bg-white/10" />
            <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-[#D8CA82]/70">Not given. Earned.</p>
          </div>
        </div>
      </section>

      {/* PREUVES — bento asymétrique : prochain match / palmarès / effectif */}
      <section className="border-t border-white/10 bg-[#0c0c0c]" aria-labelledby="home-proof-h2">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-24" data-testid="home-latest-results">
          <div className="flex items-center gap-4 mb-10">
            <Trophy className="text-[#D8CA82]" size={20} aria-hidden="true" />
            <h2 id="home-proof-h2" className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#f7f7f7]">{t("home.proof.title")}</h2>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-8">
            {/* PROCHAIN MATCH — grande tuile */}
            <article className="sm:col-span-2 lg:col-span-4 lg:row-span-2 relative border border-white/10 bg-[#111111] overflow-hidden flex flex-col group hover:border-[#D8CA82]/50 u-micro" data-testid="home-proof-next-match">
              <img src="https://images.pexels.com/photos/9072212/pexels-photo-9072212.jpeg?auto=compress&cs=tinysrgb&w=1200"
                alt="" aria-hidden="true" loading="lazy" decoding="async" width="1200" height="800"
                className="absolute inset-0 w-full h-full object-cover opacity-25 saturate-[0.4] contrast-125" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0c] via-[#0c0c0c]/80 to-[#0c0c0c]/40" aria-hidden="true" />
              <div className="relative p-8 lg:p-12 flex flex-col flex-1">
                <p className="text-[10px] font-display uppercase tracking-[0.4em] text-[#D8CA82] mb-8 flex items-center gap-2">
                  <CalendarClock size={13} aria-hidden="true" /> {t("home.proof.nextMatch")}
                </p>
                {nextMatch ? (
                  <div className="flex-1 flex flex-col justify-between gap-8">
                    <div className="flex items-center justify-center gap-6 sm:gap-12" data-testid="home-proof-vs">
                      <div className="flex flex-col items-center gap-3">
                        <OptimizedImage src="/brand/logo-icon-gold.png" alt={`Logo ${getElysiumTeamName(nextMatch.roster)}`} width="80" height="80" loading="lazy" className="h-16 sm:h-20 object-contain gold-glow" />
                        <span className="font-display uppercase tracking-[0.25em] text-sm text-[#f7f7f7] text-center leading-tight">{getElysiumTeamName(nextMatch.roster)}</span>
                      </div>
                      <span className="font-display font-black text-3xl sm:text-5xl text-[#D8CA82]" aria-hidden="true">VS</span>
                      <div className="flex flex-col items-center gap-3">
                        <OpponentMark src={nextMatch.opponentLogo} name={nextMatch.opponentName} />
                        <span className="font-display uppercase tracking-[0.25em] text-sm text-[#f7f7f7] text-center max-w-[140px] truncate">{nextMatch.opponentName || "TBD"}</span>
                      </div>
                    </div>
                    <MatchCountdown match={nextMatch} testId="home-next-match-countdown" />
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/10 pt-6">
                      <span className="text-[10px] font-display uppercase tracking-[0.3em] text-[#D8CA82] border border-[#D8CA82]/40 px-2 py-0.5">{nextMatch.game || "EVA"}</span>
                      {nextMatch.roster && <span className="text-[10px] font-display uppercase tracking-[0.25em] text-[#f7f7f7]/70 border border-white/15 px-2 py-0.5">{nextMatch.roster}</span>}
                      {nextMatch.competition && <span className="text-xs uppercase tracking-[0.25em] text-[#f7f7f7]/70">{nextMatch.competition}</span>}
                      <span className="text-xs text-[#f7f7f7]/60">{fmtMatchDate(nextMatch, lang)}{nextMatch.timezone ? ` (${nextMatch.timezone})` : ""}</span>
                      {nextMatch.watchUrl && (
                        <a href={nextMatch.watchUrl} target="_blank" rel="noopener noreferrer" data-testid="home-proof-watch-link"
                          onClick={() => trackEvent(ANALYTICS_EVENTS.LIVE_CLICK, { source: "home_next_match", matchId: nextMatch.id, platform: nextMatch.platform || "watchUrl" })}
                          className="ml-auto inline-flex items-center gap-2 bg-[#D8CA82] text-[#111111] text-xs font-display font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_12px_rgba(216,202,130,0.4)] u-micro-shadow focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]">
                          <PlayCircle size={13} aria-hidden="true" /> {t("home.proof.watch")}
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-start justify-center gap-4">
                    <p className="text-[#c8c8c8] text-lg" data-testid="home-latest-empty">{t("home.proof.noUpcoming")}</p>
                    <Link to="/calendrier" className="inline-flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-[#D8CA82] hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]">
                      {t("nav.calendar")} <ArrowRight size={12} aria-hidden="true" />
                    </Link>
                  </div>
                )}
              </div>
            </article>

            {/* PALMARÈS */}
            <article className="lg:col-span-2 border border-white/10 bg-[#1A1A1A] p-8 flex flex-col hover:border-[#D8CA82]/50 u-micro" data-testid="home-proof-palmares">
              <p className="text-[10px] font-display uppercase tracking-[0.4em] text-[#D8CA82] mb-6 flex items-center gap-2">
                <Trophy size={13} aria-hidden="true" /> {t("home.proof.palmares")}
              </p>
              {palmares.total === 0 ? (
                <p className="text-[#c8c8c8] text-sm flex-1 flex items-center">{t("home.latest.empty")}</p>
              ) : (
                <>
                  <p className="font-display font-black text-5xl text-[#D8CA82]" data-testid="home-proof-winrate">{palmares.winRate}<span className="text-2xl">%</span></p>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-[#c8c8c8] mt-1 mb-6">{t("home.proof.winRate")}</p>
                  <div className="flex gap-4 text-center">
                    <div>
                      <p className="font-display font-bold text-xl text-emerald-300">{palmares.wins}</p>
                      <p className="text-[9px] uppercase tracking-widest text-[#c8c8c8]">W</p>
                    </div>
                    <div>
                      <p className="font-display font-bold text-xl text-red-300">{palmares.losses}</p>
                      <p className="text-[9px] uppercase tracking-widest text-[#c8c8c8]">L</p>
                    </div>
                    <div>
                      <p className="font-display font-bold text-xl text-[#f7f7f7]/60">{palmares.draws}</p>
                      <p className="text-[9px] uppercase tracking-widest text-[#c8c8c8]">D</p>
                    </div>
                  </div>
                  {palmares.last && (
                    <p className="mt-auto pt-5 text-[11px] text-[#f7f7f7]/50 leading-snug">
                      {t("home.proof.lastResult")} : <span className="text-[#f7f7f7]/80">{palmares.last.scoreUs}—{palmares.last.scoreThem}</span> {getElysiumTeamName(palmares.last.roster)} vs {palmares.last.opponentName || "?"}
                    </p>
                  )}
                </>
              )}
              <Link to="/resultats" data-testid="home-latest-all-link"
                className="mt-5 inline-flex items-center gap-2 text-[11px] font-display uppercase tracking-[0.25em] text-[#D8CA82] hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]">
                {t("home.latest.all")} <ArrowRight size={11} aria-hidden="true" />
              </Link>
            </article>

            {/* EFFECTIF */}
            <article className="lg:col-span-2 border border-white/10 bg-[#141414] p-8 flex flex-col hover:border-[#D8CA82]/50 u-micro" data-testid="home-proof-roster">
              <p className="text-[10px] font-display uppercase tracking-[0.4em] text-[#D8CA82] mb-6 flex items-center gap-2">
                <Users size={13} aria-hidden="true" /> {t("home.proof.roster")}
              </p>
              <p className="font-display font-black text-5xl text-[#f7f7f7]">{rosterStats.total}</p>
              <p className="text-[10px] uppercase tracking-[0.3em] text-[#c8c8c8] mt-1 mb-6">{t("home.proof.players")}</p>
              <div className="flex flex-wrap gap-2">
                {rosterStats.byGame.map((g) => (
                  <span key={g.game} className="text-[10px] uppercase tracking-widest border border-white/15 text-[#f7f7f7]/70 px-2 py-1">
                    {getGameShortLabel(g.game)} · {g.count}
                  </span>
                ))}
              </div>
              {rosterStats.sample.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4" aria-hidden="true">
                  {rosterStats.sample.map((p) => (
                    <span key={p.id} className="text-[10px] font-display uppercase tracking-wider bg-white/5 border border-white/10 text-[#f7f7f7]/60 px-2 py-0.5">{p.pseudo}</span>
                  ))}
                  {rosterStats.total > rosterStats.sample.length && (
                    <span className="text-[10px] font-display uppercase tracking-wider text-[#D8CA82]/80 px-2 py-0.5">+{rosterStats.total - rosterStats.sample.length}</span>
                  )}
                </div>
              )}
              <Link to="/equipe" data-testid="home-proof-team-link"
                className="mt-auto pt-5 inline-flex items-center gap-2 text-[11px] font-display uppercase tracking-[0.25em] text-[#D8CA82] hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]">
                {t("home.proof.viewTeam")} <ArrowRight size={11} aria-hidden="true" />
              </Link>
            </article>
          </div>
        </div>
      </section>

      {/* LIVE TWITCH / YOUTUBE */}
      <section className="border-t border-white/10" aria-labelledby="home-live-h2">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-24" data-testid="home-live">
          <div className="flex items-center gap-4 mb-10 flex-wrap">
            <Radio className="text-[#D8CA82]" size={20} aria-hidden="true" />
            <h2 id="home-live-h2" className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#f7f7f7]">{t("home.live.title")}</h2>
            <div className="flex-1 h-px bg-white/10" />
            <a href="https://www.twitch.tv/elysiumxeva" target="_blank" rel="noopener noreferrer" data-testid="home-live-twitch-cta"
              onClick={() => trackEvent(ANALYTICS_EVENTS.LIVE_CLICK, { source: "home_live", platform: "twitch" })}
              className="bg-[#D8CA82] text-[#111111] text-xs font-display font-bold uppercase tracking-widest px-4 py-2 flex items-center gap-2 hover:shadow-[0_0_12px_rgba(216,202,130,0.4)] u-micro-shadow focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]">
              <PlayCircle size={14} aria-hidden="true" /> {t("home.live.watch")}
            </a>
            <a href="https://www.youtube.com/@elysiumfr" target="_blank" rel="noopener noreferrer" data-testid="home-live-youtube-cta"
              onClick={() => trackEvent(ANALYTICS_EVENTS.LIVE_CLICK, { source: "home_live", platform: "youtube" })}
              className="border border-white/25 text-[#c8c8c8] text-xs uppercase tracking-widest px-4 py-2 flex items-center gap-2 hover:border-[#D8CA82] hover:text-[#D8CA82] u-micro focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]">
              <Youtube size={14} aria-hidden="true" /> {t("home.live.youtube")}
            </a>
          </div>
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="border border-white/10 bg-[#0d0d0d]">
              {consent.social ? (
                <iframe title="Twitch Elysium" data-testid="home-twitch-embed"
                  src={`https://player.twitch.tv/?channel=elysiumxeva&parent=${window.location.hostname}&muted=true`}
                  className="w-full aspect-video" allowFullScreen />
              ) : (
                <div className="w-full aspect-video flex flex-col items-center justify-center gap-4 px-6 text-center" data-testid="home-twitch-consent">
                  <p className="text-xs text-[#f7f7f7]/60 max-w-sm leading-relaxed">{t("consent.social.prompt")}</p>
                  <button onClick={() => setConsent({ social: true })} data-testid="home-twitch-consent-btn"
                    className="border border-[#D8CA82]/50 text-[#D8CA82] text-xs font-display font-bold uppercase tracking-widest px-5 py-2.5 hover:bg-[#D8CA82]/10 transition-colors">
                    {t("consent.social.load")}
                  </button>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-4">{t("home.live.replays")}</p>
              {videos.length === 0 ? (
                <p className="text-[#c8c8c8]" data-testid="home-replays-empty">{t("home.live.noReplays")}</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4" data-testid="home-replays">
                  {videos.map((v) => {
                    const embed = videoEmbedUrl(v.url);
                    return (
                      <Dialog key={v.id}>
                        <DialogTrigger asChild>
                          <button className="group relative border border-white/10 bg-[#0d0d0d] overflow-hidden text-left hover:border-[#D8CA82]/50 transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
                            data-testid={`home-replay-${v.id}`}
                            aria-label={`${t("home.live.watchReplay")} : ${v.title}`}>
                            {v.thumbnail ? (
                              <img src={v.thumbnail} alt="" loading="lazy" decoding="async" className="w-full aspect-video object-cover opacity-70 group-hover:opacity-90 transition-opacity" />
                            ) : (
                              <div className="w-full aspect-video canvas-dots" />
                            )}
                            <span className="absolute inset-0 flex items-center justify-center">
                              <PlayCircle size={40} className="text-[#D8CA82] drop-shadow-[0_0_8px_rgba(0,0,0,0.8)]" aria-hidden="true" />
                            </span>
                            <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#0c0c0c] to-transparent px-3 pt-8 pb-2 text-xs font-semibold text-[#f7f7f7] truncate">
                              {v.title}
                            </span>
                          </button>
                        </DialogTrigger>
                        <DialogContent className="bg-[#111111] border border-[#D8CA82]/30 rounded-none max-w-3xl p-2" data-testid={`home-replay-lightbox-${v.id}`}>
                          {embed && consent.social ? (
                            <iframe src={embed} title={v.title} className="w-full aspect-video" allowFullScreen allow="autoplay; fullscreen" />
                          ) : embed ? (
                            <div className="w-full aspect-video flex flex-col items-center justify-center gap-3 px-6 text-center">
                              <p className="text-xs text-[#f7f7f7]/60 max-w-sm">{t("consent.social.prompt")}</p>
                              <button onClick={() => setConsent({ social: true })} data-testid={`home-replay-consent-btn-${v.id}`}
                                className="border border-[#D8CA82]/50 text-[#D8CA82] text-xs font-display font-bold uppercase tracking-widest px-4 py-2 hover:bg-[#D8CA82]/10 transition-colors">
                                {t("consent.social.load")}
                              </button>
                            </div>
                          ) : (
                            <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-[#D8CA82] underline p-8 block text-center flex items-center justify-center gap-2">
                              <ExternalLink size={15} aria-hidden="true" /> {v.title}
                            </a>
                          )}
                          <p className="text-sm text-[#f7f7f7]/70 px-2 pb-2">{v.title}</p>
                        </DialogContent>
                      </Dialog>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* DISCORD */}
      <section className="border-t border-white/10 bg-[#0c0c0c] relative overflow-hidden" aria-labelledby="home-discord-h2">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-24 relative grid lg:grid-cols-2 gap-12 items-center" data-testid="home-discord">
          <div>
            <h2 id="home-discord-h2" className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#f7f7f7] mb-6">{t("home.discord.title")}</h2>
            {discord && (
              <div className="flex gap-8 mb-8" data-testid="home-discord-stats">
                <div>
                  <p className="font-display font-black text-4xl text-[#D8CA82]">{discord.online}</p>
                  <p className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-300 inline-block" aria-hidden="true" />
                    <span>{t("home.discord.online")}</span>
                  </p>
                </div>
                <div>
                  <p className="font-display font-black text-4xl text-[#f7f7f7]">{discord.members}</p>
                  <p className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8]">{t("home.discord.members")}</p>
                </div>
              </div>
            )}
            <Button variant="gold" size="lg" asChild>
              <a href="https://discord.gg/RH3ZZkMJsw" target="_blank" rel="noopener noreferrer" data-testid="home-discord-cta"
                onClick={() => trackEvent(ANALYTICS_EVENTS.DISCORD_CLICK, { source: "home_discord" })}>
                <SocialIcon name="discord" size={18} aria-hidden="true" /> {t("home.discord.cta")}
              </a>
            </Button>
          </div>
          <div className="border border-white/10 bg-[#141414] p-8" data-testid="home-discord-rules">
            <p className="text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-5">{t("home.discord.faq")}</p>
            <ul className="space-y-4">
              {[1, 2, 3].map((i) => (
                <li key={i} className="flex gap-4 text-sm text-[#c8c8c8]">
                  <span className="font-display font-bold text-[#D8CA82] shrink-0">0{i}</span>
                  {t(`home.discord.rule${i}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* SOUTENIR / DONS */}
      <section className="border-t border-white/10" aria-labelledby="donate-block-h2">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-24" data-testid="home-donate">
          <div className="flex items-center gap-4 mb-10">
            <Heart className="text-[#D8CA82]" size={20} aria-hidden="true" />
            <h2 id="donate-block-h2" className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#f7f7f7]">{t("donate.title")}</h2>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <div className="mb-8"><CampaignProgress testId="home-campaign-progress" /></div>
          <DonateBlock testId="home-donate-block" />
        </div>
      </section>

      {/* SOCIALS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-24" data-testid="home-socials" aria-labelledby="home-socials-h2">
        <h2 id="home-socials-h2" className="font-display text-base md:text-lg tracking-[0.4em] uppercase text-[#f7f7f7] mb-10">{t("home.socials.title")}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {SOCIALS.map((s) => (
            <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" data-testid={`home-social-${s.icon}`} aria-label={`${s.name} (${t("footer.opensNewTab")})`}
              onClick={() => s.icon === "discord" && trackEvent(ANALYTICS_EVENTS.DISCORD_CLICK, { source: "home_socials" })}
              className="border border-white/10 bg-[#1A1A1A] p-6 flex flex-col items-center gap-3 hover:border-[#D8CA82]/50 hover:-translate-y-1 motion-reduce:hover:translate-y-0 u-micro group focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]">
              <span className="text-[#c8c8c8] group-hover:text-[#D8CA82] u-micro" aria-hidden="true"><SocialIcon name={s.icon} size={28} /></span>
              <span className="text-xs font-display uppercase tracking-widest text-[#c8c8c8]">{s.name}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
