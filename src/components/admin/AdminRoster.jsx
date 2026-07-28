import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { GAMES, ROSTERS } from "../../lib/constants";
import { ActionButton } from "../ui/action-button";
import { ConfirmDelete } from "../ConfirmDelete";
import { SkeletonList } from "../Skeletons";
import { BrandImage, RATIOS } from "../BrandImage";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = { pseudo: "", game: "EVA", roster: "", ingameRole: "", status: "player", photo: "", bio: "", statsText: "", x: "", twitch: "", instagram: "", youtube: "" };

export const AdminRoster = () => {
  const { t } = useLang();
  const [members, setMembers] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    return onSnapshot(collection(db, "roster"), (s) => setMembers(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => { console.error(e); setMembers([]); });
  }, []);

  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { x, twitch, instagram, youtube, ...rest } = form;
    const data = { ...rest, socials: { x, twitch, instagram, youtube } };
    try {
      if (editId) await updateDoc(doc(db, "roster", editId), data);
      else await addDoc(collection(db, "roster"), { ...data, createdAt: serverTimestamp() });
      setForm(EMPTY); setEditId(null);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
    setSaving(false);
  };

  const edit = (m) => {
    setEditId(m.id);
    setForm({ pseudo: m.pseudo || "", game: m.game || "EVA", roster: m.roster || "", ingameRole: m.ingameRole || "", status: m.status || "player", photo: m.photo || "", bio: m.bio || "", statsText: m.statsText || "", x: m.socials?.x || "", twitch: m.socials?.twitch || "", instagram: m.socials?.instagram || "", youtube: m.socials?.youtube || "" });
  };

  const del = async (id) => {
    await deleteDoc(doc(db, "roster", id));
    if (editId === id) { setEditId(null); setForm(EMPTY); }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-10">
      <form onSubmit={submit} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6" data-testid="admin-roster-form">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">{editId ? "Modifier" : "Ajouter"} un membre</p>
        <div className="grid grid-cols-2 gap-4">
          <input value={form.pseudo} onChange={set("pseudo")} placeholder="Pseudo" required className={inputCls} data-testid="admin-roster-pseudo" />
          <input value={form.ingameRole} onChange={set("ingameRole")} placeholder="Rôle in-game" className={inputCls} data-testid="admin-roster-role" />
          <select value={form.game} onChange={(e) => setForm((f) => ({ ...f, game: e.target.value, roster: "" }))} className={inputCls} data-testid="admin-roster-game">
            {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          {(ROSTERS[form.game] || []).length > 0 && (
            <select value={form.roster} onChange={set("roster")} className={inputCls} data-testid="admin-roster-roster">
              <option value="">— Roster —</option>
              {(ROSTERS[form.game] || []).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          <select value={form.status} onChange={set("status")} className={inputCls} data-testid="admin-roster-status">
            <option value="player">{t("team.status.player")}</option>
            <option value="sub">{t("team.status.sub")}</option>
            <option value="staff">{t("team.status.staff")}</option>
          </select>
        </div>
        <input value={form.photo} onChange={set("photo")} placeholder="Photo (URL)" className={inputCls} data-testid="admin-roster-photo" />
        <textarea value={form.bio} onChange={set("bio")} placeholder="Biographie" rows={3} className={inputCls} data-testid="admin-roster-bio" />
        <textarea value={form.statsText} onChange={set("statsText")} placeholder={"Statistiques (une par ligne : Ratio K/D | 1.35)"} rows={3} className={inputCls} data-testid="admin-roster-stats" />
        <div className="grid grid-cols-2 gap-4">
          <input value={form.x} onChange={set("x")} placeholder="X (URL)" className={inputCls} />
          <input value={form.twitch} onChange={set("twitch")} placeholder="Twitch (URL)" className={inputCls} />
          <input value={form.instagram} onChange={set("instagram")} placeholder="Instagram (URL)" className={inputCls} />
          <input value={form.youtube} onChange={set("youtube")} placeholder="YouTube (URL)" className={inputCls} />
        </div>
        <div className="flex flex-wrap gap-3">
          <ActionButton type="submit" variant="primary" size="md" loading={saving} loadingLabel="Enregistrement…"
            disabled={!form.pseudo.trim()} disabledReason="Le pseudo est obligatoire" data-testid="admin-roster-submit">
            {t("notes.save")}
          </ActionButton>
          {editId && (
            <ActionButton variant="secondary" size="md" onClick={() => { setEditId(null); setForm(EMPTY); }} data-testid="admin-roster-cancel">
              {t("common.cancel")}
            </ActionButton>
          )}
        </div>
      </form>
      <div className="lg:col-span-7 space-y-2" data-testid="admin-roster-list">
        {members === null ? (
          <SkeletonList count={5} testId="admin-roster-loading" label={t("common.loading")} />
        ) : members.length === 0 ? (
          <p className="text-[#c8c8c8]">{t("team.empty")}</p>
        ) : (
          members.map((m) => (
            <div key={m.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 border border-white/10 bg-[#1A1A1A] px-4 py-3">
              <BrandImage src={m.photo} alt="" ratio={RATIOS.square} className="w-12 shrink-0 border border-white/10" />
              <div className="flex-1 min-w-[140px]">
                <p className="text-sm font-semibold text-[#f7f7f7] break-words">{m.pseudo}</p>
                <p className="text-xs text-[#c8c8c8]">{m.game}{m.roster ? ` · ${m.roster}` : ""} · {m.ingameRole || "—"} · {t(`team.status.${m.status}`)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-auto">
                <ActionButton variant="secondary" size="sm" icon={Pencil} onClick={() => edit(m)} data-testid={`admin-roster-edit-${m.id}`}>
                  Modifier
                </ActionButton>
                <ConfirmDelete
                  testId={`admin-roster-delete-${m.id}`}
                  itemLabel={`le membre « ${m.pseudo} »`}
                  onConfirm={() => del(m.id)}
                  errorMessage={t("common.error")}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
