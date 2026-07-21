import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Trash2, Pencil } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { GAMES } from "../../lib/constants";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = { title: "", game: "EVA", prerequisites: "", availability: "", processText: "", deadline: "", open: "true" };

export const AdminPositions = () => {
  const { t } = useLang();
  const [positions, setPositions] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    return onSnapshot(collection(db, "positions"), (s) => setPositions(s.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const data = { ...form, open: form.open === "true" };
    try {
      if (editId) await updateDoc(doc(db, "positions", editId), data);
      else await addDoc(collection(db, "positions"), { ...data, createdAt: serverTimestamp() });
      setForm(EMPTY); setEditId(null);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const edit = (p) => {
    setEditId(p.id);
    setForm({ title: p.title || "", game: p.game || "EVA", prerequisites: p.prerequisites || "", availability: p.availability || "", processText: p.processText || "", deadline: p.deadline || "", open: String(p.open !== false) });
  };

  const del = async (id) => {
    try { await deleteDoc(doc(db, "positions", id)); if (editId === id) { setEditId(null); setForm(EMPTY); } }
    catch { toast.error(t("common.error")); }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-10">
      <form onSubmit={submit} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6" data-testid="admin-positions-form">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">{editId ? "Modifier" : "Ajouter"} un poste</p>
        <input value={form.title} onChange={set("title")} placeholder="Intitulé du poste (ex: Joueur EVA — Support)" required className={inputCls} data-testid="admin-position-title" />
        <div className="grid grid-cols-2 gap-4">
          <select value={form.game} onChange={set("game")} className={inputCls} data-testid="admin-position-game">
            {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={form.open} onChange={set("open")} className={inputCls} data-testid="admin-position-open">
            <option value="true">{t("status.open")}</option>
            <option value="false">{t("status.closed")}</option>
          </select>
        </div>
        <textarea value={form.prerequisites} onChange={set("prerequisites")} placeholder={t("recruit.prereq")} rows={2} className={inputCls} data-testid="admin-position-prereq" />
        <input value={form.availability} onChange={set("availability")} placeholder={t("recruit.avail")} className={inputCls} data-testid="admin-position-avail" />
        <textarea value={form.processText} onChange={set("processText")} placeholder={"Processus (une étape par ligne)"} rows={3} className={inputCls} data-testid="admin-position-process" />
        <div>
          <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">{t("recruit.deadline")}</label>
          <input type="date" value={form.deadline} onChange={set("deadline")} className={inputCls} data-testid="admin-position-deadline" />
        </div>
        <div className="flex gap-3">
          <button type="submit" data-testid="admin-position-submit"
            className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
            {t("notes.save")}
          </button>
          {editId && (
            <button type="button" onClick={() => { setEditId(null); setForm(EMPTY); }} data-testid="admin-position-cancel"
              className="border border-white/25 text-[#f7f7f7]/70 text-xs uppercase tracking-widest px-5">{t("common.cancel")}</button>
          )}
        </div>
      </form>
      <div className="lg:col-span-7 space-y-2" data-testid="admin-positions-list">
        {positions.length === 0 && <p className="text-[#f7f7f7]/40">{t("recruit.positions.empty")}</p>}
        {positions.map((p) => (
          <div key={p.id} className="flex items-center gap-4 border border-white/10 bg-[#1A1A1A] px-4 py-3">
            <span className={`text-[10px] uppercase tracking-widest border px-2 py-0.5 ${p.open !== false ? "text-emerald-300 border-emerald-300/40" : "text-[#f7f7f7]/40 border-white/20"}`}>
              {p.open !== false ? t("status.open") : t("status.closed")}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#f7f7f7] truncate">{p.title}</p>
              <p className="text-xs text-[#f7f7f7]/40">{p.game}{p.deadline ? ` · ${t("recruit.deadline")}: ${p.deadline}` : ""}</p>
            </div>
            <button onClick={() => edit(p)} className="text-[#D8CA82]/70 hover:text-[#D8CA82]" data-testid={`admin-position-edit-${p.id}`}><Pencil size={15} /></button>
            <button onClick={() => del(p.id)} className="text-red-400/70 hover:text-red-400" data-testid={`admin-position-delete-${p.id}`}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};
