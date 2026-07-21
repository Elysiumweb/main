import { useState } from "react";
import { useLang } from "../lib/i18n";
import { ShieldOff, CalendarClock, ExternalLink, PlayCircle, Award } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";

const OppLogo = ({ src, name, className }) => {
  const [err, setErr] = useState(false);
  if (!src || err) return <ShieldOff className={`${className} text-[#f7f7f7]/30`} />;
  return <img src={src} alt={name} onError={() => setErr(true)} className={`${className} object-contain`} />;
};

export const MatchCard = ({ match, onDelete }) => {
  const { t } = useLang();
  const upcoming = match.status === "upcoming";
  const us = Number(match.scoreUs);
  const them = Number(match.scoreThem);
  const result = us > them ? "win" : us < them ? "loss" : "draw";
  const resultColor = result === "win" ? "text-emerald-400 border-emerald-400/40" : result === "loss" ? "text-red-400 border-red-400/40" : "text-[#f7f7f7]/60 border-white/20";
  const maps = (match.maps || []).filter((m) => m.name);

  const card = (
    <div className="border border-white/10 bg-[#1A1A1A] p-6 relative group hover:border-[#D8CA82]/40 transition-colors cursor-pointer" data-testid={`match-card-${match.id}`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-display tracking-[0.3em] uppercase text-[#D8CA82] border border-[#D8CA82]/40 px-2 py-0.5">{match.game || "EVA"}</span>
        {upcoming ? (
          <span className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-sky-300 border-sky-300/40 flex items-center gap-1">
            <CalendarClock size={11} /> {t("results.upcoming")}
          </span>
        ) : (
          <span className={`text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 ${resultColor}`}>{t(`results.${result}`)}</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-center gap-2 w-1/3">
          <img src="/brand/logo-icon-gold.png" alt="Elysium" className="h-12 object-contain" />
          <span className="text-xs font-display uppercase tracking-wider text-[#f7f7f7]">Elysium</span>
        </div>
        <div className="text-center">
          {upcoming ? (
            <p className="font-display font-black text-2xl text-[#f7f7f7]/70">VS</p>
          ) : (
            <p className="font-display font-black text-3xl text-[#f7f7f7]">
              <span className={result === "win" ? "text-[#D8CA82]" : ""}>{match.scoreUs}</span>
              <span className="text-[#f7f7f7]/30 mx-2">—</span>
              <span>{match.scoreThem}</span>
            </p>
          )}
        </div>
        <div className="flex flex-col items-center gap-2 w-1/3">
          <OppLogo src={match.opponentLogo} name={match.opponentName} className="h-12" />
          <span className="text-xs font-display uppercase tracking-wider text-[#f7f7f7]/80 text-center">{match.opponentName}</span>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs text-[#f7f7f7]/40">
          {match.date}{match.time ? ` · ${match.time}` : ""}{match.time && match.timezone ? ` (${match.timezone})` : ""}
        </span>
        {match.competition && <span className="text-xs text-[#D8CA82]/70 uppercase tracking-wider">{match.competition}</span>}
      </div>
      {upcoming && (match.platform || match.watchUrl) && (
        <div className="mt-3 flex items-center justify-between gap-2">
          {match.platform && <span className="text-xs text-[#f7f7f7]/50">{t("results.platform")} : {match.platform}</span>}
          {match.watchUrl && (
            <a href={match.watchUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} data-testid={`match-watch-${match.id}`}
              className="text-xs text-[#D8CA82] uppercase tracking-widest flex items-center gap-1.5 hover:underline">
              <PlayCircle size={13} /> {t("results.watch")}
            </a>
          )}
        </div>
      )}
      {onDelete && (
        <button onClick={(e) => { e.stopPropagation(); onDelete(match.id); }} data-testid={`match-delete-${match.id}`}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-400 text-xs uppercase tracking-wider transition-opacity z-10">
          ✕
        </button>
      )}
    </div>
  );

  return (
    <Dialog>
      <DialogTrigger asChild>{card}</DialogTrigger>
      <DialogContent className="bg-[#1A1A1A] border border-[#D8CA82]/30 rounded-none text-[#f7f7f7] max-w-lg" data-testid={`match-detail-${match.id}`}>
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-widest text-[#D8CA82]">
            Elysium vs {match.opponentName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between border border-white/10 p-4">
            <div className="flex flex-col items-center gap-1 w-1/3">
              <img src="/brand/logo-icon-gold.png" alt="Elysium" className="h-10 object-contain" />
              <span className="text-xs font-display uppercase">Elysium</span>
            </div>
            <p className="font-display font-black text-3xl">
              {upcoming ? "VS" : <>{match.scoreUs}<span className="text-[#f7f7f7]/30 mx-2">—</span>{match.scoreThem}</>}
            </p>
            <div className="flex flex-col items-center gap-1 w-1/3">
              <OppLogo src={match.opponentLogo} name={match.opponentName} className="h-10" />
              <span className="text-xs font-display uppercase text-center">{match.opponentName}</span>
            </div>
          </div>
          <p className="text-[#f7f7f7]/60">
            {match.date}{match.time ? ` · ${match.time}` : ""}{match.timezone ? ` (${match.timezone})` : ""}
            {match.competition ? ` — ${match.competition}` : ""}{match.platform ? ` — ${match.platform}` : ""}
          </p>
          {maps.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[#D8CA82] mb-2">{t("results.maps")}</p>
              <div className="border border-white/10 divide-y divide-white/5" data-testid={`match-maps-${match.id}`}>
                {maps.map((m, i) => (
                  <div key={i} className="flex justify-between px-4 py-2">
                    <span className="text-[#f7f7f7]/70">{m.name}</span>
                    <span className={`font-display font-bold ${m.us > m.them ? "text-emerald-400" : m.us < m.them ? "text-red-400" : "text-[#f7f7f7]/60"}`}>
                      {m.us ?? "—"} - {m.them ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {match.mvp && (
            <p className="flex items-center gap-2 text-[#f7f7f7]/80" data-testid={`match-mvp-${match.id}`}>
              <Award size={15} className="text-[#D8CA82]" /> {t("results.mvp")} : <span className="font-display font-bold text-[#D8CA82]">{match.mvp}</span>
            </p>
          )}
          <div className="flex gap-4">
            {match.vodUrl && (
              <a href={match.vodUrl} target="_blank" rel="noopener noreferrer" data-testid={`match-vod-${match.id}`}
                className="text-xs text-[#D8CA82] uppercase tracking-widest flex items-center gap-1.5 hover:underline">
                <PlayCircle size={13} /> {t("results.vod")}
              </a>
            )}
            {match.watchUrl && upcoming && (
              <a href={match.watchUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-[#D8CA82] uppercase tracking-widest flex items-center gap-1.5 hover:underline">
                <ExternalLink size={13} /> {t("results.watch")}
              </a>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
