import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Trash2, Link2, ExternalLink, UserX } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { GAMES } from "../../lib/constants";
import { useRosters } from "../../hooks/useRosters";
import { ConfirmAction } from "../ConfirmAction";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = { accountUid: "", pseudo: "", game: "EVA", roster: "", status: "player" };

/**
 * Fiches joueurs : l'admin crée une fiche reliée au compte du joueur
 * (ou sans compte pour les fiches vitrine), puis c'est le joueur qui
 * modifie le contenu de sa fiche depuis son profil. L'admin ne modifie
 * plus le contenu — création, liaison et suppression uniquement.
 */
export const AdminRoster = () => {
  const { t } = useLang();
  const { rostersForGame, gameHasRosters } = useRosters();
  const [members, setMembers] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [linkSelections, setLinkSelections] = useState({});
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "roster"), (s) => setMembers(s.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
    const u2 = onSnapshot(collection(db, "users"), (s) => setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
    return () => { u1(); u2(); };
  }, []);

  const linkedUids = useMemo(() => new Set(members.map((m) => m.uid).filter(Boolean)), [members]);
  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || "")),
    [users]
  );
  const linkableUsers = useMemo(() => sortedUsers.filter((u) => !linkedUids.has(u.id)), [sortedUsers, linkedUids]);

  const onAccountChange = (e) => {
    const accountUid = e.target.value;
    const account = usersById[accountUid];
    setForm((f) => ({
      ...f,
      accountUid,
      pseudo: account ? (account.displayName || account.email?.split("@")[0] || "") : f.pseudo,
      game: account?.game || f.game,
      roster: account?.roster || "",
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.accountUid && linkedUids.has(form.accountUid)) {
      toast.error(t("admin.roster.alreadyLinked"));
      return;
    }
    try {
      await addDoc(collection(db, "roster"), {
        uid: form.accountUid || null,
        pseudo: form.pseudo.trim(),
        game: form.game,
        roster: form.roster || null,
        status: form.status,
        createdAt: serverTimestamp(),
      });
      setForm(EMPTY);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const linkLegacy = async (memberId) => {
    const accountUid = linkSelections[memberId];
    if (!accountUid) return;
    try {
      await updateDoc(doc(db, "roster", memberId), { uid: accountUid });
      setLinkSelections((s) => ({ ...s, [memberId]: "" }));
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const del = async (id) => {
    try { await deleteDoc(doc(db, "roster", id)); toast.success(t("common.saved")); }
    catch { toast.error(t("common.error")); }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-10">
      <form onSubmit={submit} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6 h-fit" data-testid="admin-roster-form">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">
          {t("admin.roster.addMember")}
        </p>
        <div>
          <label htmlFor="admin-roster-account" className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("admin.roster.linkAccount")}</label>
          <select id="admin-roster-account" value={form.accountUid} onChange={onAccountChange} className={inputCls} data-testid="admin-roster-account">
            <option value="">{t("admin.roster.noAccount")}</option>
            {sortedUsers.map((u) => (
              <option key={u.id} value={u.id} disabled={linkedUids.has(u.id)}>
                {u.displayName || u.email} ({u.role || "visitor"}{u.game ? ` · ${u.game}` : ""}){linkedUids.has(u.id) ? ` — ${t("admin.roster.linked")}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <input value={form.pseudo} onChange={set("pseudo")} placeholder={t("login.pseudo")} required maxLength={60} className={inputCls} data-testid="admin-roster-pseudo" />
          <select value={form.status} onChange={set("status")} className={inputCls} data-testid="admin-roster-status">
            <option value="player">{t("team.status.player")}</option>
            <option value="sub">{t("team.status.sub")}</option>
            <option value="staff">{t("team.status.staff")}</option>
          </select>
          <select value={form.game} onChange={(e) => setForm((f) => ({ ...f, game: e.target.value, roster: "" }))} className={inputCls} data-testid="admin-roster-game">
            {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          {gameHasRosters(form.game) && (
            <select value={form.roster} onChange={set("roster")} className={inputCls} data-testid="admin-roster-roster">
              <option value="">— {t("admin.roster")} —</option>
              {rostersForGame(form.game).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
        </div>
        <button type="submit" data-testid="admin-roster-submit"
          className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
          {t("admin.roster.createCard")}
        </button>
        <p className="text-xs text-[#c8c8c8] leading-relaxed">{t("admin.roster.hint")}</p>
      </form>

      <div className="lg:col-span-7 space-y-2" data-testid="admin-roster-list">
        {members.length === 0 && <p className="text-[#c8c8c8]">{t("team.empty")}</p>}
        {members.map((m) => {
          const owner = m.uid ? usersById[m.uid] : null;
          return (
            <div key={m.id} className="border border-white/10 bg-[#1A1A1A] px-4 py-3 space-y-2" data-testid={`admin-roster-row-${m.id}`}>
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#f7f7f7]">{m.pseudo}</p>
                  <p className="text-xs text-[#c8c8c8]">{m.game}{m.roster ? ` · ${m.roster}` : ""} · {t(`team.status.${m.status || "player"}`)}</p>
                  {m.uid ? (
                    <p className="text-xs text-emerald-300/80 mt-0.5 flex items-center gap-1">
                      <Link2 size={11} aria-hidden="true" /> {owner ? (owner.displayName || owner.email) : m.uid}
                    </p>
                  ) : (
                    <p className="text-xs text-orange-300/80 mt-0.5 flex items-center gap-1">
                      <UserX size={11} aria-hidden="true" /> {t("admin.roster.unlinked")}
                    </p>
                  )}
                </div>
                <Link to={`/equipe/${m.id}`} target="_blank" title={t("admin.roster.viewCard")}
                  aria-label={`${t("admin.roster.viewCard")} — ${m.pseudo}`}
                  className="text-[#f7f7f7]/50 hover:text-[#D8CA82]" data-testid={`admin-roster-view-${m.id}`}>
                  <ExternalLink size={15} />
                </Link>
                <ConfirmAction
                  title={t("admin.roster.deleteTitle")}
                  description={t("admin.roster.deleteDesc")}
                  confirmLabel={t("common.delete")}
                  onConfirm={() => del(m.id)}
                >
                  <button className="text-red-400/70 hover:text-red-400" title={t("common.delete")}
                    aria-label={`${t("common.delete")} ${m.pseudo}`} data-testid={`admin-roster-delete-${m.id}`}>
                    <Trash2 size={15} />
                  </button>
                </ConfirmAction>
              </div>
              {!m.uid && (
                <div className="flex gap-2">
                  <select value={linkSelections[m.id] || ""} onChange={(e) => setLinkSelections((s) => ({ ...s, [m.id]: e.target.value }))}
                    className="flex-1 bg-[#111111] border border-white/20 px-2 py-1.5 text-xs text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]"
                    data-testid={`admin-roster-link-select-${m.id}`}>
                    <option value="">{t("admin.roster.selectAccount")}</option>
                    {linkableUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.displayName || u.email} ({u.role || "visitor"})</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => linkLegacy(m.id)} disabled={!linkSelections[m.id]}
                    data-testid={`admin-roster-link-btn-${m.id}`}
                    className="border border-[#D8CA82]/50 text-[#D8CA82] text-xs uppercase tracking-widest px-4 py-1.5 disabled:opacity-40 hover:bg-[#D8CA82]/10">
                    {t("admin.roster.link")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
