import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Trash2, Pencil } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { GAMES } from "../../lib/constants";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = { pseudo: "", game: "EVA", ingameRole: "", status: "player", photo: "", bio: "", statsText: "", x: "", twitch: "", instagram: "", youtube: "" };

export const AdminRoster = () => {
  const { t } = useLang();
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    return onSnapshot(collection(db, "roster"), (s) => setMembers(s.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const { x, twitch, instagram, youtube, ...rest } = form;
    const data = { ...rest, socials: { x, twitch, instagram, youtube } };
    try {
      if (editId) await updateDoc(doc(db, "roster", editId), data);
      else await addDoc(collection(db, "roster"), { ...data, createdAt: serverTimestamp() });
      setForm(EMPTY); setEditId(null);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const edit = (m) => {
    setEditId(m.id);
    setForm({ pseudo: m.pseudo || "", game: m.game || "EVA", ingameRole: m.ingameRole || "", status: m.status || "player", photo: m.photo || "", bio: m.bio || "", statsText: m.statsText || "", x: m.socials?.x || "", twitch: m.socials?.twitch || "", instagram: m.socials?.instagram || "", youtube: m.socials?.youtube || "" });
  };

  const del = async (id) => {
    try { await deleteDoc(doc(db, "roster", id)); if (editId === id) { setEditId(null); setForm(EMPTY); } }
    catch { toast.error(t("common.error")); }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-10">
      <form onSubmit={submit} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6" data-testid="admin-roster-form">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">{editId ? "Modifier" : "Ajouter"} un membre</p>
        <div className="grid grid-cols-2 gap-4">
          <input value={form.pseudo} onChange={set("pseudo")} placeholder="Pseudo" required className={inputCls} data-testid="admin-roster-pseudo" />
          <input value={form.ingameRole} onChange={set("ingameRole")} placeholder="Rôle in-game" className={inputCls} data-testid="admin-roster-role" />
          <select value={form.game} onChange={set("game")} className={inputCls} data-testid="admin-roster-game">
            {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
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
        <div className="flex gap-3">
          <button type="submit" data-testid="admin-roster-submit"
            className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
            {t("notes.save")}
          </button>
          {editId && (
            <button type="button" onClick={() => { setEditId(null); setForm(EMPTY); }} data-testid="admin-roster-cancel"
              className="border border-white/25 text-[#f7f7f7]/70 text-xs uppercase tracking-widest px-5">{t("common.cancel")}</button>
          )}
        </div>
      </form>
      <div className="lg:col-span-7 space-y-2" data-testid="admin-roster-list">
        {members.length === 0 && <p className="text-[#f7f7f7]/40">{t("team.empty")}</p>}
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-4 border border-white/10 bg-[#1A1A1A] px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#f7f7f7]">{m.pseudo}</p>
              <p className="text-xs text-[#f7f7f7]/40">{m.game} · {m.ingameRole || "—"} · {t(`team.status.${m.status}`)}</p>
            </div>
            <button onClick={() => edit(m)} className="text-[#D8CA82]/70 hover:text-[#D8CA82]" data-testid={`admin-roster-edit-${m.id}`}><Pencil size={15} /></button>
            <button onClick={() => del(m.id)} className="text-red-400/70 hover:text-red-400" data-testid={`admin-roster-delete-${m.id}`}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};
