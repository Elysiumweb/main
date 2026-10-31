import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, onSnapshot, collection } from "firebase/firestore";
import { toast } from "sonner";
import { ArrowLeft, Share2, BarChart3, History, Trophy } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { usePlayerSEO } from "../lib/useSEO";
import { LoadingState, ErrorState } from "../components/States";
import { SocialIcon } from "../components/SocialIcon";
import { MatchCard } from "../components/MatchCard";
import { PlayerPhoto } from "./Team";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { isPlayerInMatch, isRemovedGame } from "../lib/constants";
import { useRosters } from "../hooks/useRosters";
import { PLAYER_STAT_KEYS, aggregatePlayer, formatStatLine, normalizeCareer } from "../lib/playerStats";

const parseStats = (txt) =>
  (txt || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [label, value = ""] = l.split("|").map((s) => s.trim());
    return { label, value };
  });

export default function PlayerDetail() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const { gameHasRosters } = useRosters();
  const [player, setPlayer] = useState(undefined);
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setError(false); setPlayer(undefined);
    const u1 = onSnapshot(doc(db, "roster", id), (s) => setPlayer(s.exists() ? { id: s.id, ...s.data() } : null),
      (e) => { console.error(e); setError(true); });
    const u2 = onSnapshot(collection(db, "matches"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.status === "finished" && !isRemovedGame(m.game));
      list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      setMatches(list);
    }, console.error);
    return () => { u1(); u2(); };
  }, [id, retryKey]);

  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); toast.success(t("playerpage.copied")); }
    catch { toast.error(t("common.error")); }
  };

  usePlayerSEO(player && player.id ? player : null);

  if (error) return <div className="max-w-4xl mx-auto px-4 py-20"><ErrorState onRetry={() => setRetryKey((k) => k + 1)} testId="player-error" /></div>;
  if (player === undefined) return <LoadingState testId="player-loading" />;
  // Les fiches des pôles supprimés (ex. Valorant) ne sont plus publiques.
  if (player === null || isRemovedGame(player?.game)) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6">
      <p className="text-[#f7f7f7]/50" data-testid="player-not-found">{t("playerpage.notFound")}</p>
      <Link to="/equipe" className="text-[#D8CA82] text-sm uppercase tracking-widest hover:underline">← {t("team.title")}</Link>
    </div>
  );

  const palmares = parseStats(player.palmares);
  const equipment = parseStats(player.equipment);
  const career = normalizeCareer(player.career, player.previousTeams);
  const playerStats = aggregatePlayer(matches, player);
  const hasRank = !!(player.rank || player.mmr);
  const fmtArrival = (d) => {
    if (!d) return "";
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", { month: "long", year: "numeric" });
  };

  const history = matches.filter((m) => {
    if (m.players && Array.isArray(m.players) && m.players.length > 0) {
      return isPlayerInMatch(m, player);
    }
    return (
      m.game === player.game
      && (!gameHasRosters(player.game) || !player.roster || !m.roster || m.roster === player.roster)
    );
  }).slice(0, 6);

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("team.title"), to: "/equipe" }, { label: player.pseudo }]} />
          <Link to="/equipe" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#f7f7f7]/50 hover:text-[#D8CA82] transition-colors mb-6" data-testid="player-back-link">
            <ArrowLeft size={14} /> {t("team.title")}
          </Link>
          <div className="flex flex-col sm:flex-row gap-10 items-start">
            <PlayerPhoto src={player.photo} alt={player.pseudo} className="w-44 h-44 border border-[#D8CA82]/30" />
            <div className="flex-1">
              <span className="text-xs font-display tracking-[0.3em] uppercase text-[#D8CA82] border border-[#D8CA82]/40 px-2 py-0.5">{t(`team.status.${player.status || "player"}`)}</span>
              <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase mt-4" data-testid="player-pseudo">{player.pseudo}</h1>
              <p className="text-[#D8CA82] uppercase tracking-[0.3em] text-sm mt-2">{player.game}{player.ingameRole ? ` — ${player.ingameRole}` : ""}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {player.availableForMatch && <span className="text-xs uppercase tracking-widest border border-emerald-300/40 bg-emerald-300/10 text-emerald-200 px-3 py-1" data-testid="player-available">● Disponible pour un match</span>}
                {player.recruitmentStatus && player.recruitmentStatus !== "closed" && <span className="text-xs uppercase tracking-widest border border-[#D8CA82]/40 bg-[#D8CA82]/10 text-[#D8CA82] px-3 py-1" data-testid="player-recruitment">{player.recruitmentStatus === "open" ? "Ouvert aux propositions" : "À l'écoute"}</span>}
              </div>
              {hasRank && (
                <div className="flex items-center gap-2 mt-3 flex-wrap" data-testid="player-rank">
                  {player.rank && (
                    <span className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/70 border border-[#D8CA82]/40 bg-[#D8CA82]/5 px-2.5 py-1">
                      {t("playerpage.rank")}: <span className="text-[#D8CA82] font-bold">{player.rank}</span>
                    </span>
                  )}
                  {player.mmr && (
                    <span className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/70 border border-white/15 px-2.5 py-1">
                      {t("playerpage.mmr")}: <span className="text-[#f7f7f7] font-bold">{player.mmr}</span>
                    </span>
                  )}
                  {player.arrivalDate && (
                    <span className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/50 px-2.5 py-1" data-testid="player-arrival">
                      {t("playerpage.arrival")}: {fmtArrival(player.arrivalDate)}
                    </span>
                  )}
                </div>
              )}
              {player.bio && <p className="text-[#f7f7f7]/60 mt-5 max-w-2xl leading-relaxed whitespace-pre-wrap" data-testid="player-bio">{player.bio}</p>}
              <div className="flex items-center gap-4 mt-6">
                {["x", "twitch", "instagram", "youtube", "tiktok"].filter((k) => player.socials?.[k]).map((k) => (
                  <a key={k} href={player.socials[k]} target="_blank" rel="noopener noreferrer" data-testid={`player-social-${k}`}
                    className="text-[#f7f7f7]/50 hover:text-[#D8CA82] transition-colors"><SocialIcon name={k} size={20} /></a>
                ))}
                <button onClick={share} data-testid="player-share-btn"
                  className="border border-white/25 text-[#f7f7f7]/70 text-xs uppercase tracking-widest px-4 py-2 flex items-center gap-2 hover:border-[#D8CA82] hover:text-[#D8CA82] transition-colors">
                  <Share2 size={13} /> {t("playerpage.share")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 pt-16" data-testid="player-statistics">
        <div className="flex items-center gap-3 mb-6">
          <BarChart3 size={16} className="text-[#D8CA82]" />
          <h2 className="font-display text-base tracking-[0.3em] uppercase text-[#f7f7f7]">{t("playerpage.stats")}</h2>
        </div>
        <p className="text-xs text-[#c8c8c8] mb-4" data-testid="player-stats-note">{t("stats.playerStats.sub")}</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Matchs", value: playerStats.played },
            { label: "Victoires", value: playerStats.wins },
            { label: "Défaites", value: playerStats.losses },
            { label: "Win rate", value: `${playerStats.winRate}%`, accent: true },
            ...PLAYER_STAT_KEYS.map((key) => ({
              key,
              label: t(`stat.${key}`),
              value: playerStats[key],
              perMatch: key === "mvp" ? `${playerStats.mvpRate}% des matchs` : `moy. ${playerStats[`${key}PerMatch`] ?? "—"}`,
              accent: key === "mvp",
            })),
          ].map((tile) => (
            <div key={tile.key || tile.label} className="border border-white/10 bg-[#1A1A1A] p-4" data-testid={tile.key ? `player-stat-${tile.key}` : undefined}>
              <p className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">{tile.label}</p>
              <p className={`font-display font-black text-2xl mt-1 ${tile.accent ? "text-[#D8CA82]" : "text-[#f7f7f7]"}`}>{tile.value ?? 0}</p>
              {tile.perMatch && <p className="text-[10px] text-[#c8c8c8]/70 mt-1">{tile.perMatch}</p>}
            </div>
          ))}
        </div>
        {playerStats.matches.length > 0 && (
          <div className="mt-8 border border-white/10 bg-[#1A1A1A] overflow-x-auto" data-testid="player-stats-by-match">
            <table className="w-full text-xs">
              <caption className="sr-only">Statistiques par match du joueur</caption>
              <thead className="text-[#c8c8c8] uppercase tracking-widest border-b border-white/10">
                <tr>
                  <th scope="col" className="text-left py-2 px-4">Match</th>
                  {PLAYER_STAT_KEYS.map((key) => <th key={key} scope="col" className="text-center px-2">{t(`stat.${key}`)}</th>)}
                  <th scope="col" className="text-right px-4">Résultat</th>
                </tr>
              </thead>
              <tbody>
                {playerStats.matches.slice(0, 10).map((performance) => (
                  <tr key={performance.id} className="border-t border-white/5">
                    <td className="py-2 px-4 text-[#f7f7f7]">
                      <Link to={`/resultats/${performance.id}`} className="hover:text-[#D8CA82] hover:underline">
                        {performance.opponentName || "Adversaire"}
                      </Link>
                      <span className="text-[#c8c8c8] ml-2">{performance.date}</span>
                    </td>
                    {PLAYER_STAT_KEYS.map((key) => (
                      <td key={key} className={`text-center px-2 ${key === "mvp" ? "text-[#D8CA82] font-bold" : "text-[#f7f7f7]"}`}>
                        {key === "mvp" ? (performance.mvp ? "MVP" : "—") : performance[key]}
                      </td>
                    ))}
                    <td className={`text-right px-4 font-bold ${performance.result === "W" ? "text-emerald-300" : performance.result === "L" ? "text-red-300" : "text-[#c8c8c8]"}`}>{performance.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {playerStats.recent.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2" data-testid="player-recent-form">
            <span className="text-xs uppercase tracking-widest text-[#c8c8c8] py-2 mr-2">Dernières performances</span>
            {playerStats.recent.map((performance) => (
              <Link
                key={performance.id}
                to={`/resultats/${performance.id}`}
                title={`${performance.opponentName || "Adversaire"} · ${formatStatLine(performance)}${performance.mvp ? " · MVP" : ""}`}
                data-testid={`player-recent-${performance.id}`}
                className={`w-9 h-9 flex items-center justify-center border font-display font-bold text-sm ${performance.mvp ? "ring-1 ring-[#D8CA82]/60" : ""} ${performance.result === "W" ? "border-emerald-300/40 text-emerald-300 bg-emerald-300/5" : performance.result === "L" ? "border-red-300/40 text-red-300 bg-red-300/5" : "border-white/20 text-[#c8c8c8]"}`}
              >
                {performance.result}
                {performance.mvp && <span className="sr-only"> MVP</span>}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
        <div className="flex items-center gap-3 mb-6">
          <History size={16} className="text-[#D8CA82]" />
          <h2 className="font-display text-base tracking-[0.3em] uppercase text-[#f7f7f7]">{t("playerpage.history")}</h2>
        </div>
        {history.length === 0 ? (
          <p className="text-[#c8c8c8]" data-testid="player-no-history">{t("playerpage.noHistory")}</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="player-history">
            {history.map((m) => <MatchCard key={m.id} match={m} />)}
          </div>
        )}
      </section>

      {/* Palmarès personnel / Équipement / Carrière */}
      {(palmares.length > 0 || equipment.length > 0 || career.length > 0 || player.arrivalDate) && (
        <section className="max-w-7xl mx-auto px-4 sm:px-8 pb-16 grid lg:grid-cols-12 gap-12">
          {palmares.length > 0 && (
            <div className="lg:col-span-4">
              <div className="flex items-center gap-3 mb-6">
                <Trophy size={16} className="text-[#D8CA82]" />
                <h2 className="font-display text-base tracking-[0.3em] uppercase text-[#f7f7f7]">{t("playerpage.palmares")}</h2>
              </div>
              <ul className="border border-white/10 bg-[#1A1A1A] divide-y divide-white/5" data-testid="player-palmares">
                {palmares.map((p, i) => (
                  <li key={i} className="flex justify-between px-5 py-3">
                    <span className="text-sm text-[#f7f7f7]/80">{p.label}</span>
                    {p.value && <span className="text-xs uppercase tracking-widest text-[#D8CA82]">{p.value}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {equipment.length > 0 && (
            <div className="lg:col-span-4">
              <div className="flex items-center gap-3 mb-6">
                <BarChart3 size={16} className="text-[#D8CA82]" />
                <h2 className="font-display text-base tracking-[0.3em] uppercase text-[#f7f7f7]">{t("playerpage.equipment")}</h2>
              </div>
              <ul className="border border-white/10 bg-[#1A1A1A] divide-y divide-white/5" data-testid="player-equipment">
                {equipment.map((p, i) => (
                  <li key={i} className="flex justify-between px-5 py-3 gap-4">
                    <span className="text-sm text-[#f7f7f7]/60 shrink-0">{p.label}</span>
                    <span className="text-sm text-[#f7f7f7] text-right">{p.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(career.length > 0 || player.arrivalDate) && (
            <div className="lg:col-span-4">
              <div className="flex items-center gap-3 mb-6">
                <History size={16} className="text-[#D8CA82]" />
                <h2 className="font-display text-base tracking-[0.3em] uppercase text-[#f7f7f7]">{t("playerpage.career")}</h2>
              </div>
              <ul className="border border-white/10 bg-[#1A1A1A] divide-y divide-white/5" data-testid="player-career">
                {player.arrivalDate && (
                  <li className="flex justify-between px-5 py-3">
                    <span className="text-sm text-[#D8CA82]">{t("playerpage.arrival")}</span>
                    <span className="text-sm text-[#f7f7f7]">{fmtArrival(player.arrivalDate)}</span>
                  </li>
                )}
                {career.map((p, i) => (
                  <li key={i} className="flex justify-between px-5 py-3 gap-4">
                    <span className="text-sm text-[#f7f7f7]/80">{p.club}</span>
                    <span className="text-right"><span className="block text-xs uppercase tracking-widest text-[#f7f7f7]/50">{p.period}</span>{p.role && <span className="block text-xs text-[#D8CA82] mt-1">{p.role}</span>}{p.achievements && <span className="block text-xs text-[#c8c8c8] mt-1">{p.achievements}</span>}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
