import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../lib/i18n";
import { CalendarClock, ExternalLink, PlayCircle, Pencil, Trophy, Skull, Radio, Copy, RotateCcw, Film, Award, Map as MapIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { ShareButtons } from "./ShareButtons";
import { SITE_URL } from "../lib/useSEO";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import { OptimizedImage } from "./OptimizedImage";
import { getElysiumTeamName } from "../lib/constants";
import { fmtMatchDate } from "../lib/formatters";

const OpponentLogo = ({ src, name, className = "" }) => {
  const { t } = useLang();
  const [err, setErr] = useState(false);
  const safeName = (name || t("common.adversary")).trim();

  if (!src || err) {
    const initials = safeName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || "")
      .join("") || "?";
    return (
      <div
        role="img"
        aria-label={`${t("a11y.opponentLogoFallback")} : ${safeName}`}
        className={`${className} flex items-center justify-center border border-white/15 bg-[#0c0c0c] text-[#a0a0a0] font-display tracking-widest text-xs uppercase select-none`}
        data-testid="opponent-logo-fallback"
      >
        <span aria-hidden="true">{initials}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${t("a11y.opponentLogo")} : ${safeName}`}
      onError={() => setErr(true)}
      loading="lazy"
      decoding="async"
      className={`${className} object-contain`}
    />
  );
};

const ResultBadge = ({ result, t, upcoming = false, live = false }) => {
  if (live) {
    return (
      <span
        className="text-xs font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-red-300 border-red-400/60 bg-red-500/10 flex items-center gap-1.5"
        data-testid="match-status-live"
      >
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400" />
        </span>
        <span>{t("results.live")}</span>
      </span>
    );
  }
  if (upcoming) {
    return (
      <span
        className="text-xs font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-sky-300 border-sky-300/40 flex items-center gap-1"
        data-testid="match-status-upcoming"
      >
        <CalendarClock size={11} aria-hidden="true" />
        <span>{t("results.upcoming")}</span>
      </span>
    );
  }
  if (result === "win") {
    return (
      <span
        className="text-xs font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-emerald-300 border-emerald-300/50 flex items-center gap-1"
        data-testid="match-status-win"
      >
        <Trophy size={11} aria-hidden="true" />
        <span>{t("results.win")}</span>
      </span>
    );
  }
  if (result === "loss") {
    return (
      <span
        className="text-xs font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-red-300 border-red-300/50 flex items-center gap-1"
        data-testid="match-status-loss"
      >
        <Skull size={11} aria-hidden="true" />
        <span>{t("results.loss")}</span>
      </span>
    );
  }
  return (
    <span
      className="text-xs font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-[#c8c8c8] border-white/25 flex items-center gap-1"
      data-testid="match-status-draw"
    >
      <span aria-hidden="true">=</span>
      <span>{t("results.draw")}</span>
    </span>
  );
};

const normalizeMaps = (maps) => {
  if (!maps) return [];
  if (typeof maps === "string" && maps.trim()) {
    return maps.split("\n").filter(Boolean).map(line=>{
      const parts = line.split("|").map(s=>s.trim());
      if (parts.length>=2) {
        const [a,b]=parts[1].split("-").map(s=>s.trim());
        return { name: parts[0]||line, scoreUs: a||"", scoreThem: b||"" };
      }
      return { name: line, scoreUs:"", scoreThem:"" };
    });
  }
  if (!Array.isArray(maps)) return [];
  return maps.map(m=>{
    if (typeof m==="string") {
      const parts = m.split("|").map(s=>s.trim());
      if (parts.length>=2) {
        const [a,b]=parts[1].split("-").map(s=>s.trim());
        return { name: parts[0]||m, scoreUs: a||"", scoreThem: b||"" };
      }
      return { name: m, scoreUs:"", scoreThem:"" };
    }
    return { name: m.map || m.name || "", scoreUs: m.scoreUs ?? "", scoreThem: m.scoreThem ?? "" };
  }).filter(m=> m.name || m.scoreUs || m.scoreThem);
};

const slugify = (s) => String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80) || "adversaire";

export const MatchCard = ({ match, onDelete, onEdit, onDuplicate, onMarkUpcoming, initialOpen = false }) => {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(!!initialOpen);
  useEffect(()=>{ if (initialOpen) setOpen(true); }, [initialOpen]);

  const upcoming = match.status === "upcoming";
  const live = match.status === "live";
  const us = Number(match.scoreUs);
  const them = Number(match.scoreThem);
  const result = us > them ? "win" : us < them ? "loss" : "draw";
  const roster = typeof match.roster === "string" ? match.roster.trim() : "";
  const teamName = getElysiumTeamName(roster);
  const participants = Array.isArray(match.players)
    ? match.players.filter((p) => p && (p.pseudo || p.playerId))
    : [];
  const maps = useMemo(()=> normalizeMaps(match.maps), [match.maps]);
  const hasVod = !!match.vodUrl;
  const mvp = match.mvp ? String(match.mvp) : "";

  const ariaDesc = live
    ? `Match en direct : ${teamName} contre ${match.opponentName || t("common.adversary")}${match.scoreUs !== undefined && match.scoreUs !== "" ? ` (${match.scoreUs}-${match.scoreThem})` : ""}`
    : upcoming
      ? `Match à venir : ${teamName} contre ${match.opponentName || t("common.adversary")}`
      : `Résultat : ${result === "win" ? "Victoire" : result === "loss" ? "Défaite" : "Égalité"} de ${teamName} ${us}-${them} contre ${match.opponentName || t("common.adversary")}`;

  const formattedDate = fmtMatchDate(match, lang);
  const canonicalUrl = `${SITE_URL}/resultats/${match.id}`;

  const card = (
    <div
      className="border border-white/10 bg-[#1A1A1A] p-6 relative group hover:border-[#D8CA82]/50 transition-colors cursor-pointer motion-reduce:transition-none"
      data-testid={`match-card-${match.id}`}
      role="button"
      tabIndex={0}
      aria-label={ariaDesc}
      aria-describedby={`match-desc-${match.id}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.currentTarget.click();
        }
      }}
    >
      <span id={`match-desc-${match.id}`} className="sr-only">
        {ariaDesc}
      </span>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-display tracking-[0.3em] uppercase text-[#D8CA82] border border-[#D8CA82]/40 px-2 py-0.5">{match.game || "EVA"}</span>
          {roster && (
            <span className="text-xs font-display tracking-[0.25em] uppercase text-[#f7f7f7]/70 border border-white/15 px-2 py-0.5" data-testid={`match-roster-${match.id}`}>
              {roster}
            </span>
          )}
          {maps.length>0 && <span className="text-xs border border-white/10 text-[#c8c8c8] px-1.5 py-0.5 flex items-center gap-1"><MapIcon size={10}/> {maps.length}</span>}
          {mvp && <span className="text-xs border border-[#D8CA82]/20 text-[#D8CA82] px-1.5 py-0.5 flex items-center gap-1"><Award size={10}/> MVP</span>}
        </div>
        <ResultBadge result={result} t={t} upcoming={upcoming} live={live} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-center gap-2 w-1/3">
          <OptimizedImage src="/brand/logo-icon-gold.png" alt={`Logo ${teamName}`} width="808" height="798" loading="lazy" className="h-12 w-auto object-contain" />
          <span className="text-xs font-display uppercase tracking-wider text-[#f7f7f7] text-center leading-tight" data-testid={`match-team-name-${match.id}`}>{teamName}</span>
        </div>
        <div className="text-center">
          {upcoming || (live && (match.scoreUs === undefined || match.scoreUs === "")) ? (
            <p className="font-display font-black text-2xl text-[#c8c8c8]" aria-label={live ? "Score en cours de mise à jour" : "Match à venir"}>VS</p>
          ) : (
            <p className="font-display font-black text-3xl text-[#f7f7f7]" aria-label={`Score : ${us} à ${them}`}>
              <span className={result === "win" ? "text-[#D8CA82]" : "text-[#f7f7f7]"}>{match.scoreUs}</span>
              <span className="text-[#a0a0a0] mx-2" aria-hidden="true">—</span>
              <span className="text-[#f7f7f7]">{match.scoreThem}</span>
            </p>
          )}
        </div>
        <div className="flex flex-col items-center gap-2 w-1/3">
          <OpponentLogo src={match.opponentLogo} name={match.opponentName} className="h-12 w-12" />
          <span className="text-xs font-display uppercase tracking-wider text-[#c8c8c8] text-center">{match.opponentName}</span>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs text-[#c8c8c8]">
          {formattedDate}{match.time && match.timezone ? ` (${match.timezone})` : ""}
        </span>
        {match.competition && <span className="text-xs text-[#D8CA82]/80 uppercase tracking-wider">{match.competition}</span>}
      </div>
      {(upcoming || live) && (match.platform || match.watchUrl) && (
        <div className="mt-3 flex items-center justify-between gap-2">
          {match.platform && <span className="text-xs text-[#c8c8c8]">{t("results.platform")} : {match.platform}</span>}
          {match.watchUrl && (
            <a href={match.watchUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.stopPropagation(); trackEvent(ANALYTICS_EVENTS.LIVE_CLICK, { source: "match_card", matchId: match.id, platform: match.platform || "watchUrl", status: match.status }); }} data-testid={`match-watch-${match.id}`}
              className={`text-xs uppercase tracking-widest flex items-center gap-1.5 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82] ${live
                ? "bg-red-500/15 border border-red-400/60 text-red-300 font-bold px-3 py-1.5 hover:bg-red-500/25"
                : "text-[#D8CA82] hover:underline"}`}>
              {live ? <Radio size={13} aria-hidden="true" /> : <PlayCircle size={13} aria-hidden="true" />}
              {live ? t("results.watchLive") : t("results.watch")}
            </a>
          )}
        </div>
      )}
      {hasVod && !upcoming && !live && (
        <div className="mt-3">
          <a href={match.vodUrl} target="_blank" rel="noopener noreferrer" onClick={(e)=> e.stopPropagation()} data-testid={`match-vod-${match.id}`} className="text-xs uppercase tracking-widest text-[#c8c8c8] hover:text-[#D8CA82] flex items-center gap-1.5"><Film size={12}/> {t("results.vod")}</a>
        </div>
      )}
      {(onEdit || onDelete || onDuplicate || onMarkUpcoming) && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-10 motion-reduce:transition-none flex items-center gap-1 bg-[#111111]/80 border border-white/10 px-1 py-0.5">
          {onDuplicate && (
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicate(match); }}
              data-testid={`match-duplicate-${match.id}`}
              aria-label={`${t("admin.match.duplicate")} — ${match.opponentName}`}
              className="text-[#f7f7f7]/50 hover:text-[#D8CA82] p-1"
              title={t("admin.match.duplicate")}
            >
              <Copy size={13} aria-hidden="true" />
            </button>
          )}
          {onMarkUpcoming && match.status !== "upcoming" && (
            <button
              onClick={(e) => { e.stopPropagation(); onMarkUpcoming(match); }}
              data-testid={`match-upcoming-${match.id}`}
              aria-label={`${t("admin.match.makeUpcoming")} — ${match.opponentName}`}
              className="text-sky-300/70 hover:text-sky-300 p-1"
              title={t("admin.match.makeUpcoming")}
            >
              <RotateCcw size={13} aria-hidden="true" />
            </button>
          )}
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(match); }}
              data-testid={`match-edit-${match.id}`}
              aria-label={`${t("admin.edit")} — ${match.opponentName}`}
              className="text-[#D8CA82]/80 hover:text-[#D8CA82] p-1"
              title={t("admin.edit")}
            >
              <Pencil size={13} aria-hidden="true" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(match); }}
              data-testid={`match-delete-${match.id}`}
              aria-label={`${t("common.delete")} — ${match.opponentName}`}
              className="text-red-400 hover:text-red-300 p-1"
              title={t("common.delete")}
            >
              <span aria-hidden="true">✕</span>
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o)=>{
      setOpen(o);
      if (o) trackEvent(ANALYTICS_EVENTS.MATCH_VIEW, { matchId: match.id, status: match.status, game: match.game, competition: match.competition });
    }}>
      <DialogTrigger asChild>{card}</DialogTrigger>
      <DialogContent className="bg-[#1A1A1A] border border-[#D8CA82]/30 rounded-none text-[#f7f7f7] max-w-lg max-h-[90vh] overflow-y-auto" data-testid={`match-detail-${match.id}`}>
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-widest text-[#D8CA82]">
            {teamName} vs {match.opponentName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between border border-white/10 p-4">
            <div className="flex flex-col items-center gap-1 w-1/3">
              <OptimizedImage src="/brand/logo-icon-gold.png" alt={`Logo ${teamName}`} width="808" height="798" loading="lazy" className="h-10 w-auto object-contain" />
              <span className="text-xs font-display uppercase text-center leading-tight">{teamName}</span>
            </div>
            <p className="font-display font-black text-3xl" aria-label={upcoming ? "Match à venir" : `Score : ${match.scoreUs} à ${match.scoreThem}`}>
              {upcoming || (live && (match.scoreUs === undefined || match.scoreUs === "")) ? "VS" : <>{match.scoreUs}<span className="text-[#a0a0a0] mx-2" aria-hidden="true">—</span>{match.scoreThem}</>}
            </p>
            <div className="flex flex-col items-center gap-1 w-1/3">
              <OpponentLogo src={match.opponentLogo} name={match.opponentName} className="h-10 w-10" />
              <span className="text-xs font-display uppercase text-center">{match.opponentName}</span>
            </div>
          </div>
          <p className="text-[#c8c8c8]">
            {formattedDate}{match.timezone ? ` (${match.timezone})` : ""}
            {match.competition ? ` — ${match.competition}` : ""}{match.platform ? ` — ${match.platform}` : ""}
          </p>
          {roster && (
            <p className="text-xs uppercase tracking-[0.25em] text-[#f7f7f7]/50" data-testid={`match-detail-roster-${match.id}`}>
              {t("results.roster")} : <span className="text-[#D8CA82]">{roster}</span>
            </p>
          )}
          {participants.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[#D8CA82] mb-2">
                {t("results.players")}
              </p>
              <div className="flex flex-wrap gap-2" data-testid={`match-players-${match.id}`}>
                {participants.map((p, idx) => (
                  <span key={p.playerId || `${p.pseudo}-${idx}`} className="border border-white/15 bg-[#141414] px-3 py-1.5 text-xs text-[#f7f7f7]/80">
                    {p.pseudo || "Joueur"}
                  </span>
                ))}
              </div>
            </div>
          )}
          {maps.length>0 && (
            <div data-testid={`match-maps-${match.id}`}>
              <p className="text-xs uppercase tracking-[0.25em] text-[#D8CA82] mb-2 flex items-center gap-1"><MapIcon size={12}/> {t("results.maps")}</p>
              <div className="border border-white/10 bg-[#141414] divide-y divide-white/5">
                {maps.map((m,i)=>(
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="text-[#f7f7f7]">{m.name || `Map ${i+1}`}</span>
                    <span className="text-[#c8c8c8]">{m.scoreUs || "—"} — {m.scoreThem || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {mvp && (
            <div data-testid={`match-mvp-${match.id}`} className="border border-[#D8CA82]/20 bg-[#D8CA82]/5 px-3 py-2 flex items-center gap-2">
              <Award size={12} className="text-[#D8CA82]"/>
              <span className="text-xs uppercase tracking-widest text-[#D8CA82]">{t("results.mvp")} :</span>
              <span className="text-xs text-[#f7f7f7]">{mvp}</span>
            </div>
          )}
          <div className="pt-2 border-t border-white/10 flex flex-col gap-3">
            <ShareButtons
              url={canonicalUrl}
              text={`${teamName} vs ${match.opponentName || t("common.adversary")}${!upcoming && !live ? ` — ${match.scoreUs ?? "?"}-${match.scoreThem ?? "?"}` : ""}`}
              title={`Partager le match ${teamName} vs ${match.opponentName}`}
              testId={`match-share-${match.id}`}
              compact
            />
            <Link to={`/resultats/${match.id}`} onClick={()=> setOpen(false)} className="text-xs uppercase tracking-widest text-[#D8CA82] hover:underline" data-testid={`match-detail-link-${match.id}`}>Voir la page dédiée →</Link>
          </div>
          <div className="flex gap-4 flex-wrap">
            {(upcoming || live) && match.watchUrl && (
              <a href={match.watchUrl} target="_blank" rel="noopener noreferrer"
                onClick={() => trackEvent(ANALYTICS_EVENTS.LIVE_CLICK, { source: "match_detail", matchId: match.id, platform: match.platform || "watchUrl", status: match.status })}
                className={`text-xs uppercase tracking-widest flex items-center gap-1.5 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82] ${live
                  ? "bg-red-500/15 border border-red-400/60 text-red-300 font-bold px-3 py-2"
                  : "text-[#D8CA82] hover:underline"}`}>
                {live ? <Radio size={13} aria-hidden="true" /> : <ExternalLink size={13} aria-hidden="true" />}
                {live ? t("results.watchLive") : t("results.watch")}
              </a>
            )}
            {hasVod && (
              <a href={match.vodUrl} target="_blank" rel="noopener noreferrer" className="text-xs uppercase tracking-widest flex items-center gap-1.5 text-[#f7f7f7]/80 hover:text-[#D8CA82] border border-white/10 px-3 py-2">
                <Film size={13}/> {t("results.vod")}
              </a>
            )}
            <Link to={`/adversaires/${slugify(match.opponentName)}`} className="text-xs uppercase tracking-widest text-[#c8c8c8] hover:text-[#D8CA82]">Fiche adversaire →</Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
