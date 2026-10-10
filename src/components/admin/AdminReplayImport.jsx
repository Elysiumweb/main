import { useMemo, useRef } from "react";
import { FileUp, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  REPLAY_SIDE_LABELS,
  autoLinkReplayPlayers,
  buildReplaySeries,
  formatReplayDuration,
  linkReplayPlayer,
  listReplayPlayers,
  parseRocketLeagueReplay,
  sortReplayGames,
  suggestReplaySide,
  unlinkPlayersOutsideSide,
} from "../../lib/rocketLeagueReplay";

const selectCls = "bg-[#111111] border border-white/20 px-2 py-1.5 text-xs text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82] max-w-[160px]";
const SIDE_STYLES = {
  blue: "border-sky-400 text-sky-200 bg-sky-500/10",
  orange: "border-orange-400 text-orange-200 bg-orange-500/10",
};
const RESULT_STYLES = {
  W: "text-emerald-300 border-emerald-300/50",
  L: "text-red-300 border-red-300/50",
  D: "text-[#c8c8c8] border-white/20",
};
const RESULT_LABELS = { W: "Victoire", L: "Défaite", D: "Égalité" };

/**
 * Import des replays Rocket League d'un match.
 * Contrôlé par le formulaire admin : `games` et `side` viennent du parent,
 * `onChange(nextGames, nextSide)` est appelé à chaque modification.
 */
export function AdminReplayImport({ games = [], side = "", members = [], onChange }) {
  const inputRef = useRef(null);
  const series = useMemo(() => buildReplaySeries(games, side), [games, side]);
  const players = useMemo(() => listReplayPlayers(games, side), [games, side]);
  const sideLabel = REPLAY_SIDE_LABELS[side] || "";

  const chooseSide = (nextSide) => {
    if (nextSide === side) return;
    onChange(autoLinkReplayPlayers(unlinkPlayersOutsideSide(games, nextSide), members, nextSide), nextSide);
  };

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const added = [];
    for (const file of files) {
      try {
        const game = parseRocketLeagueReplay(await file.arrayBuffer(), file.name);
        const duplicate = [...games, ...added].some((g) => g.replayId === game.replayId);
        if (duplicate) {
          toast.error(`${file.name} : ce replay est déjà dans la série.`);
          continue;
        }
        added.push(game);
      } catch (err) {
        toast.error(`${file.name} : ${err.message}`);
      }
    }
    if (!added.length) return;
    const merged = sortReplayGames([...games, ...added]);
    const nextSide = side || suggestReplaySide(merged, members);
    onChange(autoLinkReplayPlayers(merged, members, nextSide), nextSide);
    toast.success(`${added.length} replay(s) importé(s)`);
  };

  const removeGame = (replayId) => {
    onChange(games.filter((g) => g.replayId !== replayId), side);
  };

  const clearAll = () => onChange([], side);

  const linkPlayer = (key, playerId) => {
    const member = members.find((m) => m.id === playerId) || null;
    onChange(linkReplayPlayer(games, key, member), side);
  };

  return (
    <div className="space-y-5" data-testid="admin-replay-import">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#D8CA82]">Replays Rocket League</p>
          <p className="text-xs text-[#c8c8c8] mt-1">
            Un fichier par game. Le score, les manches et les stats de nos joueurs sont calculés depuis les replays
            et remplacent les valeurs saisies dans le formulaire.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".replay"
            multiple
            onChange={onFiles}
            className="sr-only"
            data-testid="admin-replay-input"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="border border-[#D8CA82]/50 text-[#D8CA82] font-display font-bold uppercase tracking-widest text-xs px-4 py-2 flex items-center gap-2 hover:bg-[#D8CA82]/10"
            data-testid="admin-replay-add-btn"
          >
            <FileUp size={14} /> Ajouter des .replay
          </button>
          {games.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="border border-red-400/30 text-red-300 text-xs uppercase tracking-widest px-3 py-2 hover:bg-red-500/10"
              data-testid="admin-replay-clear-btn"
            >
              Tout retirer
            </button>
          )}
        </div>
      </div>

      {games.length === 0 ? (
        <p className="text-xs text-[#c8c8c8] italic" data-testid="admin-replay-empty">Aucun replay importé pour ce match.</p>
      ) : (
        <>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 mb-2">Couleur de notre équipe (pour tous les replays)</p>
            <div className="flex gap-2" role="radiogroup" aria-label="Couleur de notre équipe">
              {["blue", "orange"].map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={side === s}
                  onClick={() => chooseSide(s)}
                  data-testid={`admin-replay-side-${s}`}
                  className={`flex-1 border px-3 py-2 text-xs uppercase tracking-widest transition-colors ${side === s ? SIDE_STYLES[s] : "border-white/15 text-[#f7f7f7]/50 hover:text-[#f7f7f7]"}`}
                >
                  {REPLAY_SIDE_LABELS[s]}
                </button>
              ))}
            </div>
            {!side && (
              <p className="text-xs text-amber-300/80 mt-2" data-testid="admin-replay-side-required">
                Choisissez la couleur de notre équipe pour calculer le score.
              </p>
            )}
          </div>

          {series.ready && (
            <div className="border border-[#D8CA82]/30 bg-[#111111] p-4" data-testid="admin-replay-series">
              <p className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8]">Série · {sideLabel}</p>
              <p className="font-display font-black text-3xl text-[#f7f7f7] mt-1">
                <span className="text-[#D8CA82]" data-testid="admin-replay-score-us">{series.scoreUs}</span>
                <span className="text-[#f7f7f7]/40 mx-2">–</span>
                <span data-testid="admin-replay-score-them">{series.scoreThem}</span>
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {series.games.map((g) => (
                  <span key={g.index} className={`text-xs border px-2 py-1 ${RESULT_STYLES[g.result]}`} data-testid={`admin-replay-game-chip-${g.index}`}>
                    Game {g.index} · {g.ourGoals}–{g.theirGoals}
                  </span>
                ))}
              </div>
            </div>
          )}

          {series.warnings.length > 0 && (
            <ul className="space-y-2" data-testid="admin-replay-warnings">
              {series.warnings.map((w) => (
                <li key={w} className="flex gap-2 text-xs text-amber-200/90 border border-amber-300/30 bg-amber-500/5 p-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}

          {side && players.length > 0 && (
            <div data-testid="admin-replay-link-section">
              <p className="text-xs uppercase tracking-[0.2em] text-[#D8CA82] mb-1">Liaison avec les joueurs du site</p>
              <p className="text-xs text-[#c8c8c8] mb-3">
                Associez chaque joueur du replay à un joueur du site. Le lien s'applique à toutes les games.
              </p>
              <div className="overflow-x-auto border border-white/15">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-left uppercase tracking-widest text-[10px] text-[#c8c8c8]">
                      <th className="px-2 py-2">Pseudo replay</th>
                      <th className="px-2 py-2 text-right">Games</th>
                      <th className="px-2 py-2 text-right">Score</th>
                      <th className="px-2 py-2 text-right">Buts</th>
                      <th className="px-2 py-2 text-right">Passes</th>
                      <th className="px-2 py-2 text-right">Arrêts</th>
                      <th className="px-2 py-2 text-right">Tirs</th>
                      <th className="px-2 py-2">Joueur du site</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p, index) => (
                      <tr key={p.key} className="border-b border-white/5" data-testid={`admin-replay-player-${index}`}>
                        <td className="px-2 py-2 text-[#f7f7f7] font-semibold">{p.name || "—"}</td>
                        <td className="px-2 py-2 text-right text-[#c8c8c8]">{p.games}</td>
                        <td className="px-2 py-2 text-right text-[#f7f7f7]">{p.score}</td>
                        <td className="px-2 py-2 text-right text-[#f7f7f7]">{p.goals}</td>
                        <td className="px-2 py-2 text-right text-[#f7f7f7]">{p.assists}</td>
                        <td className="px-2 py-2 text-right text-[#f7f7f7]">{p.saves}</td>
                        <td className="px-2 py-2 text-right text-[#f7f7f7]">{p.shots}</td>
                        <td className="px-2 py-2">
                          <select
                            value={p.playerId || ""}
                            onChange={(e) => linkPlayer(p.key, e.target.value)}
                            className={selectCls}
                            aria-label={`Joueur du site pour ${p.name}`}
                            data-testid={`admin-replay-link-${index}`}
                          >
                            <option value="">— Non lié —</option>
                            {members.map((m) => (
                              <option key={m.id} value={m.id}>{m.pseudo}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="space-y-3" data-testid="admin-replay-games">
            <p className="text-xs uppercase tracking-[0.2em] text-[#D8CA82]">Détail par game</p>
            {games.map((game, gi) => {
              const summary = series.games[gi];
              const label = `Game ${gi + 1}`;
              const blueWon = game.blueScore > game.orangeScore;
              return (
                <details key={game.replayId} className="border border-white/15 bg-[#111111]" data-testid={`admin-replay-game-${gi + 1}`}>
                  <summary className="flex flex-wrap items-center gap-3 px-3 py-2 cursor-pointer text-xs text-[#f7f7f7]">
                    <span className="font-display uppercase tracking-widest text-[#D8CA82]">{label}</span>
                    <span className="text-[#c8c8c8]">{game.map || "Carte inconnue"}</span>
                    <span className="text-[#c8c8c8]">{game.date || "date inconnue"}</span>
                    <span className="text-[#c8c8c8]">{formatReplayDuration(game.durationSeconds)}</span>
                    <span className="font-semibold">
                      <span className={blueWon ? "text-sky-200" : ""}>Bleu {game.blueScore}</span>
                      <span className="text-[#f7f7f7]/40 mx-1">–</span>
                      <span className={!blueWon && game.orangeScore > game.blueScore ? "text-orange-200" : ""}>{game.orangeScore} Orange</span>
                    </span>
                    {summary && side && (
                      <span className={`border px-1.5 py-0.5 uppercase tracking-widest text-[10px] ${RESULT_STYLES[summary.result]}`}>
                        {RESULT_LABELS[summary.result]}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); removeGame(game.replayId); }}
                      className="ml-auto text-red-300/80 hover:text-red-300 flex items-center gap-1"
                      aria-label={`Retirer ${label}`}
                      data-testid={`admin-replay-remove-${gi + 1}`}
                    >
                      <Trash2 size={12} aria-hidden="true" /> Retirer
                    </button>
                  </summary>
                  <div className="overflow-x-auto px-3 pb-3">
                    {game.hasStats ? (
                      <table className="w-full text-xs mt-2">
                        <thead>
                          <tr className="border-b border-white/10 text-left uppercase tracking-widest text-[10px] text-[#c8c8c8]">
                            <th className="py-2 pr-2">Équipe</th>
                            <th className="py-2 pr-2">Joueur</th>
                            <th className="py-2 pr-2 text-right">Score</th>
                            <th className="py-2 pr-2 text-right">Buts</th>
                            <th className="py-2 pr-2 text-right">Passes</th>
                            <th className="py-2 pr-2 text-right">Arrêts</th>
                            <th className="py-2 text-right">Tirs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...game.players].sort((a, b) => (a.side === b.side ? 0 : a.side === side ? -1 : 1)).map((p, pi) => {
                            const isOurs = side && p.side === side;
                            return (
                              <tr key={`${p.name}-${pi}`} className={`border-b border-white/5 ${isOurs ? "text-[#f7f7f7]" : "text-[#f7f7f7]/60"}`}>
                                <td className="py-1.5 pr-2">
                                  <span className={p.side === "blue" ? "text-sky-200" : "text-orange-200"}>
                                    {p.side === "blue" ? "Bleu" : "Orange"}
                                  </span>
                                  {isOurs && <span className="ml-1 text-[#D8CA82]">· nous</span>}
                                </td>
                                <td className={`py-1.5 pr-2 ${isOurs ? "font-semibold" : ""}`}>
                                  {p.name || "—"}{p.bot ? " (bot)" : ""}
                                </td>
                                <td className="py-1.5 pr-2 text-right">{p.score}</td>
                                <td className="py-1.5 pr-2 text-right">{p.goals}</td>
                                <td className="py-1.5 pr-2 text-right">{p.assists}</td>
                                <td className="py-1.5 pr-2 text-right">{p.saves}</td>
                                <td className="py-1.5 text-right">{p.shots}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-xs text-[#c8c8c8] italic mt-2">Pas de statistiques joueurs dans ce replay.</p>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
          {side && players.length === 0 && (
            <p className="text-xs text-[#c8c8c8]" data-testid="admin-replay-no-players">Aucun joueur de notre équipe trouvé dans les replays.</p>
          )}
        </>
      )}
    </div>
  );
}
