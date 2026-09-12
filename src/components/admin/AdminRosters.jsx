import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Trash2, Plus, Layers } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { GAMES, getGameColor } from "../../lib/constants";
import { ConfirmAction } from "../ConfirmAction";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

/**
 * Gestion des rosters par le compte officiel : création / suppression.
 * Les rosters alimentent les affectations des comptes, les fiches joueurs,
 * les matchs, le planning et les canaux du chat — sans toucher au code.
 */
export const AdminRosters = () => {
  const { t } = useLang();
  const [rosters, setRosters] = useState([]);
  const [users, setUsers] = useState([]);
  const [members, setMembers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [name, setName] = useState("");
  const [game, setGame] = useState(GAMES[0]);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "rosters"), (s) => setRosters(s.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
    const u2 = onSnapshot(collection(db, "users"), (s) => setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
    const u3 = onSnapshot(collection(db, "roster"), (s) => setMembers(s.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
    const u4 = onSnapshot(collection(db, "matches"), (s) => setMatches(s.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  const usageOf = (rosterName) => ({
    users: users.filter((u) => u.roster === rosterName).length,
    members: members.filter((m) => m.roster === rosterName).length,
    matches: matches.filter((m) => m.roster === rosterName).length,
  });

  // Noms déjà utilisés (comptes, fiches, matchs) mais sans définition roster :
  // proposés en création express pour faciliter la migration.
  const orphans = useMemo(() => {
    const defined = new Set(rosters.map((r) => `${r.game}||${(r.name || "").toLowerCase()}`));
    const seen = new Map();
    const collect = (rosterName, g) => {
      const clean = (rosterName || "").trim();
      if (!clean) return;
      const key = `${g || ""}||${clean.toLowerCase()}`;
      if (defined.has(key) || seen.has(key)) return;
      seen.set(key, { name: clean, game: g || null });
    };
    users.forEach((u) => collect(u.roster, u.game));
    members.forEach((m) => collect(m.roster, m.game));
    matches.forEach((m) => collect(m.roster, m.game));
    return [...seen.values()].filter((o) => o.game).sort((a, b) => a.game.localeCompare(b.game) || a.name.localeCompare(b.name));
  }, [rosters, users, members, matches]);

  const grouped = useMemo(() => {
    const map = {};
    GAMES.forEach((g) => { map[g] = []; });
    rosters.forEach((r) => {
      if (!map[r.game]) map[r.game] = [];
      map[r.game].push(r);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    return Object.entries(map);
  }, [rosters]);

  const create = async (e, preset = null) => {
    e?.preventDefault?.();
    const cleanName = (preset?.name ?? name).trim();
    const targetGame = preset?.game ?? game;
    if (!cleanName) return;
    const duplicate = rosters.some(
      (r) => r.game === targetGame && (r.name || "").toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicate) { toast.error(t("admin.rosters.duplicate")); return; }
    try {
      await addDoc(collection(db, "rosters"), { name: cleanName, game: targetGame, createdAt: serverTimestamp() });
      if (!preset) setName("");
      toast.success(t("admin.rosters.created"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const del = async (id) => {
    try { await deleteDoc(doc(db, "rosters", id)); toast.success(t("common.saved")); }
    catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  return (
    <div className="space-y-10">
      <div className="grid lg:grid-cols-12 gap-10">
        <form onSubmit={create} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6 h-fit" data-testid="admin-rosters-form">
          <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">{t("admin.rosters.add")}</p>
          <div>
            <label htmlFor="admin-roster-name" className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.rosters.name")}</label>
            <input id="admin-roster-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60}
              placeholder={t("admin.rosters.namePlaceholder")} className={inputCls} data-testid="admin-roster-name-input" />
          </div>
          <div>
            <label htmlFor="admin-roster-game" className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("common.game")}</label>
            <select id="admin-roster-game" value={game} onChange={(e) => setGame(e.target.value)} className={inputCls} data-testid="admin-roster-game-input">
              {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <button type="submit" data-testid="admin-roster-create-btn"
            className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 flex items-center gap-2 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
            <Plus size={14} aria-hidden="true" /> {t("admin.rosters.create")}
          </button>
          <p className="text-xs text-[#c8c8c8] leading-relaxed">{t("admin.rosters.hint")}</p>
        </form>

        <div className="lg:col-span-7 space-y-6" data-testid="admin-rosters-list">
          {rosters.length === 0 && <p className="text-[#c8c8c8]">{t("admin.rosters.empty")}</p>}
          {grouped.filter(([, list]) => list.length > 0).map(([g, list]) => (
            <div key={g}>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getGameColor(g) }} aria-hidden="true" />
                <p className="font-display text-xs uppercase tracking-[0.3em] text-[#f7f7f7]">{g}</p>
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <div className="space-y-2">
                {list.map((r) => {
                  const usage = usageOf(r.name);
                  const total = usage.users + usage.members + usage.matches;
                  return (
                    <div key={r.id} className="flex items-center gap-4 border border-white/10 bg-[#1A1A1A] px-4 py-3" data-testid={`admin-roster-row-${r.id}`}>
                      <Layers size={15} className="text-[#D8CA82] shrink-0" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#f7f7f7]">{r.name}</p>
                        <p className="text-xs text-[#c8c8c8]">
                          {total === 0
                            ? t("admin.rosters.unused")
                            : `${usage.users} ${t("admin.rosters.countAccounts")} · ${usage.members} ${t("admin.rosters.countCards")} · ${usage.matches} ${t("admin.rosters.countMatches")}`}
                        </p>
                      </div>
                      <ConfirmAction
                        title={t("admin.rosters.deleteTitle")}
                        description={total === 0 ? t("admin.rosters.deleteDesc") : t("admin.rosters.deleteDescUsed")}
                        confirmLabel={t("common.delete")}
                        onConfirm={() => del(r.id)}
                      >
                        <button className="text-red-400/70 hover:text-red-400" title={t("common.delete")} aria-label={`${t("common.delete")} ${r.name}`} data-testid={`admin-roster-delete-${r.id}`}>
                          <Trash2 size={15} />
                        </button>
                      </ConfirmAction>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {orphans.length > 0 && (
        <div className="border border-orange-300/30 bg-orange-300/5 p-6" data-testid="admin-rosters-orphans">
          <p className="font-display text-sm uppercase tracking-[0.3em] text-orange-200 mb-2">{t("admin.rosters.orphans")}</p>
          <p className="text-xs text-[#c8c8c8] mb-4 leading-relaxed">{t("admin.rosters.orphansHint")}</p>
          <div className="flex flex-wrap gap-2">
            {orphans.map((o) => (
              <button key={`${o.game}||${o.name}`} onClick={(e) => create(e, o)} data-testid={`admin-roster-adopt-${o.game}-${o.name}`}
                className="border border-orange-300/40 text-orange-200 text-xs uppercase tracking-widest px-3 py-2 flex items-center gap-2 hover:bg-orange-300/10">
                <Plus size={12} aria-hidden="true" /> {o.game} · {o.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
