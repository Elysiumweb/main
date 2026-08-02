import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Shield, Users, Trophy } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { GAMES, ROLES, ROSTERS, OFFICIAL_UID, getElysiumTeamName, getStatFieldsForGame } from "../lib/constants";
import { MatchCard } from "../components/MatchCard";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { AdminRoster } from "../components/admin/AdminRoster";
import { AdminPositions } from "../components/admin/AdminPositions";
import { AdminArticles } from "../components/admin/AdminArticles";
import { AdminMedia } from "../components/admin/AdminMedia";
import { AdminEvents } from "../components/admin/AdminEvents";
import { AdminCompetitions } from "../components/admin/AdminCompetitions";
import { AdminCampaigns } from "../components/admin/AdminCampaigns";

const isUrl = (s) => !s || /^https?:\/\/.+/.test(s);

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY_MATCH = { opponentName: "", opponentLogo: "", scoreUs: "", scoreThem: "", date: "", competition: "", game: "EVA", roster: "", status: "finished", time: "", timezone: "Europe/Paris", platform: "", watchUrl: "", mapsText: "", mvp: "", vodUrl: "", players: [] };

export default function Admin() {
  const { isOfficial, role, loading } = useAuth();
  const { t } = useLang();
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [form, setForm] = useState(EMPTY_MATCH);
  const [editMatchId, setEditMatchId] = useState(null);
  const [rosterMembers, setRosterMembers] = useState([]);
  const [selectedRosterPlayer, setSelectedRosterPlayer] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const matchRosters = ROSTERS[form.game] || [];
  const onMatchGameChange = (e) => {
    const game = e.target.value;
    setForm((f) => ({
      ...f,
      game,
      roster: (ROSTERS[game] || []).includes(f.roster) ? f.roster : "",
    }));
  };

  const isBureau = isOfficial || role === "bureau";
  const isStaff = isBureau || role === "manager";
  const allowed = {
    users: isOfficial, matches: isOfficial, roster: isBureau,
    articles: isBureau, media: isBureau, positions: isStaff, events: isStaff,
    competitions: isBureau, campaigns: isBureau,
  };
  const tabs = ["users", "matches", "roster", "articles", "media", "positions", "events", "competitions", "campaigns"].filter((k) => allowed[k]);

  useEffect(() => {
    if (tabs.length && !tabs.includes(tab)) setTab(tabs[0]);
  }, [role, isOfficial]); // eslint-disable-line

  useEffect(() => {
    if (!isOfficial) return;
    const u1 = onSnapshot(collection(db, "users"), (s) => setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
    const u2 = onSnapshot(collection(db, "matches"), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      setMatches(list);
    }, console.error);
    const u3 = onSnapshot(collection(db, "roster"), (s) => setRosterMembers(s.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
    return () => { u1(); u2(); u3(); };
  }, [isOfficial]);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-[#f7f7f7]/40">{t("common.loading")}</div>;
  if (!isStaff) return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <p className="text-[#f7f7f7]/50" data-testid="admin-denied">{t("player.noAccess")}</p>
    </div>
  );

  const setRole = async (uid, role) => {
    try { await updateDoc(doc(db, "users", uid), { role }); toast.success(t("common.saved")); }
    catch (e) { console.error(e); toast.error(t("common.error")); }
  };
  const setGame = async (uid, game) => {
    try { await updateDoc(doc(db, "users", uid), { game: game === "none" ? null : game, roster: null }); toast.success(t("common.saved")); }
    catch (e) { console.error(e); toast.error(t("common.error")); }
  };
  const setRoster = async (uid, roster) => {
    try { await updateDoc(doc(db, "users", uid), { roster: roster === "none" ? null : roster }); toast.success(t("common.saved")); }
    catch (e) { console.error(e); toast.error(t("common.error")); }
  };

  const addPlayerToMatch = () => {
    if (!selectedRosterPlayer) return;
    const member = rosterMembers.find((m) => m.id === selectedRosterPlayer);
    if (!member) return;
    setForm((f) => ({
      ...f,
      players: [
        ...(f.players || []),
        {
          playerId: member.id,
          pseudo: member.pseudo || "Joueur",
          games: [{}],
        },
      ],
    }));
    setSelectedRosterPlayer("");
  };

  const removePlayerFromMatch = (pIndex) => {
    setForm((f) => {
      const next = [...(f.players || [])];
      next.splice(pIndex, 1);
      return { ...f, players: next };
    });
  };

  const addGameToPlayer = (pIndex) => {
    setForm((f) => {
      const next = [...(f.players || [])];
      const target = { ...next[pIndex] };
      target.games = [...(Array.isArray(target.games) ? target.games : [{}]), {}];
      next[pIndex] = target;
      return { ...f, players: next };
    });
  };

  const addGameToAllPlayers = () => {
    setForm((f) => {
      const next = (f.players || []).map((p) => ({
        ...p,
        games: [...(Array.isArray(p.games) ? p.games : [{}]), {}],
      }));
      return { ...f, players: next };
    });
  };

  const removeGameFromPlayer = (pIndex, gIndex) => {
    setForm((f) => {
      const next = [...(f.players || [])];
      const target = { ...next[pIndex] };
      const games = [...(Array.isArray(target.games) ? target.games : [{}])];
      if (games.length > 1) {
        games.splice(gIndex, 1);
        target.games = games;
        next[pIndex] = target;
      }
      return { ...f, players: next };
    });
  };

  const updatePlayerStat = (pIndex, gIndex, key, val) => {
    setForm((f) => {
      const next = [...(f.players || [])];
      const target = { ...next[pIndex] };
      const games = [...(Array.isArray(target.games) ? target.games : [{}])];
      const targetGame = { ...games[gIndex], [key]: val };
      games[gIndex] = targetGame;
      target.games = games;
      next[pIndex] = target;
      return { ...f, players: next };
    });
  };

  const addMatch = async (e) => {
    e.preventDefault();
    const rosterOptions = ROSTERS[form.game] || [];
    const roster = rosterOptions.includes(form.roster) ? form.roster : "";
    if (rosterOptions.length > 0 && !roster) {
      toast.error(t("admin.match.rosterRequired"));
      return;
    }
    if (!isUrl(form.opponentLogo) || !isUrl(form.watchUrl) || !isUrl(form.vodUrl)) {
      toast.error("URL invalide (doit commencer par http:// ou https://)");
      return;
    }
    try {
      const { mapsText, players, ...rest } = form;
      const matchData = { ...rest, roster: rosterOptions.length > 0 ? roster : null };
      const maps = mapsText.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
        const [name, score = ""] = l.split("|").map((s) => s.trim());
        const m = score.match(/(\d+)\s*-\s*(\d+)/);
        return { name, us: m ? Number(m[1]) : null, them: m ? Number(m[2]) : null };
      });
      const sanitizedPlayers = (form.players || []).map((p) => {
        const games = (Array.isArray(p.games) && p.games.length > 0 ? p.games : [{}]).map((g) => {
          const cleanGame = {};
          const fields = getStatFieldsForGame(form.game);
          fields.forEach((f) => {
            cleanGame[f.key] = Number(g[f.key]) || 0;
          });
          return cleanGame;
        });
        return {
          playerId: p.playerId || "",
          pseudo: p.pseudo || "",
          games,
        };
      });
      if (editMatchId) await updateDoc(doc(db, "matches", editMatchId), { ...matchData, maps, players: sanitizedPlayers });
      else await addDoc(collection(db, "matches"), { ...matchData, maps, players: sanitizedPlayers, createdAt: serverTimestamp() });
      setForm(EMPTY_MATCH); setEditMatchId(null);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const editMatch = (m) => {
    setEditMatchId(m.id);
    setForm({
      opponentName: m.opponentName || "", opponentLogo: m.opponentLogo || "", scoreUs: m.scoreUs ?? "", scoreThem: m.scoreThem ?? "",
      date: m.date || "", competition: m.competition || "", game: m.game || "EVA", roster: m.roster || "", status: m.status || "finished",
      time: m.time || "", timezone: m.timezone || "Europe/Paris", platform: m.platform || "", watchUrl: m.watchUrl || "",
      mapsText: (m.maps || []).map((x) => `${x.name} | ${x.us ?? ""}-${x.them ?? ""}`).join("\n"), mvp: m.mvp || "", vodUrl: m.vodUrl || "",
      players: Array.isArray(m.players) ? JSON.parse(JSON.stringify(m.players)) : [],
    });
  };

  const opponents = [...new Map(matches.filter((m) => m.opponentName).map((m) => [m.opponentName, m])).values()];

  const onOpponentChange = (e) => {
    const val = e.target.value;
    setForm((f) => {
      const known = opponents.find((o) => o.opponentName === val);
      return { ...f, opponentName: val, opponentLogo: known && !f.opponentLogo ? known.opponentLogo || "" : f.opponentLogo };
    });
  };

  const delMatch = async (id) => {
    try { await deleteDoc(doc(db, "matches", id)); toast.success(t("common.saved")); }
    catch (e) { console.error(e); toast.error(t("common.error")); }
  };

  return (
    <div className="min-h-[80vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 relative">
          <PageBreadcrumb items={[{ label: t("nav.admin") }]} />
          <div className="flex items-center gap-4">
            <Shield className="text-[#D8CA82]" size={32} />
            <h1 className="font-display font-black text-4xl sm:text-5xl text-[#f7f7f7] uppercase" data-testid="admin-title">{t("admin.title")}</h1>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
        <div className="flex gap-1 border-b border-white/10 mb-10 flex-wrap" data-testid="admin-tabs">
          {tabs.map((k) => (
            <button key={k} onClick={() => setTab(k)} data-testid={`admin-tab-${k}`}
              className={`px-5 py-3 text-xs uppercase tracking-[0.25em] border-b-2 -mb-px transition-colors ${tab === k ? "border-[#D8CA82] text-[#D8CA82]" : "border-transparent text-[#f7f7f7]/50 hover:text-[#f7f7f7]"}`}>
              {t(`admin.tab.${k}`)}
            </button>
          ))}
        </div>
        {tab === "users" && (
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Users className="text-[#D8CA82]" size={18} />
            <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">{t("admin.users")}</h2>
          </div>
          <p className="text-sm text-[#f7f7f7]/50 mb-6">{t("admin.users.sub")}</p>
          <div className="border border-white/10 bg-[#1A1A1A] overflow-x-auto" data-testid="admin-users-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-widest text-[#f7f7f7]/40">
                  <th className="px-4 py-3">Membre</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">{t("admin.role")}</th>
                  <th className="px-4 py-3">{t("admin.game")}</th>
                  <th className="px-4 py-3">{t("admin.roster")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-white/5 hover:bg-white/5" data-testid={`admin-user-row-${u.id}`}>
                    <td className="px-4 py-3 font-semibold text-[#f7f7f7]">
                      {u.displayName} {u.id === OFFICIAL_UID && <span className="text-[10px] text-[#D8CA82] border border-[#D8CA82]/40 px-1.5 py-0.5 ml-2 uppercase">Officiel</span>}
                    </td>
                    <td className="px-4 py-3 text-[#f7f7f7]/50">{u.email}</td>
                    <td className="px-4 py-3">
                      <select value={u.role || "visitor"} onChange={(e) => setRole(u.id, e.target.value)} disabled={u.id === OFFICIAL_UID}
                        data-testid={`admin-role-select-${u.id}`}
                        className="bg-[#111111] border border-white/20 px-2 py-1.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]">
                        {ROLES.map((r) => <option key={r} value={r}>{t(`admin.role.${r}`)}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select value={u.game || "none"} onChange={(e) => setGame(u.id, e.target.value)}
                        data-testid={`admin-game-select-${u.id}`}
                        className="bg-[#111111] border border-white/20 px-2 py-1.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]">
                        <option value="none">—</option>
                        {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {(ROSTERS[u.game] || []).length > 0 ? (
                        <select value={u.roster || "none"} onChange={(e) => setRoster(u.id, e.target.value)}
                          data-testid={`admin-roster-select-${u.id}`}
                          className="bg-[#111111] border border-white/20 px-2 py-1.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]">
                          <option value="none">{t("admin.roster.none")}</option>
                          {(ROSTERS[u.game] || []).map((r) => <option key={r} value={r}>{t(`admin.roster.${r.toLowerCase()}`)}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs text-[#f7f7f7]/30">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {tab === "matches" && (
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="text-[#D8CA82]" size={18} />
            <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">{t("admin.matches")}</h2>
          </div>
          <p className="text-sm text-[#f7f7f7]/50 mb-6">{t("admin.matches.sub")}</p>
          <div className="grid lg:grid-cols-12 gap-10">
            <form onSubmit={addMatch} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6" data-testid="admin-match-form">
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("common.game")}</label>
                <select value={form.game} onChange={onMatchGameChange} className={inputCls} data-testid="admin-match-game">
                  {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              {matchRosters.length > 0 && (
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.match.roster")}</label>
                  <select value={form.roster || ""} onChange={set("roster")} required className={inputCls} data-testid="admin-match-roster">
                    <option value="">{t("admin.roster.none")}</option>
                    {matchRosters.map((r) => <option key={r} value={r}>{t(`admin.roster.${r.toLowerCase()}`)}</option>)}
                  </select>
                  <p className="text-[11px] text-[#f7f7f7]/40 mt-2" data-testid="admin-match-roster-preview">
                    {t("admin.match.rosterPreview")} <span className="text-[#D8CA82]">{getElysiumTeamName(form.roster)}</span>
                  </p>
                </div>
              )}
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.match.opponent")}</label>
                <input value={form.opponentName} onChange={onOpponentChange} required list="admin-opponents" className={inputCls} data-testid="admin-match-opponent" />
                <datalist id="admin-opponents">
                  {opponents.map((o) => <option key={o.opponentName} value={o.opponentName} />)}
                </datalist>
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.match.logo")}</label>
                <input value={form.opponentLogo} onChange={set("opponentLogo")} placeholder="https://..." className={inputCls} data-testid="admin-match-logo" />
                {form.opponentLogo && /^https?:\/\//.test(form.opponentLogo) && (
                  <img src={form.opponentLogo} alt="" className="h-10 mt-2 object-contain border border-white/10 p-1" onError={(e) => { e.target.style.display = "none"; }} data-testid="admin-match-logo-preview" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.match.scoreUs")}</label>
                  <input type="number" min="0" value={form.scoreUs} onChange={set("scoreUs")} required={form.status === "finished"} className={inputCls} data-testid="admin-match-score-us" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.match.scoreThem")}</label>
                  <input type="number" min="0" value={form.scoreThem} onChange={set("scoreThem")} required={form.status === "finished"} className={inputCls} data-testid="admin-match-score-them" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.match.date")}</label>
                  <input type="date" value={form.date} onChange={set("date")} required className={inputCls} data-testid="admin-match-date" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.match.competition")}</label>
                  <input value={form.competition} onChange={set("competition")} className={inputCls} data-testid="admin-match-competition" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.match.status")}</label>
                  <select value={form.status} onChange={set("status")} className={inputCls} data-testid="admin-match-status">
                    <option value="finished">{t("admin.match.finished")}</option>
                    <option value="upcoming">{t("admin.match.upcoming")}</option>
                    <option value="live">{t("admin.match.live")}</option>
                  </select>
                  {form.status === "live" && <p className="text-[11px] text-[#f7f7f7]/40 mt-1">{t("admin.match.scoreHint")}</p>}
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.match.time")}</label>
                  <input type="time" value={form.time} onChange={set("time")} className={inputCls} data-testid="admin-match-time" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.match.timezone")}</label>
                  <input value={form.timezone} onChange={set("timezone")} className={inputCls} data-testid="admin-match-timezone" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.match.platform")}</label>
                  <input value={form.platform} onChange={set("platform")} placeholder="PC / Salle EVA..." className={inputCls} data-testid="admin-match-platform" />
                </div>
              </div>
              {(form.status === "upcoming" || form.status === "live") && (
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.match.watch")}</label>
                  <input value={form.watchUrl} onChange={set("watchUrl")} placeholder="https://twitch.tv/..." className={inputCls} data-testid="admin-match-watch" />
                  {form.status === "live" && form.watchUrl && (
                    <p className="text-[11px] text-emerald-300/80 mt-1" data-testid="admin-match-live-hint">
                      ✓ {t("results.watchLive")} — le lien sera mis en avant (badge rouge).
                    </p>
                  )}
                </div>
              )}
              {form.status === "finished" && (
                <>
                  <div>
                    <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.match.maps")}</label>
                    <textarea value={form.mapsText} onChange={set("mapsText")} rows={3} placeholder={"Artefact | 13-7\nPolaris | 10-13"} className={inputCls} data-testid="admin-match-maps" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.match.mvp")}</label>
                      <input value={form.mvp} onChange={set("mvp")} className={inputCls} data-testid="admin-match-mvp" />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.match.vod")}</label>
                      <input value={form.vodUrl} onChange={set("vodUrl")} placeholder="https://..." className={inputCls} data-testid="admin-match-vod" />
                    </div>
                  </div>
                </>
              )}

              {/* Joueurs & Statistiques section */}
              <div className="border-t border-white/10 pt-4 mt-4 space-y-4" data-testid="admin-match-players-section">
                <div className="flex items-center justify-between">
                  <label className="text-xs uppercase tracking-[0.2em] text-[#D8CA82] block">
                    {t("admin.match.players")}
                  </label>
                  {(form.players || []).length > 0 && (
                    <button
                      type="button"
                      onClick={addGameToAllPlayers}
                      className="text-[11px] text-[#D8CA82] uppercase tracking-wider hover:underline"
                      data-testid="admin-match-add-game-all"
                    >
                      {t("admin.match.addGameAll")}
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <select
                    value={selectedRosterPlayer}
                    onChange={(e) => setSelectedRosterPlayer(e.target.value)}
                    className={inputCls}
                    data-testid="admin-match-player-select"
                  >
                    <option value="">{t("admin.match.selectPlayer")}</option>
                    {rosterMembers
                      .filter((m) => !(form.players || []).some((p) => p.playerId === m.id))
                      .sort((a, b) => (a.pseudo || "").localeCompare(b.pseudo || ""))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.pseudo} ({m.game || "EVA"}{m.roster ? ` · ${m.roster}` : ""})
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={addPlayerToMatch}
                    disabled={!selectedRosterPlayer}
                    data-testid="admin-match-add-player-btn"
                    className="bg-[#D8CA82]/20 border border-[#D8CA82] text-[#D8CA82] px-4 py-2 text-xs uppercase tracking-wider disabled:opacity-50 hover:bg-[#D8CA82] hover:text-[#111111] transition-colors whitespace-nowrap"
                  >
                    +
                  </button>
                </div>

                {(form.players || []).map((p, pIndex) => {
                  const statFields = getStatFieldsForGame(form.game);
                  const games = Array.isArray(p.games) && p.games.length > 0 ? p.games : [{}];

                  return (
                    <div
                      key={p.playerId || pIndex}
                      className="border border-white/10 bg-[#141414] p-4 space-y-3"
                      data-testid={`admin-match-player-card-${p.playerId}`}
                    >
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <span className="font-display font-bold text-sm text-[#f7f7f7]">
                          {p.pseudo}
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => addGameToPlayer(pIndex)}
                            className="text-xs text-[#D8CA82] hover:underline"
                            data-testid={`admin-match-add-game-${p.playerId}`}
                          >
                            {t("admin.match.addGame")}
                          </button>
                          <button
                            type="button"
                            onClick={() => removePlayerFromMatch(pIndex)}
                            className="text-xs text-red-400 hover:underline"
                            data-testid={`admin-match-remove-player-${p.playerId}`}
                          >
                            {t("admin.match.removePlayer")}
                          </button>
                        </div>
                      </div>

                      {games.map((g, gIndex) => (
                        <div
                          key={gIndex}
                          className="bg-[#111111] border border-white/5 p-2 space-y-2"
                          data-testid={`admin-match-player-${p.playerId}-game-${gIndex}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] uppercase tracking-wider text-[#f7f7f7]/60">
                              {t("admin.match.gameIndex")} {gIndex + 1}
                            </span>
                            {games.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeGameFromPlayer(pIndex, gIndex)}
                                className="text-[11px] text-red-400/80 hover:text-red-400"
                              >
                                {t("admin.match.removeGame")}
                              </button>
                            )}
                          </div>
                          <div className={`grid ${statFields.length === 4 ? "grid-cols-4" : "grid-cols-3"} gap-2`}>
                            {statFields.map((f) => (
                              <div key={f.key}>
                                <label className="text-[10px] uppercase tracking-wider text-[#f7f7f7]/40 block mb-1">
                                  {f.label}
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={g[f.key] ?? ""}
                                  onChange={(e) => updatePlayerStat(pIndex, gIndex, f.key, e.target.value)}
                                  className="w-full bg-[#1A1A1A] border border-white/10 px-2 py-1 text-xs text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]"
                                  data-testid={`stat-input-${p.playerId}-${gIndex}-${f.key}`}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              <button type="submit" data-testid="admin-match-submit"
                className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
                {t("admin.match.add")}
              </button>
            </form>
            <div className="lg:col-span-7">
              {matches.length === 0 ? (
                <p className="text-[#f7f7f7]/40" data-testid="admin-matches-empty">{t("results.empty")}</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {matches.map((m) => <MatchCard key={m.id} match={m} onDelete={delMatch} onEdit={editMatch} />)}
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {tab === "roster" && <AdminRoster />}
        {tab === "positions" && <AdminPositions />}
        {tab === "articles" && <AdminArticles />}
        {tab === "media" && <AdminMedia />}
        {tab === "events" && <AdminEvents />}
        {tab === "competitions" && <AdminCompetitions />}
        {tab === "campaigns" && <AdminCampaigns />}
      </section>
    </div>
  );
}
