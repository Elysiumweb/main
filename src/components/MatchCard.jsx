import { useState } from "react";
import { useLang } from "../lib/i18n";
import { ShieldOff, CalendarClock, ExternalLink, PlayCircle, Award, Pencil, Trophy, Skull } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
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
const ResultBadge = ({ result, t, upcoming = false }) => {
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

export const MatchCard = ({ match, onDelete, onEdit }) => {
  const { t } = useLang();
  const upcoming = match.status === "upcoming";
  const us = Number(match.scoreUs);
  const them = Number(match.scoreThem);
  const result = us > them ? "win" : us < them ? "loss" : "draw";
  const maps = (match.maps || []).filter((m) => m.name);
  const roster = typeof match.roster === "string" ? match.roster.trim() : "";
  const teamName = getElysiumTeamName(roster);

  // Accessible description for the card
  const ariaDesc = upcoming
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
        <ResultBadge result={result} t={t} upcoming={upcoming} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-center gap-2 w-1/3">
          <OptimizedImage src="/brand/logo-icon-gold.png" alt={`Logo ${teamName}`} width="48" height="48" loading="lazy" className="h-12 object-contain" />
          <span className="text-xs font-display uppercase tracking-wider text-[#f7f7f7] text-center leading-tight" data-testid={`match-team-name-${match.id}`}>{teamName}</span>
        </div>
        <div className="text-center">
          {upcoming ? (
            <p className="font-display font-black text-2xl text-[#c8c8c8]" aria-label="Match à venir">VS</p>
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
      {upcoming && (match.platform || match.watchUrl) && (
        <div className="mt-3 flex items-center justify-between gap-2">
          {match.platform && <span className="text-xs text-[#c8c8c8]">{t("results.platform")} : {match.platform}</span>}
          {match.watchUrl && (
            <a href={match.watchUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.stopPropagation(); trackEvent(ANALYTICS_EVENTS.LIVE_CLICK, { source: "match_card", matchId: match.id, platform: match.platform || "watchUrl" }); }} data-testid={`match-watch-${match.id}`}
              className="text-xs text-[#D8CA82] uppercase tracking-widest flex items-center gap-1.5 hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]">
              <PlayCircle size={13} aria-hidden="true" /> {t("results.watch")}
            </a>
          )}
        </div>
      )}
      {onEdit && (
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(match); }}
          data-testid={`match-edit-${match.id}`}
          aria-label={`Modifier le match contre ${match.opponentName}`}
          className="absolute top-2 right-8 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-[#D8CA82]/80 hover:text-[#D8CA82] transition-opacity z-10 motion-reduce:transition-none"
        >
          <Pencil size={13} aria-hidden="true" />
        </button>
      )}
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(match.id); }}
          data-testid={`match-delete-${match.id}`}
          aria-label={`Supprimer le match contre ${match.opponentName}`}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-red-400 text-xs uppercase tracking-wider transition-opacity z-10 motion-reduce:transition-none"
        >
          <span aria-hidden="true">✕</span>
        </button>
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
              {upcoming ? "VS" : <>{match.scoreUs}<span className="text-[#a0a0a0] mx-2" aria-hidden="true">—</span>{match.scoreThem}</>}
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
          {maps.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[#D8CA82] mb-2">{t("results.maps")}</p>
              <div className="border border-white/10 divide-y divide-white/5" data-testid={`match-maps-${match.id}`}>
                {maps.map((m, i) => (
                  <div key={i} className="flex justify-between px-4 py-2">
                    <span className="text-[#c8c8c8]">{m.name}</span>
                    <span
                      className={`font-display font-bold ${m.us > m.them ? "text-emerald-300" : m.us < m.them ? "text-red-300" : "text-[#c8c8c8]"}`}
                      aria-label={`${m.name} : ${m.us ?? "?"} contre ${m.them ?? "?"}`}
                    >
                      {m.us ?? "—"} - {m.them ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {match.mvp && (
            <p className="flex items-center gap-2 text-[#c8c8c8]" data-testid={`match-mvp-${match.id}`}>
              <Award size={15} className="text-[#D8CA82]" aria-hidden="true" /> {t("results.mvp")} : <span className="font-display font-bold text-[#D8CA82]">{match.mvp}</span>
            </p>
          )}
          <div className="flex gap-4">
            {match.vodUrl && (
              <a href={match.vodUrl} target="_blank" rel="noopener noreferrer" data-testid={`match-vod-${match.id}`}
                className="text-xs text-[#D8CA82] uppercase tracking-widest flex items-center gap-1.5 hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]">
                <PlayCircle size={13} aria-hidden="true" /> {t("results.vod")}
              </a>
            )}
            {match.watchUrl && upcoming && (
              <a href={match.watchUrl} target="_blank" rel="noopener noreferrer"
                onClick={() => trackEvent(ANALYTICS_EVENTS.LIVE_CLICK, { source: "match_detail", matchId: match.id, platform: match.platform || "watchUrl" })}
                className="text-xs text-[#D8CA82] uppercase tracking-widest flex items-center gap-1.5 hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]">
                <ExternalLink size={13} aria-hidden="true" /> {t("results.watch")}
              </a>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
