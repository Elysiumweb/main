import { useState } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../lib/i18n";
import { CalendarClock, ExternalLink, PlayCircle, Pencil, Trophy, Skull, Radio, Copy, RotateCcw, Map as MapIcon, Video } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { ShareButtons } from "./ShareButtons";
import { SITE_URL } from "../lib/useSEO";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import { OptimizedImage } from "./OptimizedImage";
import { getElysiumTeamName, matchDetailUrl } from "../lib/constants";
import { fmtMatchDate } from "../lib/formatters";
import { formatLabel, parseMaps, getVodUrl, getBracketUrl } from "../lib/matchUtils";

const OpponentLogo = ({ src, name, className = "" }) => {
  const [err, setErr] = useState(false);
  const safeName = (name || "Adversaire").trim();
  if (!src || err) {
    const initials = safeName.split(/\\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "?";
    return (
      <div role="img" aria-label={`Logo de l'équipe adverse indisponible : ${safeName}`} className={`${className} flex items-center justify-center border border-white/15 bg-[#0c0c0c] text-[#a0a0a0] font-display tracking-widest text-xs uppercase select-none`} data-testid="opponent-logo-fallback">
        <span aria-hidden="true">{initials}</span>
      </div>
    );
  }
  return <img src={src} alt={`Logo de l'équipe adverse : ${safeName}`} onError={() => setErr(true)} loading="lazy" decoding="async" className={`${className} object-contain`} />;
};

const ResultBadge = ({ result, t, status }) => {
  if (status === "live") return <span className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-red-300 border-red-400/60 bg-red-500/10 flex items-center gap-1.5" data-testid="match-status-live"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 motion-reduce:animate-none" /><span className="relative inline-flex rounded-full h-2 w-2 bg-red-400" /></span><span>{t("results.live")}</span></span>;
  if (status === "upcoming") return <span className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-sky-300 border-sky-300/40 flex items-center gap-1" data-testid="match-status-upcoming"><CalendarClock size={11} /> <span>{t("results.upcoming")}</span></span>;
  if (status === "postponed") return <span className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-amber-300 border-amber-300/40" data-testid="match-status-postponed">{t("results.status.postponed")}</span>;
  if (status === "cancelled") return <span className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-white/40 border-white/20" data-testid="match-status-cancelled">{t("results.status.cancelled")}</span>;
  if (result === "win") return <span className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-emerald-300 border-emerald-300/50 flex items-center gap-1" data-testid="match-status-win"><Trophy size={11} /> <span>{t("results.win")}</span></span>;
  if (result === "loss") return <span className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-red-300 border-red-300/50 flex items-center gap-1" data-testid="match-status-loss"><Skull size={11} /> <span>{t("results.loss")}</span></span>;
  return <span className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-[#c8c8c8] border-white/25 flex items-center gap-1" data-testid="match-status-draw"><span aria-hidden="true">=</span><span>{t("results.draw")}</span></span>;
};

export const MatchCard = ({ match, onDelete, onEdit, onDuplicate, onMarkUpcoming }) => {
  const { t, lang } = useLang();
  const status = match.status || "finished";
  const live = status === "live";
  const upcoming = status === "upcoming";
  const postponed = status === "postponed";
  const cancelled = status === "cancelled";
  const us = Number(match.scoreUs);
  const them = Number(match.scoreThem);
  const result = us > them ? "win" : us < them ? "loss" : "draw";
  const roster = typeof match.roster === "string" ? match.roster.trim() : "";
  const teamName = getElysiumTeamName(roster);
  const participants = Array.isArray(match.players) ? match.players.filter((p) => p && (p.pseudo || p.playerId)) : [];
  const maps = parseMaps(match.maps || match.manches || []);
  const vodUrl = getVodUrl(match);
  const bracketUrl = getBracketUrl(match);
  const format = formatLabel(match.format);
  const detailUrl = matchDetailUrl(match);
  const formattedDate = fmtMatchDate(match, lang);
  const ariaDesc = live ? `Match en direct : ${teamName} contre ${match.opponentName || "adversaire"}` : upcoming ? `Match à venir : ${teamName} contre ${match.opponentName}` : `Résultat : ${result === "win" ? "Victoire" : result === "loss" ? "Défaite" : "Égalité"} de ${teamName} ${us}-${them} contre ${match.opponentName}`;

  const card = (
    <div className="border border-white/10 bg-[#1A1A1A] p-6 relative group hover:border-[#D8CA82]/50 transition-colors cursor-pointer motion-reduce:transition-none" data-testid={`match-card-${match.id}`} role="button" tabIndex={0} aria-label={ariaDesc} aria-describedby={`match-desc-${match.id}`} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}>
      <span id={`match-desc-${match.id}`} className="sr-only">{ariaDesc}</span>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-display tracking-[0.3em] uppercase text-[#D8CA82] border border-[#D8CA82]/40 px-2 py-0.5">{match.game || "EVA"}</span>
          {roster && <span className="text-[10px] font-display tracking-[0.25em] uppercase text-[#f7f7f7]/70 border border-white/15 px-2 py-0.5" data-testid={`match-roster-${match.id}`}>{roster}</span>}
          {format && <span className="text-[10px] font-display tracking-[0.2em] uppercase text-[#D8CA82]/80 border border-[#D8CA82]/20 px-1.5 py-0.5" title="Format">{format}</span>}
        </div>
        <ResultBadge result={result} t={t} status={status} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-center gap-2 w-1/3">
          <OptimizedImage src="/brand/logo-icon-gold.png" alt={`Logo ${teamName}`} width="48" height="48" loading="lazy" className="h-12 object-contain" />
          <span className="text-xs font-display uppercase tracking-wider text-[#f7f7f7] text-center leading-tight" data-testid={`match-team-name-${match.id}`}>{teamName}</span>
        </div>
        <div className="text-center">
          {upcoming || (live && (match.scoreUs === undefined || match.scoreUs === "")) ? <p className="font-display font-black text-2xl text-[#c8c8c8]" aria-label={live ? "Score en cours" : "Match à venir"}>VS</p> : <p className="font-display font-black text-3xl text-[#f7f7f7]" aria-label={`Score : ${us} à ${them}`}><span className={result === "win" ? "text-[#D8CA82]" : "text-[#f7f7f7]"}>{match.scoreUs}</span><span className="text-[#a0a0a0] mx-2" aria-hidden="true">—</span><span className="text-[#f7f7f7]">{match.scoreThem}</span></p>}
          {maps.length > 0 && <p className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/30 mt-1 flex items-center justify-center gap-1"><MapIcon size={10} />{maps.length} manche(s)</p>}
        </div>
        <div className="flex flex-col items-center gap-2 w-1/3">
          <OpponentLogo src={match.opponentLogo} name={match.opponentName} className="h-12 w-12" />
          <span className="text-xs font-display uppercase tracking-wider text-[#c8c8c8] text-center">{match.opponentName}</span>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs text-[#c8c8c8]">{formattedDate}{match.time && match.timezone ? ` (${match.timezone})` : ""}</span>
        {match.competition && <span className="text-xs text-[#D8CA82]/80 uppercase tracking-wider">{match.competition}</span>}
      </div>
      {maps.length > 0 && (
        <div className="mt-3 border border-white/5 bg-[#0c0c0c] p-2">
          <div className="flex flex-wrap gap-1.5">
            {maps.slice(0, 5).map((m, i) => (
              <span key={i} className={`text-[10px] px-1.5 py-0.5 border ${Number(m.scoreUs) > Number(m.scoreThem) ? "border-emerald-300/40 text-emerald-300 bg-emerald-300/10" : Number(m.scoreThem) > Number(m.scoreUs) ? "border-red-300/30 text-red-300 bg-red-300/10" : "border-white/10 text-[#f7f7f7]/40"}`}>{m.name || m.map || `M${i+1}`} {m.scoreUs !== "" ? `${m.scoreUs}-${m.scoreThem}` : ""}</span>
            ))}
            {maps.length > 5 && <span className="text-[10px] text-[#f7f7f7]/30">+{maps.length - 5}</span>}
          </div>
        </div>
      )}
      {(upcoming || live) && (match.platform || match.watchUrl) && (
        <div className="mt-3 flex items-center justify-between gap-2">
          {match.platform && <span className="text-xs text-[#c8c8c8]">{t("results.platform")} : {match.platform}</span>}
          {match.watchUrl && <a href={match.watchUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.stopPropagation(); trackEvent(ANALYTICS_EVENTS.LIVE_CLICK, { source: "match_card", matchId: match.id, platform: match.platform || "watchUrl", status }); }} data-testid={`match-watch-${match.id}`} className={`text-xs uppercase tracking-widest flex items-center gap-1.5 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82] ${live ? "bg-red-500/15 border border-red-400/60 text-red-300 font-bold px-3 py-1.5 hover:bg-red-500/25" : "text-[#D8CA82] hover:underline"}`}>{live ? <Radio size={13}/> : <PlayCircle size={13}/>}{live ? t("results.watchLive") : t("results.watch")}</a>}
        </div>
      )}
      {!upcoming && !live && vodUrl && (
        <div className="mt-3">
          <a href={vodUrl} target="_blank" rel="noopener noreferrer" onClick={(e)=>e.stopPropagation()} data-testid={`match-vod-${match.id}`} className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-[#f7f7f7]/70 border border-white/15 px-2 py-1 hover:border-[#D8CA82] hover:text-[#D8CA82]"><Video size={12}/> VOD / Replay</a>
        </div>
      )}
      {bracketUrl && <div className="mt-2"><a href={bracketUrl} target="_blank" rel="noopener noreferrer" onClick={(e)=>e.stopPropagation()} className="text-[11px] uppercase tracking-widest text-[#f7f7f7]/40 hover:text-[#D8CA82] inline-flex items-center gap-1"><ExternalLink size={10}/> Bracket</a></div>}
      <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
        <Link to={detailUrl} onClick={(e)=>e.stopPropagation()} data-testid={`match-detail-link-${match.id}`} className="text-[11px] uppercase tracking-widest text-[#D8CA82] hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]">{t("results.viewDetail") || "Voir la fiche"} →</Link>
        {postponed && <span className="text-[10px] uppercase tracking-widest text-amber-300">Reporté</span>}
        {cancelled && <span className="text-[10px] uppercase tracking-widest text-white/40">Annulé</span>}
      </div>
      {(onEdit || onDelete || onDuplicate || onMarkUpcoming) && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-10 motion-reduce:transition-none flex items-center gap-1 bg-[#111111]/80 border border-white/10 px-1 py-0.5">
          {onDuplicate && <button onClick={(e)=>{e.stopPropagation(); onDuplicate(match);}} data-testid={`match-duplicate-${match.id}`} aria-label={`${t("admin.match.duplicate")} — ${match.opponentName}`} className="text-[#f7f7f7]/50 hover:text-[#D8CA82] p-1" title={t("admin.match.duplicate")}><Copy size={13}/></button>}
          {onMarkUpcoming && status !== "upcoming" && <button onClick={(e)=>{e.stopPropagation(); onMarkUpcoming(match);}} data-testid={`match-upcoming-${match.id}`} aria-label={`${t("admin.match.makeUpcoming")} — ${match.opponentName}`} className="text-sky-300/70 hover:text-sky-300 p-1" title={t("admin.match.makeUpcoming")}><RotateCcw size={13}/></button>}
          {onEdit && <button onClick={(e)=>{e.stopPropagation(); onEdit(match);}} data-testid={`match-edit-${match.id}`} aria-label={`${t("admin.edit")} — ${match.opponentName}`} className="text-[#D8CA82]/80 hover:text-[#D8CA82] p-1" title={t("admin.edit")}><Pencil size={13}/></button>}
          {onDelete && <button onClick={(e)=>{e.stopPropagation(); onDelete(match);}} data-testid={`match-delete-${match.id}`} aria-label={`${t("common.delete")} — ${match.opponentName}`} className="text-red-400 hover:text-red-300 p-1" title={t("common.delete")}><span aria-hidden="true">✕</span></button>}
        </div>
      )}
    </div>
  );

  return (
    <Dialog onOpenChange={(open)=>{ if(open) trackEvent(ANALYTICS_EVENTS.MATCH_VIEW, { matchId: match.id, status, game: match.game, competition: match.competition }); }}>
      <DialogTrigger asChild>{card}</DialogTrigger>
      <DialogContent className="bg-[#1A1A1A] border border-[#D8CA82]/30 rounded-none text-[#f7f7f7] max-w-lg" data-testid={`match-detail-${match.id}`}>
        <DialogHeader><DialogTitle className="font-display uppercase tracking-widest text-[#D8CA82]">{teamName} vs {match.opponentName}</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between border border-white/10 p-4">
            <div className="flex flex-col items-center gap-1 w-1/3"><OptimizedImage src="/brand/logo-icon-gold.png" alt={`Logo ${teamName}`} width="40" height="40" loading="lazy" className="h-10 object-contain"/><span className="text-xs font-display uppercase text-center leading-tight">{teamName}</span></div>
            <p className="font-display font-black text-3xl" aria-label={upcoming ? "Match à venir" : `Score : ${match.scoreUs} à ${match.scoreThem}`}>{upcoming || (live && (match.scoreUs===undefined||match.scoreUs==="")) ? "VS" : <>{match.scoreUs}<span className="text-[#a0a0a0] mx-2" aria-hidden="true">—</span>{match.scoreThem}</>}</p>
            <div className="flex flex-col items-center gap-1 w-1/3"><OpponentLogo src={match.opponentLogo} name={match.opponentName} className="h-10 w-10"/><span className="text-xs font-display uppercase text-center">{match.opponentName}</span></div>
          </div>
          <p className="text-[#c8c8c8]">{formattedDate}{match.timezone ? ` (${match.timezone})` : ""}{match.competition ? ` — ${match.competition}` : ""}{match.platform ? ` — ${match.platform}` : ""}{format ? ` · ${format}` : ""}</p>
          {roster && <p className="text-xs uppercase tracking-[0.25em] text-[#f7f7f7]/50" data-testid={`match-detail-roster-${match.id}`}>{t("results.roster")} : <span className="text-[#D8CA82]">{roster}</span></p>}
          {participants.length>0 && <div><p className="text-xs uppercase tracking-[0.25em] text-[#D8CA82] mb-2">{t("results.players")}</p><div className="flex flex-wrap gap-2" data-testid={`match-players-${match.id}`}>{participants.map((p,idx)=><span key={p.playerId || `${p.pseudo}-${idx}`} className="border border-white/15 bg-[#141414] px-3 py-1.5 text-xs text-[#f7f7f7]/80">{p.pseudo || "Joueur"}</span>)}</div></div>}
          {maps.length>0 && <div><p className="text-xs uppercase tracking-[0.25em] text-[#D8CA82] mb-2">Manches / Cartes</p><div className="space-y-1">{maps.map((m,i)=><div key={i} className="flex items-center justify-between border border-white/10 px-3 py-2 text-xs"><span className="text-[#f7f7f7]">{m.name || m.map || `Manche ${i+1}`}{m.mode ? ` · ${m.mode}` : ""}</span><span className="font-display font-bold">{m.scoreUs || "?"} — {m.scoreThem || "?"}</span></div>)}</div></div>}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-4 flex-wrap">
            <ShareButtons url={`${SITE_URL}${detailUrl}`} text={`${teamName} vs ${match.opponentName || "adversaire"}${!upcoming && !live ? ` — ${match.scoreUs ?? "?"}-${match.scoreThem ?? "?"}` : ""}`} title={`Partager le match ${teamName} vs ${match.opponentName}`} testId={`match-share-${match.id}`} compact />
            <Link to={detailUrl} className="text-xs uppercase tracking-widest text-[#D8CA82] hover:underline border border-[#D8CA82]/30 px-3 py-1.5">Fiche complète →</Link>
          </div>
          <div className="flex gap-3 flex-wrap">
            {(upcoming || live) && match.watchUrl && <a href={match.watchUrl} target="_blank" rel="noopener noreferrer" onClick={()=>trackEvent(ANALYTICS_EVENTS.LIVE_CLICK, { source:"match_detail", matchId:match.id, platform: match.platform || "watchUrl", status })} className={`text-xs uppercase tracking-widest flex items-center gap-1.5 ${live ? "bg-red-500/15 border border-red-400/60 text-red-300 font-bold px-3 py-2" : "text-[#D8CA82] hover:underline"}`}>{live ? <Radio size={13}/> : <ExternalLink size={13}/>}{live ? t("results.watchLive") : t("results.watch")}</a>}
            {vodUrl && !upcoming && !live && <a href={vodUrl} target="_blank" rel="noopener noreferrer" className="text-xs uppercase tracking-widest flex items-center gap-1.5 text-[#D8CA82] hover:underline border border-white/15 px-3 py-2"><Video size={13}/> VOD / Replay</a>}
            {bracketUrl && <a href={bracketUrl} target="_blank" rel="noopener noreferrer" className="text-xs uppercase tracking-widest flex items-center gap-1.5 text-[#f7f7f7]/60 hover:text-[#D8CA82]"><ExternalLink size={13}/> Bracket</a>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
