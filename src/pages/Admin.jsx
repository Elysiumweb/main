import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, deleteField, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { FileUp, Search, Shield, Trophy, Users } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { GAMES, ROLES, ROSTERS, OFFICIAL_UID, getElysiumTeamName } from "../lib/constants";
import { MatchCard } from "../components/MatchCard";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { AdminRoster } from "../components/admin/AdminRoster";
import { AdminPositions } from "../components/admin/AdminPositions";
import { AdminArticles } from "../components/admin/AdminArticles";
import { AdminMedia } from "../components/admin/AdminMedia";
import { AdminEvents } from "../components/admin/AdminEvents";
import { AdminCompetitions } from "../components/admin/AdminCompetitions";
import { AdminCampaigns } from "../components/admin/AdminCampaigns";
import { AdminPartnerRequests } from "../components/admin/AdminPartnerRequests";
import { AdminNewsletter } from "../components/admin/AdminNewsletter";
import { AdminAudit } from "../components/admin/AdminAudit";
import { MfaTotpPanel } from "../components/MfaTotpPanel";
import { logAdminAction } from "../lib/notify";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";

const isUrl = (s) => !s || /^https?:\/\/.+/.test(s);

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY_MATCH = { opponentName: "", opponentLogo: "", scoreUs: "", scoreThem: "", date: "", competition: "", game: "EVA", roster: "", status: "finished", time: "", timezone: "Europe/Paris", platform: "", watchUrl: "", players: [] };
const PAGE_SIZE = 12;

const sanitizeMatchForClone = (m) => {
  const { id, createdAt, updatedAt, ...rest } = m || {};
  ["maps", "mvp", "vodUrl", "players"].forEach((key) => { delete rest[key]; });
  return JSON.parse(JSON.stringify(rest));
};
const parseCsvLine = (line) => {
  const out = [];
  let cur = "";
  let quote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
    else if (ch === '"') quote = !quote;
    else if (ch === "," && !quote) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
};
const parseMatchImport = (text, fileName = "") => {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (fileName.endsWith(".json") || trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : (Array.isArray(parsed.matches) ? parsed.matches : []);
  }
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((acc, h, i) => ({ ...acc, [h]: values[i] ?? "" }), {});
  });
};
const sanitizeMatchPlayers = (players = []) => (Array.isArray(players) ? players : [])
  .map((p) => ({
    playerId: p.playerId || p.id || "",
    pseudo: p.pseudo || p.name || "",
  }))
  .filter((p) => p.playerId || p.pseudo);

const normalizeImportedMatch = (raw) => ({
  opponentName: raw.opponentName || raw.opponent || raw.adversaire || "",
  opponentLogo: raw.opponentLogo || raw.logo || "",
  scoreUs: raw.scoreUs ?? raw.elysiumScore ?? "",
  scoreThem: raw.scoreThem ?? raw.opponentScore ?? "",
  date: raw.date || "",
  competition: raw.competition || "",
  game: raw.game || "EVA",
  roster: raw.roster || null,
  status: raw.status || "upcoming",
  time: raw.time || "",
  timezone: raw.timezone || "Europe/Paris",
  platform: raw.platform || "",
  watchUrl: raw.watchUrl || raw.stream || "",
  players: sanitizeMatchPlayers(raw.players),
});

export default function Admin() {
  const { user, displayName, isOfficial, role, loading, requiresMfa, mfaEnrolled } = useAuth();
  const { t } = useLang();
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [form, setForm] = useState(EMPTY_MATCH);
  const [editMatchId, setEditMatchId] = useState(null);
  const [rosterMembers, setRosterMembers] = useState([]);
  const [selectedRosterPlayer, setSelectedRosterPlayer] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [matchQuery, setMatchQuery] = useState("");
  const [matchPage, setMatchPage] = useState(1);
  const [confirmMatch, setConfirmMatch] = useState(null);
  const importInputRef = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const matchRosters = ROSTERS[form.game] || [];
  const onMatchGameChange = (e) => {
    const game = e.target.value;
    setSelectedRosterPlayer("");
    setForm((f) => ({
      ...f,
      game,
      roster: (ROSTERS[game] || []).includes(f.roster) ? f.roster : "",
      players: [],
    }));
  };
  const onMatchRosterChange = (e) => {
    setSelectedRosterPlayer("");
    setForm((f) => ({ ...f, roster: e.target.value, players: [] }));
  };

  const isBureau = isOfficial || role === "bureau";
  const isStaff = isBureau || role === "manager";
  const allowed = {
    users: isOfficial, matches: isOfficial, roster: isBureau,
    articles: isBureau, media: isBureau, positions: isStaff, events: isStaff,
    competitions: isBureau, campaigns: isBureau, partners: isBureau,
    newsletter: isBureau, audit: isBureau,
  };
  const tabs = ["users", "matches", "roster", "articles", "media", "positions", "events", "competitions", "campaigns", "partners", "newsletter", "audit"].filter((k) => allowed[k]);

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

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => [u.displayName, u.email, u.role, u.game, u.roster]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)));
  }, [users, userQuery]);
  const userTotalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const pagedUsers = filteredUsers.slice((Math.min(userPage, userTotalPages) - 1) * PAGE_SIZE, Math.min(userPage, userTotalPages) * PAGE_SIZE);

  const filteredMatches = useMemo(() => {
    const q = matchQuery.trim().toLowerCase();
    if (!q) return matches;
    return matches.filter((m) => [m.opponentName, m.competition, m.game, m.roster, m.status, m.date]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)));
  }, [matches, matchQuery]);
  const matchTotalPages = Math.max(1, Math.ceil(filteredMatches.length / PAGE_SIZE));
  const pagedMatches = filteredMatches.slice((Math.min(matchPage, matchTotalPages) - 1) * PAGE_SIZE, Math.min(matchPage, matchTotalPages) * PAGE_SIZE);
  const availableRosterPlayers = useMemo(() => {
    const selectedIds = new Set((form.players || []).map((p) => p.playerId).filter(Boolean));
    return rosterMembers
      .filter((m) => m.status !== "staff")
      .filter((m) => !selectedIds.has(m.id))
      .filter((m) => !form.game || !m.game || m.game === form.game)
      .filter((m) => {
        const rosters = ROSTERS[form.game] || [];
        if (!rosters.length || !form.roster) return true;
        return (m.roster || "") === form.roster;
      })
      .sort((a, b) => (a.pseudo || "").localeCompare(b.pseudo || ""));
  }, [rosterMembers, form.players, form.game, form.roster]);

  useEffect(() => { setUserPage(1); }, [userQuery]);
  useEffect(() => { setMatchPage(1); }, [matchQuery]);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-[#f7f7f7]/40">{t("common.loading")}</div>;
  if (!isStaff) return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <p className="text-[#f7f7f7]/50" data-testid="admin-denied">{t("player.noAccess")}</p>
    </div>
  );
  if (requiresMfa && !mfaEnrolled) return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg space-y-6" data-testid="admin-mfa-required">
        <div className="border border-orange-300/40 bg-orange-300/5 p-8 text-center">
          <Shield className="text-orange-200 mx-auto mb-4" size={32} aria-hidden="true" />
          <h1 className="font-display text-xl uppercase tracking-[0.25em] text-orange-100 mb-3">Double authentification requise</h1>
          <p className="text-sm text-[#c8c8c8]">Les rôles sensibles (officiel/bureau) doivent activer un second facteur TOTP avant d'accéder à l'administration. Configurez-la ci-dessous — pas besoin de quitter cette page.</p>
        </div>
        <MfaTotpPanel />
      </div>
    </div>
  );

  const auditActor = { uid: user?.uid, name: displayName, email: user?.email };

  const setRole = async (uid, nextRole) => {
    const target = users.find((u) => u.id === uid);
    try {
      await updateDoc(doc(db, "users", uid), { role: nextRole });
      await logAdminAction({
        action: "user_role_changed",
        label: `${target?.displayName || target?.email || uid}: ${target?.role || "visitor"} → ${nextRole}`,
        actor: auditActor,
        target: { collection: "users", id: uid },
        details: { previousRole: target?.role || "visitor", role: nextRole },
      });
      toast.success(t("common.saved"));
    }
    catch (e) { console.error(e); toast.error(t("common.error")); }
  };
  const setGame = async (uid, nextGame) => {
    const target = users.find((u) => u.id === uid);
    try {
      await updateDoc(doc(db, "users", uid), { game: nextGame === "none" ? null : nextGame, roster: null });
      await logAdminAction({
        action: "user_game_changed",
        label: `${target?.displayName || target?.email || uid}: ${target?.game || "—"} → ${nextGame}`,
        actor: auditActor,
        target: { collection: "users", id: uid },
      });
      toast.success(t("common.saved"));
    }
    catch (e) { console.error(e); toast.error(t("common.error")); }
  };
  const setRoster = async (uid, nextRoster) => {
    const target = users.find((u) => u.id === uid);
    try {
      await updateDoc(doc(db, "users", uid), { roster: nextRoster === "none" ? null : nextRoster });
      await logAdminAction({
        action: "user_roster_changed",
        label: `${target?.displayName || target?.email || uid}: ${target?.roster || "—"} → ${nextRoster}`,
        actor: auditActor,
        target: { collection: "users", id: uid },
      });
      toast.success(t("common.saved"));
    }
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
        { playerId: member.id, pseudo: member.pseudo || "Joueur" },
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

  const addMatch = async (e) => {
    e.preventDefault();
    const rosterOptions = ROSTERS[form.game] || [];
    const roster = rosterOptions.includes(form.roster) ? form.roster : "";
    if (rosterOptions.length > 0 && !roster) {
      toast.error(t("admin.match.rosterRequired"));
      return;
    }
    if (!isUrl(form.opponentLogo) || !isUrl(form.watchUrl)) {
      toast.error("URL invalide (doit commencer par http:// ou https://)");
      return;
    }
    try {
      const matchData = {
        ...form,
        roster: rosterOptions.length > 0 ? roster : null,
        players: sanitizeMatchPlayers(form.players),
      };
      if (editMatchId) {
        await updateDoc(doc(db, "matches", editMatchId), {
          ...matchData,
          maps: deleteField(),
          mvp: deleteField(),
          vodUrl: deleteField(),
          updatedAt: serverTimestamp(),
        });
        await logAdminAction({
          action: "match_updated",
          label: `${matchData.game} vs ${matchData.opponentName}`,
          actor: auditActor,
          target: { collection: "matches", id: editMatchId },
        });
      } else {
        const ref = await addDoc(collection(db, "matches"), { ...matchData, createdAt: serverTimestamp() });
        await logAdminAction({
          action: "match_created",
          label: `${matchData.game} vs ${matchData.opponentName}`,
          actor: auditActor,
          target: { collection: "matches", id: ref.id },
        });
      }
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
      players: sanitizeMatchPlayers(m.players),
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

  const delMatch = async (matchOrId) => {
    const match = typeof matchOrId === "string" ? matches.find((m) => m.id === matchOrId) : matchOrId;
    const id = typeof matchOrId === "string" ? matchOrId : matchOrId?.id;
    if (!id) return;
    try {
      await deleteDoc(doc(db, "matches", id));
      await logAdminAction({
        action: "match_deleted",
        label: `${match?.game || ""} vs ${match?.opponentName || id}`,
        actor: auditActor,
        target: { collection: "matches", id },
      });
      toast.success(t("common.saved"));
    }
    catch (e) { console.error(e); toast.error(t("common.error")); }
  };

  const duplicateMatch = async (match) => {
    try {
      const clone = sanitizeMatchForClone(match);
      const ref = await addDoc(collection(db, "matches"), {
        ...clone,
        status: clone.status || "upcoming",
        createdAt: serverTimestamp(),
      });
      await logAdminAction({
        action: "match_duplicated",
        label: `${match.game || ""} vs ${match.opponentName}`,
        actor: auditActor,
        target: { collection: "matches", id: ref.id },
        details: { sourceId: match.id },
      });
      toast.success("Match dupliqué");
    } catch (e) { console.error(e); toast.error(t("common.error")); }
  };

  const markMatchUpcoming = async (match) => {
    try {
      await updateDoc(doc(db, "matches", match.id), {
        status: "upcoming",
        scoreUs: "",
        scoreThem: "",
        maps: deleteField(),
        mvp: deleteField(),
        vodUrl: deleteField(),
        players: deleteField(),
        updatedAt: serverTimestamp(),
      });
      await logAdminAction({
        action: "match_marked_upcoming",
        label: `${match.game || ""} vs ${match.opponentName}`,
        actor: auditActor,
        target: { collection: "matches", id: match.id },
      });
      toast.success("Match passé en “à venir”");
    } catch (e) { console.error(e); toast.error(t("common.error")); }
  };

  const importMatches = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseMatchImport(text, file.name.toLowerCase()).map(normalizeImportedMatch).filter((m) => m.opponentName && m.date);
      if (rows.length === 0) { toast.error("Aucun match valide trouvé (opponentName/opponent + date requis)."); return; }
      const refs = await Promise.all(rows.map((m) => addDoc(collection(db, "matches"), { ...m, createdAt: serverTimestamp() })));
      await logAdminAction({
        action: "matches_imported",
        label: `${rows.length} match(s) importé(s) depuis ${file.name}`,
        actor: auditActor,
        target: { collection: "matches", id: refs.map((r) => r.id).join(",") },
      });
      toast.success(`${rows.length} match(s) importé(s)`);
    } catch (err) {
      console.error(err);
      toast.error("Import impossible : vérifiez le format CSV/JSON.");
    }
  };

  return (
    <div className="min-h-[80vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("nav.admin") }]} />
          <div className="flex items-center gap-4">
            <Shield className="text-[#D8CA82]" size={32} />
            <h1 className="font-display font-black text-4xl sm:text-5xl text-[#f7f7f7] uppercase" data-testid="admin-title">{t("admin.title")}</h1>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
        <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex gap-1 border-b border-white/10 mb-10 flex-wrap w-full h-auto justify-start bg-transparent p-0 rounded-none" data-testid="admin-tabs">
          {tabs.map((k) => (
            <TabsTrigger key={k} value={k} data-testid={`admin-tab-${k}`}
              className="px-5 py-3 text-xs uppercase tracking-[0.25em] border-b-2 -mb-px transition-colors rounded-none bg-transparent shadow-none border-transparent text-[#f7f7f7]/50 hover:text-[#f7f7f7] data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-[#D8CA82] data-[state=active]:text-[#D8CA82]">
              {t(`admin.tab.${k}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="users" className="mt-0">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Users className="text-[#D8CA82]" size={18} />
            <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">{t("admin.users")}</h2>
          </div>
          <p className="text-sm text-[#f7f7f7]/50 mb-6">{t("admin.users.sub")}</p>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <label className="relative w-full sm:max-w-md">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#f7f7f7]/30" />
              <input
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder={t("admin.search.users")}
                className="w-full bg-[#1A1A1A] border border-white/15 pl-9 pr-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]"
                data-testid="admin-users-search"
              />
            </label>
            <p className="text-xs text-[#f7f7f7]/40">{filteredUsers.length} résultat(s)</p>
          </div>
          <div className="border border-white/10 bg-[#1A1A1A] overflow-x-auto" data-testid="admin-users-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-widest text-[#f7f7f7]/40">
                  <th className="px-4 py-3">{t("admin.table.member")}</th>
                  <th className="px-4 py-3">{t("admin.table.email")}</th>
                  <th className="px-4 py-3">{t("admin.role")}</th>
                  <th className="px-4 py-3">{t("admin.game")}</th>
                  <th className="px-4 py-3">{t("admin.roster")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedUsers.map((u) => (
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
          {filteredUsers.length > PAGE_SIZE && (
            <div className="flex items-center justify-end gap-2 mt-4" data-testid="admin-users-pagination">
              <button onClick={() => setUserPage((p) => Math.max(1, p - 1))} disabled={userPage <= 1}
                className="border border-white/15 text-[#f7f7f7]/60 px-3 py-1.5 text-xs uppercase tracking-widest disabled:opacity-30 hover:border-[#D8CA82] hover:text-[#D8CA82]">{t("admin.pagination.prev")}</button>
              <span className="text-xs text-[#f7f7f7]/40">{t("admin.pagination.page")} {Math.min(userPage, userTotalPages)} / {userTotalPages}</span>
              <button onClick={() => setUserPage((p) => Math.min(userTotalPages, p + 1))} disabled={userPage >= userTotalPages}
                className="border border-white/15 text-[#f7f7f7]/60 px-3 py-1.5 text-xs uppercase tracking-widest disabled:opacity-30 hover:border-[#D8CA82] hover:text-[#D8CA82]">{t("admin.pagination.next")}</button>
            </div>
          )}
        </div>
        </TabsContent>

        <TabsContent value="matches" className="mt-0">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="text-[#D8CA82]" size={18} />
            <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">{t("admin.matches")}</h2>
          </div>
          <p className="text-sm text-[#f7f7f7]/50 mb-6">{t("admin.matches.sub")}</p>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-6">
            <label className="relative w-full lg:max-w-md">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#f7f7f7]/30" />
              <input
                value={matchQuery}
                onChange={(e) => setMatchQuery(e.target.value)}
                placeholder={t("admin.search.matches")}
                className="w-full bg-[#1A1A1A] border border-white/15 pl-9 pr-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]"
                data-testid="admin-matches-search"
              />
            </label>
            <div className="flex gap-2 flex-wrap">
              <input ref={importInputRef} type="file" accept=".csv,.json,application/json,text/csv" onChange={importMatches} className="sr-only" data-testid="admin-match-import-input" />
              <button type="button" onClick={() => importInputRef.current?.click()}
                className="border border-[#D8CA82]/50 text-[#D8CA82] font-display font-bold uppercase tracking-widest text-xs px-4 py-2.5 flex items-center gap-2 hover:bg-[#D8CA82]/10" data-testid="admin-match-import-btn">
                <FileUp size={14} /> {t("admin.import.button")}
              </button>
            </div>
          </div>
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
                  <select value={form.roster || ""} onChange={onMatchRosterChange} required className={inputCls} data-testid="admin-match-roster">
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
              <div className="border-t border-white/10 pt-4 mt-4 space-y-3" data-testid="admin-match-players-section">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-[#D8CA82] block">
                    {t("admin.match.players")}
                  </label>
                  <p className="text-[11px] text-[#f7f7f7]/40 mt-1">
                    {t("admin.match.playersHint")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <select
                    value={selectedRosterPlayer}
                    onChange={(e) => setSelectedRosterPlayer(e.target.value)}
                    className={inputCls}
                    data-testid="admin-match-player-select"
                  >
                    <option value="">{t("admin.match.selectPlayer")}</option>
                    {availableRosterPlayers.map((m) => (
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
                {(form.players || []).length > 0 && (
                  <div className="flex flex-wrap gap-2" data-testid="admin-match-players-list">
                    {(form.players || []).map((p, pIndex) => (
                      <span
                        key={p.playerId || `${p.pseudo}-${pIndex}`}
                        className="inline-flex items-center gap-2 border border-white/15 bg-[#141414] px-3 py-1.5 text-xs text-[#f7f7f7]"
                        data-testid={`admin-match-player-chip-${p.playerId || pIndex}`}
                      >
                        {p.pseudo || "Joueur"}
                        <button
                          type="button"
                          onClick={() => removePlayerFromMatch(pIndex)}
                          className="text-red-300/80 hover:text-red-300"
                          aria-label={`${t("admin.match.removePlayer")} ${p.pseudo || "Joueur"}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <button type="submit" data-testid="admin-match-submit"
                className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
                {t("admin.match.add")}
              </button>
            </form>
            <div className="lg:col-span-7">
              {filteredMatches.length === 0 ? (
                <p className="text-[#f7f7f7]/40" data-testid="admin-matches-empty">{t("results.empty")}</p>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {pagedMatches.map((m) => (
                      <MatchCard
                        key={m.id}
                        match={m}
                        onDelete={(match) => setConfirmMatch(match)}
                        onEdit={editMatch}
                        onDuplicate={duplicateMatch}
                        onMarkUpcoming={markMatchUpcoming}
                      />
                    ))}
                  </div>
                  {filteredMatches.length > PAGE_SIZE && (
                    <div className="flex items-center justify-end gap-2 mt-4" data-testid="admin-matches-pagination">
                      <button onClick={() => setMatchPage((p) => Math.max(1, p - 1))} disabled={matchPage <= 1}
                        className="border border-white/15 text-[#f7f7f7]/60 px-3 py-1.5 text-xs uppercase tracking-widest disabled:opacity-30 hover:border-[#D8CA82] hover:text-[#D8CA82]">{t("admin.pagination.prev")}</button>
                      <span className="text-xs text-[#f7f7f7]/40">{t("admin.pagination.page")} {Math.min(matchPage, matchTotalPages)} / {matchTotalPages}</span>
                      <button onClick={() => setMatchPage((p) => Math.min(matchTotalPages, p + 1))} disabled={matchPage >= matchTotalPages}
                        className="border border-white/15 text-[#f7f7f7]/60 px-3 py-1.5 text-xs uppercase tracking-widest disabled:opacity-30 hover:border-[#D8CA82] hover:text-[#D8CA82]">{t("admin.pagination.next")}</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        </TabsContent>

        <TabsContent value="roster" className="mt-0"><AdminRoster /></TabsContent>
        <TabsContent value="positions" className="mt-0"><AdminPositions /></TabsContent>
        <TabsContent value="articles" className="mt-0"><AdminArticles /></TabsContent>
        <TabsContent value="media" className="mt-0"><AdminMedia /></TabsContent>
        <TabsContent value="events" className="mt-0"><AdminEvents /></TabsContent>
        <TabsContent value="competitions" className="mt-0"><AdminCompetitions /></TabsContent>
        <TabsContent value="campaigns" className="mt-0"><AdminCampaigns /></TabsContent>
        <TabsContent value="partners" className="mt-0"><AdminPartnerRequests /></TabsContent>
        <TabsContent value="newsletter" className="mt-0"><AdminNewsletter /></TabsContent>
        <TabsContent value="audit" className="mt-0"><AdminAudit /></TabsContent>
        </Tabs>
      </section>

      <AlertDialog open={!!confirmMatch} onOpenChange={(open) => !open && setConfirmMatch(null)}>
        <AlertDialogContent className="bg-[#1A1A1A] border border-[#D8CA82]/30 rounded-none text-[#f7f7f7] shadow-[0_0_40px_rgba(0,0,0,0.65)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display uppercase tracking-[0.25em] text-[#D8CA82] text-base">{t("admin.match.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-[#f7f7f7]/60 leading-relaxed">
              {t("admin.match.deleteDesc")} ({confirmMatch?.opponentName || "Adversaire"})
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel className="bg-transparent border border-white/20 text-[#f7f7f7]/70 hover:bg-white/5 hover:text-[#f7f7f7] uppercase tracking-widest text-xs px-5 py-2.5 rounded-none mt-0">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { const target = confirmMatch; setConfirmMatch(null); delMatch(target); }}
              className="bg-red-500/15 border border-red-400/50 text-red-200 hover:bg-red-500/25 hover:text-red-100 font-display font-bold uppercase tracking-widest text-xs px-5 py-2.5 rounded-none"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
