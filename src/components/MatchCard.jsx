import { useState } from "react";
import { useLang } from "../lib/i18n";
import { CalendarClock, ExternalLink, PlayCircle, Pencil, Trophy, Skull, Radio, Copy, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { ShareButtons } from "./ShareButtons";
import { SITE_URL } from "../lib/useSEO";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import { OptimizedImage } from "./OptimizedImage";
import { getElysiumTeamName } from "../lib/constants";

/* -----------------------------------------------------------------------
 * OpponentLogo
 * - Renders opponent logo with a DESCRIPTIVE alt (team name + role)
 * - On load error or missing src, falls back to a clean initials plate
 *   (neutral, NOT Elysium branding, to avoid implying a partnership)
 * --------------------------------------------------------------------- */
const OpponentLogo = ({ src, name, className = "" }) => {
  const [err, setErr] = useState(false);
  const safeName = (name || "Adversaire").trim();

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
        aria-label={`Logo de l'équipe adverse indisponible : ${safeName}`}
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
      alt={`Logo de l'équipe adverse : ${safeName}`}
      onError={() => setErr(true)}
      loading="lazy"
      decoding="async"
      className={`${className} object-contain`}
    />
  );
};

/* -----------------------------------------------------------------------
 * ResultBadge
 * - Never rely on color alone: shows an icon + explicit text label
 * --------------------------------------------------------------------- */
const ResultBadge = ({ result, t, upcoming = false, live = false }) => {
  if (live) {
    return (
      <span
        className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-red-300 border-red-400/60 bg-red-500/10 flex items-center gap-1.5"
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
        className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-sky-300 border-sky-300/40 flex items-center gap-1"
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
        className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-emerald-300 border-emerald-300/50 flex items-center gap-1"
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
        className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-red-300 border-red-300/50 flex items-center gap-1"
        data-testid="match-status-loss"
      >
        <Skull size={11} aria-hidden="true" />
        <span>{t("results.loss")}</span>
      </span>
    );
  }
  return (
    <span
      className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-[#c8c8c8] border-white/25 flex items-center gap-1"
      data-testid="match-status-draw"
    >
      <span aria-hidden="true">=</span>
      <span>{t("results.draw")}</span>
    </span>
  );
};

export const MatchCard = ({ match, onDelete, onEdit, onDuplicate, onMarkUpcoming }) => {
  const { t } = useLang();
  const upcoming = match.status === "upcoming";
  const live = match.status === "live";
  const us = Number(match.scoreUs);
  const them = Number(match.scoreThem);
  const result = us > them ? "win" : us < them ? "loss" : "draw";
  const roster = typeof match.roster === "string" ? match.roster.trim() : "";
  const teamName = getElysiumTeamName(roster);

  // Accessible description for the card
  const ariaDesc = live
    ? `Match en direct : ${teamName} contre ${match.opponentName || "adversaire"}${match.scoreUs !== undefined && match.scoreUs !== "" ? ` (${match.scoreUs}-${match.scoreThem})` : ""}`
    : upcoming
      ? `Match à venir : ${teamName} contre ${match.opponentName || "adversaire"}`
      : `Résultat : ${result === "win" ? "Victoire" : result === "loss" ? "Défaite" : "Égalité"} de ${teamName} ${us}-${them} contre ${match.opponentName || "adversaire"}`;

  const card = (
    <div
      className="border border-white/10 bg-[#1A1A1A] p-6 relative group hover:border-[#D8CA82]/40 transition-colors cursor-pointer motion-reduce:transition-none"
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
          <span className="text-[10px] font-display tracking-[0.3em] uppercase text-[#D8CA82] border border-[#D8CA82]/40 px-2 py-0.5">{match.game || "EVA"}</span>
          {roster && (
            <span className="text-[10px] font-display tracking-[0.25em] uppercase text-[#f7f7f7]/70 border border-white/15 px-2 py-0.5" data-testid={`match-roster-${match.id}`}>
              {roster}
            </span>
          )}
        </div>
        <ResultBadge result={result} t={t} upcoming={upcoming} live={live} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-center gap-2 w-1/3">
          <OptimizedImage src="/brand/logo-icon-gold.png" alt={`Logo ${teamName}`} width="48" height="48" loading="lazy" className="h-12 object-contain" />
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
          {match.date}{match.time ? ` · ${match.time}` : ""}{match.time && match.timezone ? ` (${match.timezone})` : ""}
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
      {(onEdit || onDelete || onDuplicate || onMarkUpcoming) && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-10 motion-reduce:transition-none flex items-center gap-1 bg-[#111111]/80 border border-white/10 px-1 py-0.5">
          {onDuplicate && (
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicate(match); }}
              data-testid={`match-duplicate-${match.id}`}
              aria-label={`Dupliquer le match contre ${match.opponentName}`}
              className="text-[#f7f7f7]/50 hover:text-[#D8CA82] p-1"
              title="Dupliquer"
            >
              <Copy size={13} aria-hidden="true" />
            </button>
          )}
          {onMarkUpcoming && match.status !== "upcoming" && (
            <button
              onClick={(e) => { e.stopPropagation(); onMarkUpcoming(match); }}
              data-testid={`match-upcoming-${match.id}`}
              aria-label={`Passer le match contre ${match.opponentName} à venir`}
              className="text-sky-300/70 hover:text-sky-300 p-1"
              title="Passer à venir"
            >
              <RotateCcw size={13} aria-hidden="true" />
            </button>
          )}
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(match); }}
              data-testid={`match-edit-${match.id}`}
              aria-label={`Modifier le match contre ${match.opponentName}`}
              className="text-[#D8CA82]/80 hover:text-[#D8CA82] p-1"
              title="Modifier"
            >
              <Pencil size={13} aria-hidden="true" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(match); }}
              data-testid={`match-delete-${match.id}`}
              aria-label={`Supprimer le match contre ${match.opponentName}`}
              className="text-red-400 hover:text-red-300 p-1"
              title="Supprimer"
            >
              <span aria-hidden="true">✕</span>
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <Dialog onOpenChange={(open) => {
      if (open) {
        trackEvent(ANALYTICS_EVENTS.MATCH_VIEW, { matchId: match.id, status: match.status, game: match.game, competition: match.competition });
      }
    }}>
      <DialogTrigger asChild>{card}</DialogTrigger>
      <DialogContent className="bg-[#1A1A1A] border border-[#D8CA82]/30 rounded-none text-[#f7f7f7] max-w-lg" data-testid={`match-detail-${match.id}`}>
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-widest text-[#D8CA82]">
            {teamName} vs {match.opponentName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between border border-white/10 p-4">
            <div className="flex flex-col items-center gap-1 w-1/3">
              <OptimizedImage src="/brand/logo-icon-gold.png" alt={`Logo ${teamName}`} width="40" height="40" loading="lazy" className="h-10 object-contain" />
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
            {match.date}{match.time ? ` · ${match.time}` : ""}{match.timezone ? ` (${match.timezone})` : ""}
            {match.competition ? ` — ${match.competition}` : ""}{match.platform ? ` — ${match.platform}` : ""}
          </p>
          {roster && (
            <p className="text-xs uppercase tracking-[0.25em] text-[#f7f7f7]/50" data-testid={`match-detail-roster-${match.id}`}>
              {t("results.roster")} : <span className="text-[#D8CA82]">{roster}</span>
            </p>
          )}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-4 flex-wrap">
            <ShareButtons
              url={`${SITE_URL}/resultats?match=${match.id}`}
              text={`${teamName} vs ${match.opponentName || "adversaire"}${!upcoming && !live ? ` — ${match.scoreUs ?? "?"}-${match.scoreThem ?? "?"}` : ""}`}
              title={`Partager le match ${teamName} vs ${match.opponentName}`}
              testId={`match-share-${match.id}`}
              compact
            />
          </div>
          <div className="flex gap-4">
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
