import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { ArrowRight, Trophy, Swords, Radio, PlayCircle, Youtube, Heart, Users, CalendarClock, ExternalLink, Shirt, Handshake } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { SOCIALS, GAMES, getElysiumTeamName, getGameShortLabel, isRemovedGame } from "../lib/constants";
import { SocialIcon } from "../components/SocialIcon";
import { RecruitHomeBlock } from "../components/RecruitHomeBlock";
import { DonateBlock } from "../components/DonateButton";
import { CampaignProgress } from "../components/CampaignProgress";
import { MatchCountdown } from "../components/MatchCountdown";
import { OptimizedImage } from "../components/OptimizedImage";
import { Dialog, DialogContent, DialogTrigger } from "../components/ui/dialog";
import { videoEmbedUrl } from "./MediaGallery";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import { fmtMatchDate } from "../lib/formatters";
import { getEffectiveMatchStatus, useNowMs } from "../lib/matchStatus";
import { Button } from "../components/ui/button";
import { RiseTitle } from "../components/site/Headings";
import { Badge } from "../components/ui/badge";
import { partnerFichePath, partnerLogoSrc, visiblePartners } from "../lib/partners";

/* Neutral initials plate when the opponent logo is missing/broken
   (mirrors MatchCard behavior, without implying any partnership). */
const OpponentMark = ({ src, name }) => {
  const [err, setErr] = useState(false);
  const safeName = (name || "TBD").trim();
  if (!src || err) {
    const initials = safeName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "?";
    return (
      <div role="img" aria-label={`Logo de l'équipe adverse indisponible : ${safeName}`}
        className="h-16 w-16 sm:h-20 sm:w-20 flex items-center justify-center border border-border/30 bg-background/70 text-muted-foreground font-display tracking-widest uppercase select-none">
        <span aria-hidden="true">{initials}</span>
      </div>
    );
  }
  return <img src={src} alt={`Logo de l'équipe adverse : ${safeName}`} onError={() => setErr(true)} loading="lazy" className="h-16 w-16 sm:h-20 sm:w-20 object-contain" />;
};

const PartnerMark = ({ src, name }) => {
  const [err, setErr] = useState(false);
  const safeName = (name || "Partenaire").trim();
  if (!src || err) {
    const initials = safeName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "?";
    return (
      <span
        role="img"
        aria-label={`Logo indisponible : ${safeName}`}
        className="h-14 w-full flex items-center justify-center border border-border/25 bg-background/70 text-muted-foreground font-display tracking-[0.25em] uppercase text-xs"
      >
        <span aria-hidden="true">{initials}</span>
      </span>
    );
  }
  return <img src={src} alt={`Logo : ${safeName}`} onError={() => setErr(true)} loading="lazy" decoding="async" className="h-14 w-full object-contain opacity-75 group-hover:opacity-100 transition-opacity" />;
};

export default function Home() {
  const { t, lang } = useLang();
  const nowMs = useNowMs();
  const [matches, setMatches] = useState([]);
  const [members, setMembers] = useState([]);
  const [videos, setVideos] = useState([]);
  const [discord, setDiscord] = useState(null);
  const [partners, setPartners] = useState([]);

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

  // Partenaires publiés : la bande « Ils nous font confiance » reste masquée
  // tant qu'aucun logo n'est enregistré depuis l'admin.
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "partners"), (snap) => {
      setPartners(visiblePartners(snap.docs.map((d) => ({ id: d.id, ...d.data() }))).slice(0, 10));
    }, () => {});
    return unsub;
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "matches"), (snap) => {
      // Matchs des pôles supprimés (ex. Valorant) masqués du public.
      setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => !isRemovedGame(m.game)));
    }, (e) => console.error(e));
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "roster"), (snap) => {
      setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => !isRemovedGame(m.game)));
    }, (e) => console.error(e));
  }, []);

  // ---- preuves : prochain match, palmarès, effectif ----
  const nextMatch = useMemo(() => {
    const upcoming = matches.filter((m) => getEffectiveMatchStatus(m, nowMs) === "upcoming");
    upcoming.sort((a, b) => `${a.date || ""}T${a.time || "00:00"}`.localeCompare(`${b.date || ""}T${b.time || "00:00"}`));
    return upcoming[0] || null;
  }, [matches, nowMs]);

  const liveMatches = useMemo(
    () => matches.filter((m) => getEffectiveMatchStatus(m, nowMs) === "live"),
    [matches, nowMs]
  );

  const palmares = useMemo(() => {
    const finished = matches.filter((m) => getEffectiveMatchStatus(m, nowMs) === "finished");
    finished.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const wins = finished.filter((m) => Number(m.scoreUs) > Number(m.scoreThem)).length;
    const losses = finished.filter((m) => Number(m.scoreUs) < Number(m.scoreThem)).length;
    const draws = finished.length - wins - losses;
    const winRate = finished.length ? Math.round((wins / finished.length) * 100) : null;
    return { total: finished.length, wins, losses, draws, winRate, last: finished[0] || null };
  }, [matches, nowMs]);

  const rosterStats = useMemo(() => {
    const players = members.filter((m) => m.status !== "staff");
    const byGame = GAMES.map((g) => ({ game: g, count: players.filter((p) => p.game === g).length }));
    return { total: players.length, byGame, sample: players.slice(0, 5) };
  }, [members]);

  return (
    <div className="bg-background">
      {/* HERO */}
      <section className="relative flex min-h-[78svh] items-end pb-14 pt-14 sm:min-h-[72vh] sm:items-center sm:pb-0" data-testid="home-hero" aria-labelledby="home-h1">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 w-full relative">
          <div className="max-w-2xl">
            <p className="eyebrow anim-fade-up motion-reduce:animate-none mb-6">
              Esport Team — Est. 2026
            </p>
            <h1 id="home-h1" className="anim-fade-up motion-reduce:animate-none whitespace-nowrap font-display font-black text-[clamp(3rem,13vw,7.5rem)] uppercase leading-[0.85]">
              <RiseTitle text="ELYSIUM" className="text-gold" />
            </h1>
            <p className="anim-fade-up motion-reduce:animate-none mt-5 font-display text-base font-semibold uppercase tracking-[0.4em] text-primary sm:text-2xl" style={{ animationDelay: "0.2s" }} data-testid="home-tagline">
              {t("home.tagline")}
            </p>
            <p className="anim-fade-up motion-reduce:animate-none mt-6 max-w-md text-base text-muted-foreground leading-relaxed sm:text-lg" style={{ animationDelay: "0.3s" }}>
              {t("home.heroSub")}
            </p>
            <div className="anim-fade-up motion-reduce:animate-none mt-9 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: "0.4s" }}>
              <Button variant="gold" size="xl" asChild>
                <Link to="/recrutement" data-testid="home-cta-join"
                  onClick={() => trackEvent(ANALYTICS_EVENTS.RECRUIT_CLICK, { source: "home_hero" })}>
                  {t("home.cta.join")} <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </Button>
              <Button variant="frame" size="xl" asChild>
                <Link to="/resultats" data-testid="home-cta-results">
                  {t("home.cta.results")}
                </Link>
              </Button>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-5 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 sm:flex" aria-hidden="true">
          <span className="eyebrow text-[0.55rem] opacity-70">Défiler</span>
          <span className="h-10 w-px bg-primary/60 animate-pulse" />
        </div>
      </section>

      {/* PRIMARY — live > prochain match > dernier résultat > article à la une — D-02 : immédiatement sous le hero, une seule preuve forte au-dessus de la ligne de flottaison */}
      <section className="border-b border-border/25 bg-background/70" data-testid="home-primary" aria-labelledby="home-primary-h2">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
          <div className="flex items-center gap-3 mb-6">
            <Radio className="text-primary" size={16} aria-hidden="true" />
            <h2 id="home-primary-h2" className="eyebrow !text-[0.62rem]">À la une</h2>
            <div className="flex-1 gold-line opacity-50" />
            <Link to="/resultats" className="text-xs uppercase tracking-widest text-primary hover:underline">Tous les matchs →</Link>
          </div>
          {liveMatches.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-4" data-testid="home-primary-live">
              {liveMatches.slice(0,2).map((m) => (
                <div key={m.id} className="border border-red-400/40 bg-red-500/10 p-5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-red-300 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" /> En direct</p>
                    <p className="font-display font-bold text-foreground mt-2">{getElysiumTeamName(m.roster)} vs {m.opponentName || "?"}</p>
                    <p className="text-xs text-muted-foreground mt-1">{fmtMatchDate(m, lang)} · {m.competition || m.game || "EVA"}</p>
                  </div>
                  {m.watchUrl && (
                    <a href={m.watchUrl} target="_blank" rel="noopener noreferrer" data-testid={`home-primary-watch-${m.id}`} onClick={() => trackEvent(ANALYTICS_EVENTS.LIVE_CLICK, { source: "home_primary", matchId: m.id })} className="bg-red-500 text-foreground text-xs font-display font-bold uppercase tracking-widest px-4 py-2 hover:bg-red-400">Regarder</a>
                  )}
                </div>
              ))}
            </div>
          ) : nextMatch ? (
            <div className="panel clip-blade-sm border border-primary/30 p-6 flex flex-col sm:flex-row items-center gap-6" data-testid="home-primary-next">
              <div className="flex items-center gap-4">
                <OptimizedImage src="/brand/logo-icon-gold.png" alt="" width="808" height="798" className="h-12 w-12 object-contain gold-glow" />
                <span className="font-display font-black text-xl text-foreground">VS</span>
                <div className="h-12 w-12 flex items-center justify-center border border-border/30 bg-background/70 text-muted-foreground text-xs">{(nextMatch.opponentName||"?").slice(0,2).toUpperCase()}</div>
              </div>
              <div className="flex-1 text-center sm:text-left">
                <p className="text-xs uppercase tracking-[0.3em] text-primary">Prochain match</p>
                <p className="font-display font-bold text-foreground mt-1">{getElysiumTeamName(nextMatch.roster)} vs {nextMatch.opponentName || "TBD"} — {nextMatch.competition || nextMatch.game}</p>
                <p className="text-xs text-muted-foreground mt-1">{fmtMatchDate(nextMatch, lang)} {nextMatch.timezone ? `(${nextMatch.timezone})` : ""}</p>
              </div>
              <MatchCountdown match={nextMatch} testId="home-primary-countdown" />
            </div>
          ) : palmares.last ? (
            <div className="panel clip-blade-sm p-6 flex items-center justify-between" data-testid="home-primary-last">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-primary">Dernier résultat</p>
                <p className="font-display font-bold text-foreground mt-1">{getElysiumTeamName(palmares.last.roster)} {palmares.last.scoreUs}—{palmares.last.scoreThem} vs {palmares.last.opponentName}</p>
                <p className="text-xs text-muted-foreground mt-1">{fmtMatchDate(palmares.last, lang)} · {palmares.last.competition || ""} · {palmares.winRate}% win rate</p>
              </div>
              <Link to="/resultats" className="border border-primary/40 text-primary text-xs uppercase tracking-widest px-4 py-2 hover:bg-primary/10">Voir les résultats</Link>
            </div>
          ) : (
            <div className="panel clip-blade-sm p-6 text-center" data-testid="home-primary-empty">
              <p className="text-sm text-muted-foreground">Aucun match programmé — découvre l’équipe et notre univers.</p>
              <Link to="/equipe" className="mt-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-primary hover:underline">Découvrir l’équipe <ArrowRight size={12} /></Link>
            </div>
          )}
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
              <span key={m.id} className="text-sm text-foreground">
                {getElysiumTeamName(m.roster)} vs {m.opponentName || "?"}
                {m.watchUrl && (
                  <a href={m.watchUrl} target="_blank" rel="noopener noreferrer" data-testid={`home-live-banner-link-${m.id}`}
                    onClick={() => trackEvent(ANALYTICS_EVENTS.LIVE_CLICK, { source: "home_live_banner", matchId: m.id, platform: m.platform || "watchUrl" })}
                    className="ml-3 inline-flex items-center gap-1.5 bg-red-500 text-foreground text-xs font-display font-bold uppercase tracking-widest px-3 py-1.5 hover:bg-red-400 transition-colors">
                    <Radio size={12} aria-hidden="true" /> {t("live.banner.watch")}
                  </a>
                )}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* MANIFESTO */}
      <section className="border-y border-border/25 bg-background/70 relative overflow-hidden" data-testid="home-manifesto" aria-labelledby="home-manifesto-h2">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 grid lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-4">
            <OptimizedImage src="/brand/logo-vertical-gold.png" alt="Logo vertical Elysium" width="817" height="690" loading="lazy" className="w-40 sm:w-48 lg:w-56 h-auto mx-auto lg:mx-0 gold-glow" />
          </div>
          <div className="lg:col-span-8">
            <h2 id="home-manifesto-h2" className="eyebrow mb-4">{t("home.manifesto.title")}</h2>
            <p className="font-display text-3xl font-black uppercase leading-[1.05] sm:text-4xl lg:text-5xl mb-6">
              Not given. <span className="text-gold">Earned.</span>
            </p>
            <p className="text-muted-foreground text-lg sm:text-xl leading-relaxed">
              {t("home.manifesto.text")}
            </p>
          </div>
        </div>
      </section>

      {/* BOUTIQUE — lancement du maillot officiel */}
      <section className="border-b border-border/25 bg-background" data-testid="home-shop" aria-labelledby="home-shop-title">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
          <div className="grid md:grid-cols-2 panel clip-blade overflow-hidden group">
            <div className="relative aspect-square bg-background/70 overflow-hidden">
              <img
                src="https://i.ibb.co/ZR8f8kCd/13.jpg"
                alt={t("shop.imageAlt")}
                width="1568"
                height="1568"
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>
            <div className="p-8 sm:p-10 lg:p-12 flex flex-col justify-center">
              <div className="flex items-center gap-3 text-primary mb-5">
                <Shirt size={19} aria-hidden="true" />
                <p className="text-xs eyebrow">Official merch • 2026</p>
              </div>
              <h2 id="home-shop-title" className="font-display font-black text-3xl sm:text-4xl uppercase text-foreground">{t("shop.productName")}</h2>
              <p className="font-display font-black text-2xl text-primary mt-4">49,90&nbsp;€</p>
              <p className="text-muted-foreground mt-5 leading-relaxed">{t("shop.sub")}</p>
              <Link to="/boutique" className="mt-7 inline-flex items-center gap-2 text-xs font-display font-bold uppercase tracking-[0.25em] text-primary hover:underline self-start" data-testid="home-shop-link">
                {t("nav.shop")} <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* GAMES */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16" data-testid="home-games" aria-labelledby="home-games-h2">
        <div className="flex items-center gap-4 mb-10">
          <Swords className="text-primary" size={20} aria-hidden="true" />
          <h2 id="home-games-h2" className="eyebrow !text-[0.7rem] sm:!text-xs">{t("home.games.title")}</h2>
          <div className="flex-1 gold-line opacity-50" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="relative panel clip-blade p-8 group overflow-hidden flex flex-col" data-testid="home-game-eva">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 motion-reduce:group-hover:opacity-0 transition-opacity duration-200 ease-out bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
            <div className="flex items-start justify-between">
              <p className="font-display font-black text-4xl text-primary">EVA</p>
              <Badge variant="eva" size="md">{t("home.games.eva.team")}</Badge>
            </div>
            <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mt-2">{t("home.games.eva.short")}</p>
            <p className="text-muted-foreground mt-4 leading-relaxed flex-1">{t("home.games.eva")}</p>
            <Link to="/equipe?game=EVA" className="mt-6 inline-flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-primary hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              {t("home.games.discover")} <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </div>
          <div className="relative panel clip-blade-sm p-8 group overflow-hidden flex flex-col hover:border-primary/50 u-micro" data-testid="home-game-rl">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 motion-reduce:group-hover:opacity-0 transition-opacity duration-200 ease-out bg-gradient-to-br from-primary/[0.07] to-transparent pointer-events-none" />
            <div className="absolute -right-6 -top-6 w-24 h-24 opacity-10 pointer-events-none" aria-hidden="true">
              <div className="w-full h-full border-2 border-primary rotate-12" />
            </div>
            <div className="flex items-start justify-between">
              <p className="font-display font-black text-4xl text-foreground group-hover:text-primary u-micro">RL</p>
              <Badge variant="outline" size="md" className="group-hover:text-primary group-hover:border-primary/50 u-micro">{t("home.games.rl.team")}</Badge>
            </div>
            <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mt-2">{t("home.games.rl.short")}</p>
            <p className="text-muted-foreground mt-4 leading-relaxed flex-1">{t("home.games.rl")}</p>
            <div className="mt-6 flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest bg-gold text-primary-foreground px-2.5 py-1 font-bold">{t("home.badge.new")}</span>
              <Link to="/equipe?game=Rocket%20League" className="inline-flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted-foreground hover:text-primary u-micro focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                {t("home.games.discover")} <ArrowRight size={12} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className="border border-border/25 bg-background/70 p-8 flex flex-col justify-center relative overflow-hidden">
            <p className="font-display text-muted-foreground tracking-[0.3em] uppercase text-xs mb-3">Elysium • 2026</p>
            <p className="text-muted-foreground text-sm leading-relaxed">{t("home.games.pillars")}</p>
            <div className="mt-6 gold-line opacity-50" />
            <p className="mt-4 text-xs uppercase tracking-[0.3em] text-primary/70">Not given. Earned.</p>
          </div>
        </div>
      </section>

      {/* RECRUTEMENT — les postes ouverts sont dans Firestore, le CTA « Nous rejoindre » est le principal de la navbar : on les expose ici (masqué si aucun poste ouvert) */}
      <RecruitHomeBlock />

      {/* PREUVES — bento asymétrique : prochain match / palmarès / effectif */}
      <section className="border-t border-border/25 bg-background/70" aria-labelledby="home-proof-h2">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16" data-testid="home-latest-results">
          <div className="flex items-center gap-4 mb-10">
            <Trophy className="text-primary" size={20} aria-hidden="true" />
            <h2 id="home-proof-h2" className="eyebrow !text-[0.7rem] sm:!text-xs">{t("home.proof.title")}</h2>
            <div className="flex-1 gold-line opacity-50" />
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-8">
            {/* PROCHAIN MATCH — grande tuile */}
            <article className="sm:col-span-2 lg:col-span-4 lg:row-span-2 relative clip-blade border border-border/25 bg-background/85 overflow-hidden flex flex-col group hover:border-primary/50 u-micro" data-testid="home-proof-next-match">
              <img src="https://images.pexels.com/photos/9072212/pexels-photo-9072212.jpeg?auto=compress&cs=tinysrgb&w=1200"
                alt="" aria-hidden="true" loading="lazy" decoding="async" width="1200" height="800"
                className="absolute inset-0 w-full h-full object-cover opacity-25 saturate-[0.4] contrast-125 grayscale-[0.15]" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/40" aria-hidden="true" />
              <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{backgroundImage:"radial-gradient(oklch(0.84 0.095 98/0.3) 1px, transparent 1px)", backgroundSize:"3px 3px"}} aria-hidden="true" />
              <div className="relative p-8 lg:p-12 flex flex-col flex-1">
                <p className="text-xs eyebrow mb-8 flex items-center gap-2">
                  <CalendarClock size={13} aria-hidden="true" /> {t("home.proof.nextMatch")}
                </p>
                {nextMatch ? (
                  <div className="flex-1 flex flex-col justify-between gap-8">
                    <div className="flex items-center justify-center gap-6 sm:gap-12" data-testid="home-proof-vs">
                      <div className="flex flex-col items-center gap-3">
                        <OptimizedImage src="/brand/logo-icon-gold.png" alt={`Logo ${getElysiumTeamName(nextMatch.roster)}`} width="808" height="798" loading="lazy" className="h-16 sm:h-20 w-auto object-contain gold-glow" />
                        <span className="font-display uppercase tracking-[0.25em] text-sm text-foreground text-center leading-tight">{getElysiumTeamName(nextMatch.roster)}</span>
                      </div>
                      <span className="font-display font-black text-3xl sm:text-5xl text-primary" aria-hidden="true">VS</span>
                      <div className="flex flex-col items-center gap-3">
                        <OpponentMark src={nextMatch.opponentLogo} name={nextMatch.opponentName} />
                        <span className="font-display uppercase tracking-[0.25em] text-sm text-foreground text-center max-w-[140px] truncate">{nextMatch.opponentName || "TBD"}</span>
                      </div>
                    </div>
                    <MatchCountdown match={nextMatch} testId="home-next-match-countdown" />
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border/25 pt-6">
                      <span className="text-xs font-display uppercase tracking-[0.3em] text-primary border border-primary/40 px-2 py-0.5">{nextMatch.game || "EVA"}</span>
                      {nextMatch.roster && <span className="text-xs font-display uppercase tracking-[0.25em] text-foreground/70 border border-border/30 px-2 py-0.5">{nextMatch.roster}</span>}
                      {nextMatch.competition && <span className="text-xs uppercase tracking-[0.25em] text-foreground/70">{nextMatch.competition}</span>}
                      <span className="text-xs text-foreground/60">{fmtMatchDate(nextMatch, lang)}{nextMatch.timezone ? ` (${nextMatch.timezone})` : ""}</span>
                      {nextMatch.watchUrl && (
                        <a href={nextMatch.watchUrl} target="_blank" rel="noopener noreferrer" data-testid="home-proof-watch-link"
                          onClick={() => trackEvent(ANALYTICS_EVENTS.LIVE_CLICK, { source: "home_next_match", matchId: nextMatch.id, platform: nextMatch.platform || "watchUrl" })}
                          className="ml-auto inline-flex items-center gap-2 bg-gold text-primary-foreground text-xs font-display font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_12px_oklch(0.84 0.095 98/0.4)] u-micro-shadow focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                          <PlayCircle size={13} aria-hidden="true" /> {t("home.proof.watch")}
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-start justify-center gap-4">
                    <p className="text-muted-foreground text-lg" data-testid="home-latest-empty">{t("home.proof.noUpcoming")}</p>
                    <Link to="/calendrier" className="inline-flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-primary hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                      {t("nav.calendar")} <ArrowRight size={12} aria-hidden="true" />
                    </Link>
                  </div>
                )}
              </div>
            </article>

            {/* PALMARÈS */}
            <article className="lg:col-span-2 panel clip-blade-sm p-8 flex flex-col hover:border-primary/50 u-micro" data-testid="home-proof-palmares">
              <p className="text-xs eyebrow mb-6 flex items-center gap-2">
                <Trophy size={13} aria-hidden="true" /> {t("home.proof.palmares")}
              </p>
              {palmares.total === 0 ? (
                <p className="text-muted-foreground text-sm flex-1 flex items-center">{t("home.latest.empty")}</p>
              ) : (
                <>
                  <p className="font-display font-black text-5xl text-primary" data-testid="home-proof-winrate">{palmares.winRate}<span className="text-2xl">%</span></p>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mt-1 mb-6">{t("home.proof.winRate")}</p>
                  <div className="flex gap-4 text-center">
                    <div>
                      <p className="font-display font-bold text-xl text-emerald-300">{palmares.wins}</p>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">W</p>
                    </div>
                    <div>
                      <p className="font-display font-bold text-xl text-red-300">{palmares.losses}</p>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">L</p>
                    </div>
                    <div>
                      <p className="font-display font-bold text-xl text-foreground/60">{palmares.draws}</p>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">D</p>
                    </div>
                  </div>
                  {palmares.last && (
                    <p className="mt-auto pt-5 text-xs text-foreground/50 leading-snug">
                      {t("home.proof.lastResult")} : <span className="text-foreground/80">{palmares.last.scoreUs}—{palmares.last.scoreThem}</span> {getElysiumTeamName(palmares.last.roster)} vs {palmares.last.opponentName || "?"}
                    </p>
                  )}
                </>
              )}
              <Link to="/resultats" data-testid="home-latest-all-link"
                className="mt-5 inline-flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-primary hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                {t("home.latest.all")} <ArrowRight size={11} aria-hidden="true" />
              </Link>
            </article>

            {/* EFFECTIF */}
            <article className="lg:col-span-2 panel clip-blade-sm p-8 flex flex-col hover:border-primary/50 u-micro" data-testid="home-proof-roster">
              <p className="text-xs eyebrow mb-6 flex items-center gap-2">
                <Users size={13} aria-hidden="true" /> {t("home.proof.roster")}
              </p>
              <p className="font-display font-black text-5xl text-foreground">{rosterStats.total}</p>
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mt-1 mb-6">{t("home.proof.players")}</p>
              <div className="flex flex-wrap gap-2">
                {rosterStats.byGame.map((g) => (
                  <span key={g.game} className="text-xs uppercase tracking-widest border border-border/30 text-foreground/70 px-2 py-1">
                    {getGameShortLabel(g.game)} · {g.count}
                  </span>
                ))}
              </div>
              {rosterStats.sample.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4" aria-hidden="true">
                  {rosterStats.sample.map((p) => (
                    <span key={p.id} className="text-xs font-display uppercase tracking-wider bg-primary/5 border border-border/25 text-foreground/60 px-2 py-0.5">{p.pseudo}</span>
                  ))}
                  {rosterStats.total > rosterStats.sample.length && (
                    <span className="text-xs font-display uppercase tracking-wider text-primary/80 px-2 py-0.5">+{rosterStats.total - rosterStats.sample.length}</span>
                  )}
                </div>
              )}
              <Link to="/equipe" data-testid="home-proof-team-link"
                className="mt-auto pt-5 inline-flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-primary hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                {t("home.proof.viewTeam")} <ArrowRight size={11} aria-hidden="true" />
              </Link>
            </article>
          </div>
        </div>
      </section>

      {/* LIVE TWITCH / YOUTUBE */}
      <section className="border-t border-border/25" aria-labelledby="home-live-h2">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16" data-testid="home-live">
          <div className="flex items-center gap-4 mb-10 flex-wrap">
            <Radio className="text-primary" size={20} aria-hidden="true" />
            <h2 id="home-live-h2" className="eyebrow !text-[0.7rem] sm:!text-xs">{t("home.live.title")}</h2>
            <div className="flex-1 gold-line opacity-50" />
            <a href="https://www.twitch.tv/elysiumxeva" target="_blank" rel="noopener noreferrer" data-testid="home-live-twitch-cta"
              onClick={() => trackEvent(ANALYTICS_EVENTS.LIVE_CLICK, { source: "home_live", platform: "twitch" })}
              className="clip-blade-sm bg-gold text-primary-foreground font-display text-xs font-bold uppercase tracking-widest px-4 py-2 flex items-center gap-2 hover:shadow-[0_0_12px_oklch(0.84 0.095 98/0.4)] u-micro-shadow focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <PlayCircle size={14} aria-hidden="true" /> {t("home.live.watch")}
            </a>
            <a href="https://www.youtube.com/@elysiumfr" target="_blank" rel="noopener noreferrer" data-testid="home-live-youtube-cta"
              onClick={() => trackEvent(ANALYTICS_EVENTS.LIVE_CLICK, { source: "home_live", platform: "youtube" })}
              className="border border-border/40 text-muted-foreground text-xs uppercase tracking-widest px-4 py-2 flex items-center gap-2 hover:border-primary hover:text-primary u-micro focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <Youtube size={14} aria-hidden="true" /> {t("home.live.youtube")}
            </a>
          </div>
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="clip-blade-sm border border-border/25 bg-background/70">
              <iframe title="Twitch Elysium" data-testid="home-twitch-embed"
                src={`https://player.twitch.tv/?channel=elysiumxeva&parent=${window.location.hostname}&muted=true`}
                className="w-full aspect-video" allowFullScreen />
            </div>
            <div>
              <p className="eyebrow mb-4">{t("home.live.replays")}</p>
              {videos.length === 0 ? (
                <p className="text-muted-foreground" data-testid="home-replays-empty">{t("home.live.noReplays")}</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4" data-testid="home-replays">
                  {videos.map((v) => {
                    const embed = videoEmbedUrl(v.url);
                    return (
                      <Dialog key={v.id}>
                        <DialogTrigger asChild>
                          <button className="group relative clip-blade-sm border border-border/25 bg-background/70 overflow-hidden text-left hover:border-primary/50 transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                            data-testid={`home-replay-${v.id}`}
                            aria-label={`${t("home.live.watchReplay")} : ${v.title}`}>
                            {v.thumbnail ? (
                              <img src={v.thumbnail} alt="" loading="lazy" decoding="async" className="w-full aspect-video object-cover opacity-70 group-hover:opacity-90 transition-opacity" />
                            ) : (
                              <div className="w-full aspect-video canvas-dots" />
                            )}
                            <span className="absolute inset-0 flex items-center justify-center">
                              <PlayCircle size={40} className="text-primary drop-shadow-[0_0_8px_rgba(0,0,0,0.8)]" aria-hidden="true" />
                            </span>
                            <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-background to-transparent px-3 pt-8 pb-2 text-xs font-semibold text-foreground truncate">
                              {v.title}
                            </span>
                          </button>
                        </DialogTrigger>
                        <DialogContent className="panel clip-blade border border-primary/30 rounded-none max-w-3xl p-2" data-testid={`home-replay-lightbox-${v.id}`}>
                          {embed ? (
                            <iframe src={embed} title={v.title} className="w-full aspect-video" allowFullScreen allow="autoplay; fullscreen" />
                          ) : (
                            <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-primary underline p-8 block text-center flex items-center justify-center gap-2">
                              <ExternalLink size={15} aria-hidden="true" /> {v.title}
                            </a>
                          )}
                          <p className="text-sm text-foreground/70 px-2 pb-2">{v.title}</p>
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

      {/* COMMUNAUTÉ — Discord + réseaux regroupés — D-02 */}
      <section className="border-t border-border/25 bg-background/70 relative overflow-hidden" aria-labelledby="home-community-h2" data-testid="home-community">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <div className="flex items-center gap-4 mb-10">
            <Users className="text-primary" size={20} aria-hidden="true" />
            <h2 id="home-community-h2" className="eyebrow !text-[0.7rem] sm:!text-xs">Communauté</h2>
            <div className="flex-1 gold-line opacity-50" />
          </div>
          <div className="grid lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5" data-testid="home-discord">
              <h3 className="font-display text-sm uppercase tracking-[0.3em] text-foreground mb-4">{t("home.discord.title")}</h3>
              {discord && (
                <div className="flex gap-8 mb-6" data-testid="home-discord-stats">
                  <div>
                    <p className="font-display font-black text-4xl text-primary">{discord.online}</p>
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-300 inline-block" /> {t("home.discord.online")}
                    </p>
                  </div>
                  <div>
                    <p className="font-display font-black text-4xl text-foreground">{discord.members}</p>
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{t("home.discord.members")}</p>
                  </div>
                </div>
              )}
              <Button variant="gold" size="lg" asChild>
                <a href="https://discord.gg/RH3ZZkMJsw" target="_blank" rel="noopener noreferrer" data-testid="home-discord-cta" onClick={() => trackEvent(ANALYTICS_EVENTS.DISCORD_CLICK, { source: "home_discord" })}>
                  <SocialIcon name="discord" size={18} aria-hidden="true" /> {t("home.discord.cta")}
                </a>
              </Button>
              <div className="panel clip-blade-sm p-6 mt-6" data-testid="home-discord-rules">
                <p className="text-xs uppercase tracking-[0.3em] text-primary mb-4">{t("home.discord.faq")}</p>
                <ul className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <li key={i} className="flex gap-3 text-sm text-muted-foreground"><span className="font-display font-bold text-primary">0{i}</span>{t(`home.discord.rule${i}`)}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="lg:col-span-7" data-testid="home-socials">
              <h3 className="font-display text-sm uppercase tracking-[0.3em] text-foreground mb-4">{t("home.socials.title")}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {SOCIALS.map((s) => (
                  <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" data-testid={`home-social-${s.icon}`} aria-label={`${s.name} (${t("footer.opensNewTab")})`} onClick={() => s.icon === "discord" && trackEvent(ANALYTICS_EVENTS.DISCORD_CLICK, { source: "home_socials" })} className="panel clip-blade-sm p-6 flex flex-col items-center gap-3 hover:border-primary/50 hover:-translate-y-1 u-micro group focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                    <span className="text-muted-foreground group-hover:text-primary u-micro" aria-hidden="true"><SocialIcon name={s.icon} size={28} /></span>
                    <span className="text-xs font-display uppercase tracking-widest text-muted-foreground">{s.name}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PARTENAIRES — « Ils nous font confiance », logos cliquables vers la fiche */}
      {partners.length > 0 && (
        <section className="border-t border-border/25 bg-background" aria-labelledby="home-partners-h2" data-testid="home-partners">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
            <div className="flex items-center gap-4 mb-4">
              <Handshake className="text-primary" size={20} aria-hidden="true" />
              <h2 id="home-partners-h2" className="eyebrow !text-[0.7rem] sm:!text-xs">{t("home.partners.title")}</h2>
              <div className="flex-1 gold-line opacity-50" />
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl mb-8">{t("home.partners.sub")}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {partners.map((p) => (
                <Link
                  key={p.id}
                  to={partnerFichePath(p)}
                  onClick={() => trackEvent(ANALYTICS_EVENTS.PARTNER_CLICK, { partnerId: p.id, source: "home" })}
                  data-testid={`home-partner-${p.id}`}
                  aria-label={`${p.name} — ${t("partners.logos.cta")}`}
                  className="group panel clip-blade-sm p-4 flex flex-col items-center gap-3 hover:border-primary/50 hover:-translate-y-0.5 u-micro focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <PartnerMark src={partnerLogoSrc(p)} name={p.name} />
                  <span className="font-display font-bold text-xs text-center text-foreground group-hover:text-primary transition-colors line-clamp-2">{p.name}</span>
                </Link>
              ))}
            </div>
            <div className="mt-8">
              <Button variant="outline" size="md" asChild>
                <Link to="/partenaires" data-testid="home-partners-cta">
                  {t("home.partners.cta")} <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* SOUTENIR / DONS — réduit selon campagne — D-02 : moins de py-24, déplacé après communauté */}
      <section className="border-t border-border/25" aria-labelledby="donate-block-h2">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12" data-testid="home-donate">
          <div className="flex items-center gap-4 mb-6">
            <Heart className="text-primary" size={20} aria-hidden="true" />
            <h2 id="donate-block-h2" className="eyebrow !text-[0.7rem] sm:!text-xs">{t("donate.title")}</h2>
            <div className="flex-1 gold-line opacity-50" />
          </div>
          <div className="mb-6"><CampaignProgress testId="home-campaign-progress" /></div>
          <DonateBlock testId="home-donate-block" />
        </div>
      </section>
    </div>
  );
}
