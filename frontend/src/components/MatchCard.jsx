import { useLang } from "../lib/i18n";
import { ShieldOff } from "lucide-react";

export const MatchCard = ({ match, onDelete }) => {
  const { t } = useLang();
  const us = Number(match.scoreUs);
  const them = Number(match.scoreThem);
  const result = us > them ? "win" : us < them ? "loss" : "draw";
  const resultColor = result === "win" ? "text-emerald-400 border-emerald-400/40" : result === "loss" ? "text-red-400 border-red-400/40" : "text-[#f7f7f7]/60 border-white/20";

  return (
    <div className="border border-white/10 bg-[#1A1A1A] p-6 relative group" data-testid={`match-card-${match.id}`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-display tracking-[0.3em] uppercase text-[#D8CA82] border border-[#D8CA82]/40 px-2 py-0.5">{match.game || "EVA"}</span>
        <span className={`text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 ${resultColor}`}>
          {t(`results.${result}`)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-center gap-2 w-1/3">
          <img src="/brand/logo-icon-gold.png" alt="Elysium" className="h-12 object-contain" />
          <span className="text-xs font-display uppercase tracking-wider text-[#f7f7f7]">Elysium</span>
        </div>
        <div className="text-center">
          <p className="font-display font-black text-3xl text-[#f7f7f7]">
            <span className={result === "win" ? "text-[#D8CA82]" : ""}>{match.scoreUs}</span>
            <span className="text-[#f7f7f7]/30 mx-2">—</span>
            <span>{match.scoreThem}</span>
          </p>
        </div>
        <div className="flex flex-col items-center gap-2 w-1/3">
          {match.opponentLogo ? (
            <img src={match.opponentLogo} alt={match.opponentName} className="h-12 object-contain" />
          ) : (
            <ShieldOff className="h-12 text-[#f7f7f7]/30" />
          )}
          <span className="text-xs font-display uppercase tracking-wider text-[#f7f7f7]/80 text-center">{match.opponentName}</span>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
        <span className="text-xs text-[#f7f7f7]/40">{match.date}</span>
        {match.competition && <span className="text-xs text-[#D8CA82]/70 uppercase tracking-wider">{match.competition}</span>}
      </div>
      {onDelete && (
        <button onClick={() => onDelete(match.id)} data-testid={`match-delete-${match.id}`}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-400 text-xs uppercase tracking-wider transition-opacity">
          ✕
        </button>
      )}
    </div>
  );
};
