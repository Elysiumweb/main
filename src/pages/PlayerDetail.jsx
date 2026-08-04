import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, onSnapshot, collection } from "firebase/firestore";
import { toast } from "sonner";
import { ArrowLeft, Share2, BarChart3, History, Trophy } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { usePlayerSEO } from "../lib/useSEO";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { SocialIcon } from "../components/SocialIcon";
import { MatchCard } from "../components/MatchCard";
import { PlayerPhoto } from "./Team";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { computePlayerStats, isPlayerInMatch, gameHasRosters } from "../lib/constants";

const parseStats = (txt) =>
  (txt || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [label, value = ""] = l.split("|").map((s) => s.trim());
    return { label, value };
  });

export default function PlayerDetail() {
  const { id } = useParams();
  const { t } = useLang();
  const [player, setPlayer] = useState(undefined);
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setError(false); setPlayer(undefined);
    const u1 = onSnapshot(doc(db, "roster", id), (s) => setPlayer(s.exists() ? { id: s.id, ...s.data() } : null),
      (e) => { console.error(e); setError(true); });
    const u2 = onSnapshot(collection(db, "matches"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.status !== "upcoming");
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
  if (player === null) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6">
      <p className="text-[#f7f7f7]/50" data-testid="player-not-found">{t("playerpage.notFound")}</p>
      <Link to="/equipe" className="text-[#D8CA82] text-sm uppercase tracking-widest hover:underline">← {t("team.title")}</Link>
    </div>
  );

  const computedStats = computePlayerStats(player, matches);
  const manualStats = parseStats(player.statsText);
  const palmares = parseStats(player.palmares);
  const equipment = parseStats(player.equipment);
  const previousTeams = parseStats(player.previousTeams);
  const hasRank = !!(player.rank || player.mmr);
  const fmtArrival = (d) => {
    if (!d) return "";
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  };

  let stats = [];
  if (computedStats && computedStats.length > 0) {
    stats = [...computedStats];
    const computedLabels = new Set(computedStats.map((s) => (s.label || "").toLowerCase()));
    manualStats.forEach((s) => {
      if (!computedLabels.has((s.label || "").toLowerCase())) {
        stats.push(s);
      }
    });
    const gamesPlayedLabel = t("playerpage.gamesPlayed");
    if (computedStats[0]?.games && !computedLabels.has(gamesPlayedLabel.toLowerCase())) {
      stats.push({ label: gamesPlayedLabel, value: computedStats[0].games.toString() });
    }
  } else {
    stats = manualStats;
  }

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
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 relative">
          <PageBreadcrumb items={[{ label: t("team.title"), to: "/equipe" }, { label: player.pseudo }]} />
          <Link to="/equipe" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#f7f7f7]/50 hover:text-[#D8CA82] transition-colors mb-6" data-testid="player-back-link">
            <ArrowLeft size={14} /> {t("team.title")}
          </Link>
          <div className="flex flex-col sm:flex-row gap-10 items-start">
            <PlayerPhoto src={player.photo} alt={player.pseudo} className="w-44 h-44 border border-[#D8CA82]/30" />
            <div className="flex-1">
              <span className="text-[10px] font-display tracking-[0.3em] uppercase text-[#D8CA82] border border-[#D8CA82]/40 px-2 py-0.5">{t(`team.status.${player.status || "player"}`)}</span>
              <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase mt-4" data-testid="player-pseudo">{player.pseudo}</h1>
              <p className="text-[#D8CA82] uppercase tracking-[0.3em] text-sm mt-2">{player.game}{player.ingameRole ? ` — ${player.ingameRole}` : ""}</p>
              {hasRank && (
                <div className="flex items-center gap-2 mt-3 flex-wrap" data-testid="player-rank">
                  {player.rank && (
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[#f7f7f7]/70 border border-[#D8CA82]/40 bg-[#D8CA82]/5 px-2.5 py-1">
                      {t("playerpage.rank")}: <span className="text-[#D8CA82] font-bold">{player.rank}</span>
                    </span>
                  )}
                  {player.mmr && (
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[#f7f7f7]/70 border border-white/15 px-2.5 py-1">
                      {t("playerpage.mmr")}: <span className="text-[#f7f7f7] font-bold">{player.mmr}</span>
                    </span>
                  )}
                  {player.arrivalDate && (
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[#f7f7f7]/50 px-2.5 py-1" data-testid="player-arrival">
                      {t("playerpage.arrival")}: {fmtArrival(player.arrivalDate)}
                    </span>
                  )}
                </div>
              )}
              {player.bio && <p className="text-[#f7f7f7]/60 mt-5 max-w-2xl leading-relaxed" data-testid="player-bio">{player.bio}</p>}
              <div className="flex items-center gap-4 mt-6">
                {["x", "twitch", "instagram", "youtube", "tiktok", "threads"].filter((k) => player.socials?.[k]).map((k) => (
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
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16 grid lg:grid-cols-12 gap-12">
        <div className="lg:col-span-5">
          <div className="flex items-center gap-3 mb-6">
            <BarChart3 size={16} className="text-[#D8CA82]" />
            <h2 className="font-display text-base tracking-[0.3em] uppercase text-[#f7f7f7]">{t("playerpage.stats")}</h2>
          </div>
          {stats.length === 0 ? (
            <p className="text-[#f7f7f7]/40" data-testid="player-no-stats">{t("playerpage.noStats")}</p>
          ) : (
            <div className="border border-white/10 bg-[#1A1A1A] divide-y divide-white/5" data-testid="player-stats">
              {stats.map((s, i) => (
                <div key={i} className="flex justify-between px-5 py-3">
                  <span className="text-sm text-[#f7f7f7]/60">{s.label}</span>
                  <span className="text-sm font-display font-bold text-[#D8CA82]">{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="lg:col-span-7">
          <div className="flex items-center gap-3 mb-6">
            <History size={16} className="text-[#D8CA82]" />
            <h2 className="font-display text-base tracking-[0.3em] uppercase text-[#f7f7f7]">{t("playerpage.history")}</h2>
          </div>
          {history.length === 0 ? (
            <p className="text-[#f7f7f7]/40" data-testid="player-no-history">{t("playerpage.noHistory")}</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4" data-testid="player-history">
              {history.map((m) => <MatchCard key={m.id} match={m} />)}
            </div>
          )}
        </div>
      </section>

      {/* Palmarès personnel / Équipement / Carrière */}
      {(palmares.length > 0 || equipment.length > 0 || previousTeams.length > 0 || player.arrivalDate) && (
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
          {(previousTeams.length > 0 || player.arrivalDate) && (
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
                {previousTeams.map((p, i) => (
                  <li key={i} className="flex justify-between px-5 py-3 gap-4">
                    <span className="text-sm text-[#f7f7f7]/80">{p.label}</span>
                    {p.value && <span className="text-xs uppercase tracking-widest text-[#f7f7f7]/50">{p.value}</span>}
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
