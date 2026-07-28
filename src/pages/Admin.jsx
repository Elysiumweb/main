import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Shield, Users, Trophy } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { GAMES, ROLES, ROSTERS, OFFICIAL_UID } from "../lib/constants";
import { MatchCard } from "../components/MatchCard";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { AdminRoster } from "../components/admin/AdminRoster";
import { AdminPositions } from "../components/admin/AdminPositions";
import { AdminArticles } from "../components/admin/AdminArticles";
import { AdminMedia } from "../components/admin/AdminMedia";
import { AdminEvents } from "../components/admin/AdminEvents";
import { ResponsiveTable } from "../components/ResponsiveTable";
import { Pagination, usePagination } from "../components/Pagination";
import { SkeletonTable, SkeletonGrid, SkeletonMatchCard } from "../components/Skeletons";
import { ActionButton } from "../components/ui/action-button";

const isUrl = (s) => !s || /^https?:\/\/.+/.test(s);

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

/* Un select désactivé reste identifiable : surface grise + bordure pointillée. */
const selectCls = (disabled) =>
  `w-full sm:w-auto min-h-[40px] px-2 py-1.5 text-sm border focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D8CA82] ${
    disabled
      ? "bg-[#232323] text-[#9a9a9a] border-dashed border-white/25 cursor-not-allowed"
      : "bg-[#111111] text-[#f7f7f7] border-white/20 focus:border-[#D8CA82]"
  }`;
const EMPTY_MATCH = { opponentName: "", opponentLogo: "", scoreUs: "", scoreThem: "", date: "", competition: "", game: "EVA", status: "finished", time: "", timezone: "Europe/Paris", platform: "", watchUrl: "", mapsText: "", mvp: "", vodUrl: "" };

export default function Admin() {
  const { isOfficial, role, loading } = useAuth();
  const { t } = useLang();
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState(null);
  const [matches, setMatches] = useState(null);
  const [form, setForm] = useState(EMPTY_MATCH);
  const [editMatchId, setEditMatchId] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const isBureau = isOfficial || role === "bureau";
  const isStaff = isBureau || role === "manager";
  const allowed = {
    users: isOfficial, matches: isOfficial, roster: isBureau,
    articles: isBureau, media: isBureau, positions: isStaff, events: isStaff,
  };
  const tabs = ["users", "matches", "roster", "articles", "media", "positions", "events"].filter((k) => allowed[k]);

  useEffect(() => {
    if (tabs.length && !tabs.includes(tab)) setTab(tabs[0]);
  }, [role, isOfficial]); // eslint-disable-line

  useEffect(() => {
    if (!isOfficial) return;
    const u1 = onSnapshot(collection(db, "users"), (s) => setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => { console.error(e); setUsers([]); });
    const u2 = onSnapshot(collection(db, "matches"), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      setMatches(list);
    }, (e) => { console.error(e); setMatches([]); });
    return () => { u1(); u2(); };
  }, [isOfficial]);

  // Hooks de pagination — appelés avant tout retour anticipé
  const usersPager = usePagination(users || [], 15, "admin-users");
  const matchesPager = usePagination(matches || [], 8, "admin-matches");

  if (loading) return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
      <SkeletonTable rows={6} cols={5} testId="admin-loading" label={t("common.loading")} />
    </div>
  );
  if (!isStaff) return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <p className="text-[#c8c8c8]" data-testid="admin-denied">{t("player.noAccess")}</p>
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

  const addMatch = async (e) => {
    e.preventDefault();
    if (!isUrl(form.opponentLogo) || !isUrl(form.watchUrl) || !isUrl(form.vodUrl)) {
      toast.error("URL invalide (doit commencer par http:// ou https://)");
      return;
    }
    try {
      const { mapsText, ...rest } = form;
      const maps = mapsText.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
        const [name, score = ""] = l.split("|").map((s) => s.trim());
        const m = score.match(/(\d+)\s*-\s*(\d+)/);
        return { name, us: m ? Number(m[1]) : null, them: m ? Number(m[2]) : null };
      });
      if (editMatchId) await updateDoc(doc(db, "matches", editMatchId), { ...rest, maps });
      else await addDoc(collection(db, "matches"), { ...rest, maps, createdAt: serverTimestamp() });
      setForm(EMPTY_MATCH); setEditMatchId(null);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const editMatch = (m) => {
    setEditMatchId(m.id);
    setForm({
      opponentName: m.opponentName || "", opponentLogo: m.opponentLogo || "", scoreUs: m.scoreUs ?? "", scoreThem: m.scoreThem ?? "",
      date: m.date || "", competition: m.competition || "", game: m.game || "EVA", status: m.status || "finished",
      time: m.time || "", timezone: m.timezone || "Europe/Paris", platform: m.platform || "", watchUrl: m.watchUrl || "",
      mapsText: (m.maps || []).map((x) => `${x.name} | ${x.us ?? ""}-${x.them ?? ""}`).join("\n"), mvp: m.mvp || "", vodUrl: m.vodUrl || "",
    });
  };

  const matchList = matches || [];
  const opponents = [...new Map(matchList.filter((m) => m.opponentName).map((m) => [m.opponentName, m])).values()];

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
        <div className="flex gap-1 border-b border-white/10 mb-10 flex-wrap" data-testid="admin-tabs" role="tablist" aria-label={t("admin.title")}>
          {tabs.map((k) => (
            <button key={k} onClick={() => setTab(k)} data-testid={`admin-tab-${k}`}
              role="tab" aria-selected={tab === k}
              className={`px-5 py-3 min-h-[44px] text-xs uppercase tracking-[0.25em] border-b-2 -mb-px transition-colors motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#D8CA82] ${tab === k ? "border-[#D8CA82] text-[#D8CA82]" : "border-transparent text-[#c8c8c8] hover:text-[#f7f7f7]"}`}>
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
          {users === null ? (
            <SkeletonTable rows={6} cols={5} testId="admin-users-loading" label={t("common.loading")} />
          ) : (
            <>
              <ResponsiveTable
                testId="admin-users-table"
                caption={t("admin.users")}
                rows={usersPager.items}
                rowTestId={(u) => `admin-user-row-${u.id}`}
                emptyLabel={t("admin.users.sub")}
                columns={[
                  {
                    key: "member",
                    header: "Membre",
                    priority: "primary",
                    cell: (u) => (
                      <span className="font-semibold text-[#f7f7f7] break-words">
                        {u.displayName}
                        {u.id === OFFICIAL_UID && (
                          <span className="text-[10px] text-[#D8CA82] border border-[#D8CA82]/40 px-1.5 py-0.5 ml-2 uppercase">Officiel</span>
                        )}
                      </span>
                    ),
                  },
                  {
                    key: "email",
                    header: "Email",
                    cell: (u) => <span className="text-[#c8c8c8] break-all">{u.email}</span>,
                  },
                  {
                    key: "role",
                    header: t("admin.role"),
                    cell: (u) => (
                      <select value={u.role || "visitor"} onChange={(e) => setRole(u.id, e.target.value)} disabled={u.id === OFFICIAL_UID}
                        data-testid={`admin-role-select-${u.id}`}
                        aria-label={`${t("admin.role")} — ${u.displayName || u.email}`}
                        title={u.id === OFFICIAL_UID ? "Le compte officiel ne peut pas changer de rôle" : undefined}
                        className={selectCls(u.id === OFFICIAL_UID)}>
                        {ROLES.map((r) => <option key={r} value={r}>{t(`admin.role.${r}`)}</option>)}
                      </select>
                    ),
                  },
                  {
                    key: "game",
                    header: t("admin.game"),
                    cell: (u) => (
                      <select value={u.game || "none"} onChange={(e) => setGame(u.id, e.target.value)}
                        data-testid={`admin-game-select-${u.id}`}
                        aria-label={`${t("admin.game")} — ${u.displayName || u.email}`}
                        className={selectCls(false)}>
                        <option value="none">—</option>
                        {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                    ),
                  },
                  {
                    key: "roster",
                    header: t("admin.roster"),
                    cell: (u) =>
                      (ROSTERS[u.game] || []).length > 0 ? (
                        <select value={u.roster || "none"} onChange={(e) => setRoster(u.id, e.target.value)}
                          data-testid={`admin-roster-select-${u.id}`}
                          aria-label={`${t("admin.roster")} — ${u.displayName || u.email}`}
                          className={selectCls(false)}>
                          <option value="none">{t("admin.roster.none")}</option>
                          {(ROSTERS[u.game] || []).map((r) => <option key={r} value={r}>{t(`admin.roster.${r.toLowerCase()}`)}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs text-[#a0a0a0]">—</span>
                      ),
                  },
                ]}
              />
              <Pagination {...usersPager} testId="admin-users-pagination" label="membres" />
            </>
          )}
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
                <select value={form.game} onChange={set("game")} className={inputCls} data-testid="admin-match-game">
                  {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
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
                  </select>
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
              {form.status === "upcoming" && (
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.match.watch")}</label>
                  <input value={form.watchUrl} onChange={set("watchUrl")} placeholder="https://twitch.tv/..." className={inputCls} data-testid="admin-match-watch" />
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
              <div className="flex flex-wrap gap-3">
                <ActionButton type="submit" variant="primary" size="md" data-testid="admin-match-submit">
                  {editMatchId ? t("notes.save") : t("admin.match.add")}
                </ActionButton>
                {editMatchId && (
                  <ActionButton variant="secondary" size="md" onClick={() => { setEditMatchId(null); setForm(EMPTY_MATCH); }} data-testid="admin-match-cancel">
                    {t("common.cancel")}
                  </ActionButton>
                )}
              </div>
            </form>
            <div className="lg:col-span-7">
              {matches === null ? (
                <SkeletonGrid count={4} Card={SkeletonMatchCard} className="grid sm:grid-cols-2 gap-4" testId="admin-matches-loading" label={t("common.loading")} />
              ) : matchList.length === 0 ? (
                <p className="text-[#c8c8c8]" data-testid="admin-matches-empty">{t("results.empty")}</p>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {matchesPager.items.map((m) => <MatchCard key={m.id} match={m} onDelete={delMatch} onEdit={editMatch} />)}
                  </div>
                  <Pagination {...matchesPager} testId="admin-matches-pagination" label="matchs" />
                </>
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
      </section>
    </div>
  );
}
