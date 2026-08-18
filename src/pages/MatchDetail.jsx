import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { useSEO, SITE_URL } from "../lib/useSEO";
import { LoadingState } from "../components/States";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { OptimizedImage } from "../components/OptimizedImage";
import { ShareButtons } from "../components/ShareButtons";
import { getElysiumTeamName } from "../lib/constants";
import { fmtMatchDate } from "../lib/formatters";
import { formatLabel, parseMaps, computeSeriesStats, getVodUrl, getBracketUrl, getReportArticleId } from "../lib/matchUtils";
import { Trophy, CalendarClock, ExternalLink, PlayCircle, Radio, Map as MapIcon, Users, BarChart3, Link2 } from "lucide-react";

const ResultBadge = ({ result, t, status, live }) => {
  if (live) return <span className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-red-300 border-red-400/60 bg-red-500/10 flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-400 inline-block" />{t("results.live")}</span>;
  if (status === "upcoming") return <span className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-sky-300 border-sky-300/40">{t("results.upcoming")}</span>;
  if (status === "postponed") return <span className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-amber-300 border-amber-300/40">{t("results.status.postponed")}</span>;
  if (status === "cancelled") return <span className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-white/40 border-white/20">{t("results.status.cancelled")}</span>;
  if (result === "win") return <span className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-emerald-300 border-emerald-300/50">{t("results.win")}</span>;
  if (result === "loss") return <span className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-red-300 border-red-300/50">{t("results.loss")}</span>;
  return <span className="text-[10px] font-display tracking-[0.3em] uppercase border px-2 py-0.5 text-[#c8c8c8] border-white/25">{t("results.draw")}</span>;
};

export default function MatchDetail() {
  const { id: rawId } = useParams();
  // id may contain slug suffix e.g.  abc123-team-date — extract real doc id (first segment before - if contains firestore id pattern)
  // Firestore ids are 20 alphanum; but we support any id until first hyphen? Actually we built /match/:id with slug appended, route param includes full.
  // So need to extract id: if param contains '-', we try to take first 20+? Instead we take part before first '-' if length>20 else whole before '-'?
  // Simpler: split by '-' and try to fetch; if not found try full.
  const { t, lang } = useLang();
  const [match, setMatch] = useState(undefined);
  const [competition, setCompetition] = useState(null);
  const [reportArticle, setReportArticle] = useState(null);

  const matchId = useMemo(() => {
    if (!rawId) return "";
    // Route is /match/:id where id may be "docId-slug" ; docId never contains '-'
    // So take first token before '-'
    const parts = rawId.split("-");
    // firestore auto ids are 20 chars, but imported ones may differ; heuristic: first 20 chars + slug => first part is doc id only if rawId includes extra.
    // We try two fetches: first token vs full. We'll attempt full first, then token fallback in effect.
    // For URL consistency we store matchDocId separately.
    // Here return rawId split logic: if rawId length > 20 and contains '-', assume first segment plus maybe? Actually firestore id has no '-'.
    // So docId is rawId.split('-')[0] if rawId includes '-' and that prefix looks like id; else rawId.
    // We'll just return rawId; effect will try both.
    return rawId;
  }, [rawId]);

  useEffect(() => {
    if (!rawId) return;
    let unsub = () => {};
    let cancelled = false;
    const tryFetch = async (docId) => {
      return new Promise((resolve) => {
        const u = onSnapshot(doc(db, "matches", docId), (snap) => {
          if (cancelled) return;
          if (snap.exists()) {
            resolve({ id: snap.id, ...snap.data() });
            unsub = u;
          } else resolve(null);
        }, () => resolve(null));
        // timeout fallback
        setTimeout(() => resolve(null), 4000);
      });
    };
    (async () => {
      setMatch(undefined);
      // Try full rawId
      let data = await tryFetch(rawId);
      if (!data && rawId.includes("-")) {
        const short = rawId.split("-")[0];
        if (short !== rawId) data = await tryFetch(short);
      }
      if (cancelled) return;
      if (data) {
        setMatch(data);
        unsub = onSnapshot(doc(db, "matches", data.id), (s) => setMatch(s.exists() ? { id: s.id, ...s.data() } : null));
      } else {
        // try query fallback by searching? treat as not found
        setMatch(null);
      }
    })();
    return () => { cancelled = true; unsub(); };
  }, [rawId]);

  // Fetch competition doc if match has competitionId
  useEffect(() => {
    if (!match || !match.competitionId) { setCompetition(null); return; }
    return onSnapshot(doc(db, "competitions", match.competitionId), (s) => {
      setCompetition(s.exists() ? { id: s.id, ...s.data() } : null);
    });
  }, [match?.competitionId]);

  // Fetch report article
  useEffect(() => {
    const aid = match ? getReportArticleId(match) : "";
    if (!aid) { setReportArticle(null); return; }
    return onSnapshot(doc(db, "articles", aid), (s) => setReportArticle(s.exists() ? { id: s.id, ...s.data() } : null));
  }, [match]);

  const seoJsonLd = useMemo(() => {
    if (!match) return null;
    const teamName = getElysiumTeamName(match.roster);
    return {
      "@type": "SportsEvent",
      "@id": `${SITE_URL}/match/${match.id}#event`,
      name: `${teamName} vs ${match.opponentName || "adversaire"}`,
      startDate: match.date ? `${match.date}${match.time ? `T${match.time}` : ""}` : undefined,
      eventStatus: match.status === "upcoming" || match.status === "live" ? "https://schema.org/EventScheduled" : "https://schema.org/EventCompleted",
      sport: match.game || "Esport",
      location: match.platform ? { "@type": "VirtualLocation", name: match.platform, url: match.watchUrl || getVodUrl(match) } : undefined,
      competitor: [
        { "@type": "SportsTeam", name: teamName },
        { "@type": "SportsTeam", name: match.opponentName || "Adversaire", logo: match.opponentLogo },
      ],
      description: `${teamName} ${match.scoreUs ?? "?"}-${match.scoreThem ?? "?"} vs ${match.opponentName} — ${match.competition || ""} ${formatLabel(match.format) || ""}`,
    };
  }, [match]);

  useSEO({
    title: match ? `${getElysiumTeamName(match.roster)} vs ${match.opponentName} — Match ${match.competition || ""} — Elysium` : "Match — Elysium Esport",
    description: match ? `${fmtMatchDate(match, lang)} · ${match.competition || ""} · ${formatLabel(match.format) || ""} · ${match.scoreUs ?? "?"}-${match.scoreThem ?? "?"} vs ${match.opponentName}` : "Fiche de match Elysium",
    url: `/match/${rawId}`,
    jsonLd: seoJsonLd,
    noIndex: match === null,
  });

  if (match === undefined) return <div className="min-h-[60vh] flex items-center justify-center bg-[#111111]"><LoadingState testId="match-detail-loading" /></div>;
  if (match === null) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 bg-[#111111] p-8">
      <p className="text-[#f7f7f7]/50" data-testid="match-detail-not-found">{t("results.notFound") || "Match introuvable"}</p>
      <Link to="/resultats" className="text-[#D8CA82] text-sm uppercase tracking-widest hover:underline">← {t("results.title")}</Link>
    </div>
  );

  const teamName = getElysiumTeamName(match.roster);
  const us = Number(match.scoreUs);
  const them = Number(match.scoreThem);
  const result = us > them ? "win" : us < them ? "loss" : "draw";
  const isLive = match.status === "live";
  const isUpcoming = match.status === "upcoming";
  const maps = parseMaps(match.maps || match.manches || []);
  const series = computeSeriesStats(maps);
  const vodUrl = getVodUrl(match);
  const bracketUrl = getBracketUrl(match);
  const participants = Array.isArray(match.players) ? match.players.filter((p) => p && (p.pseudo || p.playerId)) : [];
  const subs = Array.isArray(match.substitutions) ? match.substitutions : [];
  const reportId = getReportArticleId(match);
  const formattedDate = fmtMatchDate(match, lang);

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-6">
        <PageBreadcrumb items={[{ label: t("results.title"), to: "/resultats" }, { label: `${teamName} vs ${match.opponentName}` }]} />
      </div>

      {/* Hero score */}
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10 relative">
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <span className="text-[10px] font-display tracking-[0.3em] uppercase text-[#D8CA82] border border-[#D8CA82]/40 px-2 py-0.5">{match.game || "EVA"}</span>
            {match.roster && <span className="text-[10px] font-display tracking-[0.25em] uppercase text-[#f7f7f7]/70 border border-white/15 px-2 py-0.5">{match.roster}</span>}
            {formatLabel(match.format) && <span className="text-[10px] font-display tracking-[0.25em] uppercase text-[#D8CA82] border border-[#D8CA82]/30 px-2 py-0.5">{formatLabel(match.format)}</span>}
            <ResultBadge result={result} t={t} status={match.status} live={isLive} />
            {match.competition && <span className="text-xs text-[#D8CA82]/80 uppercase tracking-wider ml-2">{match.competition}</span>}
            {competition && <Link to={`/competitions/${competition.id}`} className="text-xs text-[#D8CA82] hover:underline flex items-center gap-1"><Link2 size={12} /> {competition.name}</Link>}
          </div>

          <div className="grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8 border border-white/10 bg-[#1A1A1A] p-6 sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col items-center gap-3 w-1/3">
                  <OptimizedImage src="/brand/logo-icon-gold.png" alt={`Logo ${teamName}`} width="72" height="72" className="h-16 sm:h-20 object-contain" />
                  <span className="text-sm sm:text-base font-display uppercase tracking-wider text-[#f7f7f7] text-center leading-tight">{teamName}</span>
                </div>
                <div className="text-center min-w-[120px]">
                  {isUpcoming || (isLive && (match.scoreUs === undefined || match.scoreUs === "")) ? (
                    <p className="font-display font-black text-3xl text-[#c8c8c8]">VS</p>
                  ) : (
                    <p className="font-display font-black text-4xl sm:text-5xl text-[#f7f7f7]">
                      <span className={result === "win" ? "text-[#D8CA82]" : "text-[#f7f7f7]"}>{match.scoreUs}</span>
                      <span className="text-[#a0a0a0] mx-3">—</span>
                      <span className="text-[#f7f7f7]">{match.scoreThem}</span>
                    </p>
                  )}
                  {(series.total > 0) && <p className="text-[11px] uppercase tracking-widest text-[#f7f7f7]/40 mt-2">{series.wins}-{series.losses} sur {series.total} manches</p>}
                </div>
                <div className="flex flex-col items-center gap-3 w-1/3">
                  {match.opponentLogo ? <img src={match.opponentLogo} alt={`Logo adversaire ${match.opponentName}`} className="h-16 sm:h-20 w-16 sm:w-20 object-contain" /> : <div className="h-16 sm:h-20 w-16 sm:w-20 border border-white/10 bg-[#0c0c0c] flex items-center justify-center text-[#a0a0a0] text-xs">{(match.opponentName||"?").slice(0,2).toUpperCase()}</div>}
                  <span className="text-sm sm:text-base font-display uppercase tracking-wider text-[#c8c8c8] text-center">{match.opponentName || "Adversaire"}</span>
                </div>
              </div>
              <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap items-center gap-4 text-xs text-[#c8c8c8]">
                <span className="flex items-center gap-1.5"><CalendarClock size={13} /> {formattedDate}{match.time ? ` · ${match.time}` : ""}{match.timezone ? ` (${match.timezone})` : ""}</span>
                {match.platform && <span>· {match.platform}</span>}
                {match.status === "postponed" && <span className="text-amber-300">· {t("results.status.postponed")}</span>}
                {match.status === "cancelled" && <span className="text-red-300">· {t("results.status.cancelled")}</span>}
              </div>
              {(isUpcoming || isLive) && match.watchUrl && (
                <a href={match.watchUrl} target="_blank" rel="noopener noreferrer" data-testid="match-detail-watch"
                  className={`mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-widest px-4 py-2 ${isLive ? "bg-red-500/15 border border-red-400/60 text-red-300 font-bold" : "border border-[#D8CA82]/50 text-[#D8CA82] hover:bg-[#D8CA82]/10"}`}>
                  {isLive ? <Radio size={13} /> : <PlayCircle size={13} />} {isLive ? t("results.watchLive") : t("results.watch")}
                </a>
              )}
              {vodUrl && match.status === "finished" && (
                <a href={vodUrl} target="_blank" rel="noopener noreferrer" data-testid="match-detail-vod"
                  className="mt-4 ml-3 inline-flex items-center gap-2 text-xs uppercase tracking-widest border border-white/20 text-[#f7f7f7]/70 px-4 py-2 hover:border-[#D8CA82] hover:text-[#D8CA82]">
                  <PlayCircle size={13} /> VOD / Replay
                </a>
              )}
            </div>

            {/* Side share + bracket/report */}
            <div className="lg:col-span-4 space-y-4">
              <div className="border border-white/10 bg-[#1A1A1A] p-6">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-3">Partager</p>
                <ShareButtons url={`${SITE_URL}/match/${match.id}`} text={`${teamName} vs ${match.opponentName} — ${match.competition || ""} ${match.scoreUs ?? "?"}-${match.scoreThem ?? "?"}`} title={`Partager le match ${teamName} vs ${match.opponentName}`} testId="match-detail-share" />
                <div className="mt-4 pt-4 border-t border-white/10 space-y-2 text-xs">
                  {bracketUrl && <a href={bracketUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[#D8CA82] hover:underline"><ExternalLink size={12} /> Bracket</a>}
                  {competition?.bracketUrl && !bracketUrl && <a href={competition.bracketUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[#D8CA82] hover:underline"><ExternalLink size={12} /> Bracket compétition</a>}
                  {reportId && reportArticle && <Link to={`/actus/${reportId}`} className="flex items-center gap-2 text-[#D8CA82] hover:underline"><ExternalLink size={12} /> Compte rendu : {reportArticle.title?.slice(0,40)}</Link>}
                  {reportId && !reportArticle && <Link to={`/actus/${reportId}`} className="flex items-center gap-2 text-[#D8CA82] hover:underline"><ExternalLink size={12} /> Compte rendu / article</Link>}
                  {!reportId && !bracketUrl && <p className="text-[#f7f7f7]/40">Aucun bracket ou compte rendu lié</p>}
                </div>
              </div>
              <div className="border border-white/10 bg-[#0c0c0c] p-4 text-xs text-[#f7f7f7]/50">
                <p className="uppercase tracking-widest text-[10px] mb-2">URL stable</p>
                <code className="break-all text-[#D8CA82]">{SITE_URL}/match/{match.id}</code>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Details per manches/maps */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-10 grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          {maps.length > 0 && (
            <div className="border border-white/10 bg-[#1A1A1A] p-6" data-testid="match-detail-maps">
              <h2 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7] flex items-center gap-2 mb-4"><MapIcon size={16} className="text-[#D8CA82]" /> Détail par manche / carte</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-[#f7f7f7]/40 text-left">
                      <th className="pb-2">#</th>
                      <th className="pb-2">Carte / Manche</th>
                      <th className="pb-2">Mode</th>
                      <th className="pb-2 text-center">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maps.map((m, i) => {
                      const us = m.scoreUs;
                      const them = m.scoreThem;
                      const win = us !== "" && them !== "" && Number(us) > Number(them);
                      const loss = us !== "" && them !== "" && Number(them) > Number(us);
                      return (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                          <td className="py-3 text-[#f7f7f7]/60">{i+1}</td>
                          <td className="py-3 text-[#f7f7f7] font-medium">{m.name || m.map || `Manche ${i+1}`}</td>
                          <td className="py-3 text-[#f7f7f7]/50">{m.mode || "—"}</td>
                          <td className="py-3 text-center font-display font-bold">
                            {us !== "" || them !== "" ? <span className={win ? "text-emerald-300" : loss ? "text-red-300" : "text-[#f7f7f7]"}>{us || "?"} — {them || "?"}</span> : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-[#f7f7f7]/40 mt-3">{series.wins} manche(s) gagnée(s) – {series.losses} perdue(s) sur {series.total}</p>
            </div>
          )}

          {(participants.length > 0 || subs.length > 0) && (
            <div className="border border-white/10 bg-[#1A1A1A] p-6" data-testid="match-detail-lineup">
              <h2 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7] flex items-center gap-2 mb-4"><Users size={16} className="text-[#D8CA82]" /> Composition & remplacements</h2>
              <div className="flex flex-wrap gap-2">
                {participants.map((p, i) => (
                  <span key={p.playerId || i} className="border border-white/15 bg-[#141414] px-3 py-1.5 text-xs text-[#f7f7f7] inline-flex items-center gap-2">
                    {p.pseudo || "Joueur"}
                    {p.role && <span className="text-[10px] uppercase tracking-widest text-[#D8CA82]">· {p.role}</span>}
                  </span>
                ))}
              </div>
              {subs.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <p className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/40 mb-2">Remplacements</p>
                  <ul className="space-y-1 text-xs text-[#f7f7f7]/70">
                    {subs.map((s, i) => <li key={i}>↔ {s.out || "?"} → {s.in || "?"} {s.at ? `(${s.at})` : ""}</li>)}
                  </ul>
                </div>
              )}
              {participants.length === 0 && <p className="text-xs text-[#f7f7f7]/40">Composition non renseignée</p>}
            </div>
          )}

          <div className="border border-white/10 bg-[#1A1A1A] p-6" data-testid="match-detail-stats">
            <h2 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7] flex items-center gap-2 mb-4"><BarChart3 size={16} className="text-[#D8CA82]" /> Statistiques de la série</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="border border-white/10 p-4 bg-[#0c0c0c]">
                <p className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/40">Format</p>
                <p className="font-display font-bold text-[#D8CA82] mt-1">{formatLabel(match.format) || "—"}</p>
              </div>
              <div className="border border-white/10 p-4 bg-[#0c0c0c]">
                <p className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/40">Manches</p>
                <p className="font-display font-bold text-[#f7f7f7] mt-1">{series.total || "—"}</p>
              </div>
              <div className="border border-white/10 p-4 bg-[#0c0c0c]">
                <p className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/40">Score global</p>
                <p className="font-display font-bold text-[#f7f7f7] mt-1">{match.scoreUs ?? "?"} — {match.scoreThem ?? "?"}</p>
              </div>
            </div>
            {match.notes && <p className="text-sm text-[#f7f7f7]/60 mt-4 whitespace-pre-wrap">{match.notes}</p>}
          </div>

          {reportArticle && (
            <div className="border border-[#D8CA82]/30 bg-[#D8CA82]/5 p-6" data-testid="match-detail-report">
              <p className="text-[10px] uppercase tracking-widest text-[#D8CA82] mb-2">Compte rendu</p>
              <Link to={`/actus/${reportArticle.id}`} className="font-display font-bold text-[#f7f7f7] hover:text-[#D8CA82]">{reportArticle.title}</Link>
              <p className="text-xs text-[#f7f7f7]/60 mt-2 line-clamp-3">{reportArticle.excerpt || reportArticle.content?.slice(0,180)}</p>
            </div>
          )}
        </div>

        <aside className="lg:col-span-4 space-y-6">
          {competition && (
            <div className="border border-white/10 bg-[#1A1A1A] p-6" data-testid="match-detail-competition-card">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[#D8CA82] mb-3">Compétition</p>
              <Link to={`/competitions/${competition.id}`} className="font-display font-bold text-[#f7f7f7] hover:text-[#D8CA82]">{competition.name}</Link>
              <p className="text-xs text-[#f7f7f7]/50 mt-1">{competition.season ? `Saison ${competition.season} · ` : ""}{competition.level || ""} {competition.region ? `· ${competition.region}` : ""}</p>
              {competition.prizePool && <p className="text-xs text-[#D8CA82] mt-2">Prize pool : {competition.prizePool}</p>}
              <div className="mt-4 flex gap-2">
                {competition.officialUrl && <a href={competition.officialUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#D8CA82] hover:underline inline-flex items-center gap-1"><ExternalLink size={11} /> Site officiel</a>}
                {competition.bracketUrl && <a href={competition.bracketUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#D8CA82] hover:underline inline-flex items-center gap-1 ml-3"><Trophy size={11} /> Bracket</a>}
              </div>
            </div>
          )}
          {vodUrl && (
            <div className="border border-white/10 bg-[#1A1A1A] p-6">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[#D8CA82] mb-3">VOD / Replay</p>
              <a href={vodUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#D8CA82] hover:underline break-all">{vodUrl}</a>
            </div>
          )}
          <Link to="/resultats" className="block text-center border border-white/20 text-[#f7f7f7]/70 text-xs uppercase tracking-widest px-4 py-3 hover:border-[#D8CA82] hover:text-[#D8CA82]">← Retour aux résultats</Link>
        </aside>
      </section>
    </div>
  );
}
