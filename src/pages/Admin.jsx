import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Shield, Users, Trophy } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { GAMES, ROLES, OFFICIAL_UID } from "../lib/constants";
import { MatchCard } from "../components/MatchCard";
import { AdminRoster } from "../components/admin/AdminRoster";
import { AdminPositions } from "../components/admin/AdminPositions";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY_MATCH = { opponentName: "", opponentLogo: "", scoreUs: "", scoreThem: "", date: "", competition: "", game: "EVA", status: "finished", time: "", timezone: "Europe/Paris", platform: "", watchUrl: "", mapsText: "", mvp: "", vodUrl: "" };

export default function Admin() {
  const { isOfficial, loading } = useAuth();
  const { t } = useLang();
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [form, setForm] = useState(EMPTY_MATCH);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (!isOfficial) return;
    const u1 = onSnapshot(collection(db, "users"), (s) => setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
    const u2 = onSnapshot(collection(db, "matches"), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      setMatches(list);
    }, console.error);
    return () => { u1(); u2(); };
  }, [isOfficial]);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-[#f7f7f7]/40">{t("common.loading")}</div>;
  if (!isOfficial) return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <p className="text-[#f7f7f7]/50" data-testid="admin-denied">{t("player.noAccess")}</p>
    </div>
  );

  const setRole = async (uid, role) => {
    try { await updateDoc(doc(db, "users", uid), { role }); toast.success(t("common.saved")); }
    catch (e) { console.error(e); toast.error(t("common.error")); }
  };
  const setGame = async (uid, game) => {
    try { await updateDoc(doc(db, "users", uid), { game: game === "none" ? null : game }); toast.success(t("common.saved")); }
    catch (e) { console.error(e); toast.error(t("common.error")); }
  };

  const addMatch = async (e) => {
    e.preventDefault();
    try {
      const { mapsText, ...rest } = form;
      const maps = mapsText.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
        const [name, score = ""] = l.split("|").map((s) => s.trim());
        const m = score.match(/(\d+)\s*-\s*(\d+)/);
        return { name, us: m ? Number(m[1]) : null, them: m ? Number(m[2]) : null };
      });
      await addDoc(collection(db, "matches"), { ...rest, maps, createdAt: serverTimestamp() });
      setForm(EMPTY_MATCH);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const delMatch = async (id) => {
    try { await deleteDoc(doc(db, "matches", id)); toast.success(t("common.saved")); }
    catch (e) { console.error(e); toast.error(t("common.error")); }
  };

  return (
    <div className="min-h-[80vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative flex items-center gap-4">
          <Shield className="text-[#D8CA82]" size={32} />
          <h1 className="font-display font-black text-4xl sm:text-5xl text-[#f7f7f7] uppercase" data-testid="admin-title">{t("admin.title")}</h1>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
        <div className="flex gap-1 border-b border-white/10 mb-10 flex-wrap" data-testid="admin-tabs">
          {["users", "matches", "roster", "positions"].map((k) => (
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
                <select value={form.game} onChange={set("game")} className={inputCls} data-testid="admin-match-game">
                  {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.match.opponent")}</label>
                <input value={form.opponentName} onChange={set("opponentName")} required className={inputCls} data-testid="admin-match-opponent" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.match.logo")}</label>
                <input value={form.opponentLogo} onChange={set("opponentLogo")} placeholder="https://..." className={inputCls} data-testid="admin-match-logo" />
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
                  {matches.map((m) => <MatchCard key={m.id} match={m} onDelete={delMatch} />)}
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {tab === "roster" && <AdminRoster />}
        {tab === "positions" && <AdminPositions />}
      </section>
    </div>
  );
}
