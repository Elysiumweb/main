import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Trash2, Pencil, ExternalLink } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const STATUSES = ["upcoming", "ongoing", "finished"];
const EMPTY = { name: "", officialUrl: "", season: "", status: "upcoming", position: "", notes: "" };

export const AdminCompetitions = () => {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    return onSnapshot(collection(db, "competitions"), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.season || "").localeCompare(b.season || "") || (a.name || "").localeCompare(b.name || ""));
      setItems(list);
    }, console.error);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error(t("common.error")); return; }
    if (form.officialUrl && !/^https?:\/\//.test(form.officialUrl)) { toast.error("URL invalide"); return; }
    try {
      if (editId) await updateDoc(doc(db, "competitions", editId), { ...form, name: form.name.trim() });
      else await addDoc(collection(db, "competitions"), { ...form, name: form.name.trim(), createdAt: serverTimestamp() });
      setForm(EMPTY); setEditId(null);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const edit = (c) => { setEditId(c.id); setForm({ name: c.name || "", officialUrl: c.officialUrl || "", season: c.season || "", status: c.status || "upcoming", position: c.position || "", notes: c.notes || "" }); };
  const del = async (id) => {
    try { await deleteDoc(doc(db, "competitions", id)); if (editId === id) { setEditId(null); setForm(EMPTY); } }
    catch { toast.error(t("common.error")); }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-10">
      <form onSubmit={submit} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6" data-testid="admin-competitions-form">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">
          {editId ? "Modifier" : t("admin.competitions.add")}
        </p>
        <input value={form.name} onChange={set("name")} placeholder={t("admin.competitions.name")} required className={inputCls} data-testid="admin-competition-name" />
        <div className="grid grid-cols-2 gap-4">
          <input value={form.season} onChange={set("season")} placeholder={t("admin.competitions.season")} className={inputCls} data-testid="admin-competition-season" />
          <select value={form.status} onChange={set("status")} className={inputCls} data-testid="admin-competition-status">
            {STATUSES.map((s) => <option key={s} value={s}>{t(`competitions.status.${s}`)}</option>)}
          </select>
        </div>
        <input value={form.position} onChange={set("position")} placeholder={t("admin.competitions.position")} className={inputCls} data-testid="admin-competition-position" />
        <input value={form.officialUrl} onChange={set("officialUrl")} placeholder={t("admin.competitions.link")} type="url" className={inputCls} data-testid="admin-competition-link" />
        <input value={form.notes} onChange={set("notes")} placeholder={t("admin.competitions.notes")} className={inputCls} data-testid="admin-competition-notes" />
        <button type="submit" data-testid="admin-competition-submit"
          className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
          {t("notes.save")}
        </button>
        {editId && (
          <button type="button" onClick={() => { setEditId(null); setForm(EMPTY); }} className="text-[#f7f7f7]/50 text-xs uppercase tracking-widest px-3">
            {t("common.cancel")}
          </button>
        )}
      </form>
      <div className="lg:col-span-7 space-y-2" data-testid="admin-competitions-list">
        {items.length === 0 && <p className="text-[#f7f7f7]/40">{t("competitions.empty")}</p>}
        {items.map((c) => (
          <div key={c.id} className="flex items-center gap-4 border border-white/10 bg-[#1A1A1A] px-4 py-3">
            <span className={`text-[9px] uppercase tracking-widest border px-1.5 py-0.5 shrink-0 ${c.status === "ongoing" ? "border-emerald-300/40 text-emerald-300" : c.status === "upcoming" ? "border-sky-300/40 text-sky-300" : "border-white/20 text-[#f7f7f7]/40"}`}>
              {t(`competitions.status.${c.status}`)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#f7f7f7] truncate">{c.name}</p>
              <p className="text-xs text-[#f7f7f7]/40">
                {c.season ? `${t("competitions.season")} ${c.season}` : ""}{c.position ? ` · ${t("competitions.position")} : ${c.position}` : ""}
              </p>
            </div>
            {c.officialUrl && (
              <a href={c.officialUrl} target="_blank" rel="noopener noreferrer" className="text-[#f7f7f7]/50 hover:text-[#D8CA82]" title={t("competitions.visit")} data-testid={`admin-competition-link-${c.id}`}>
                <ExternalLink size={15} />
              </a>
            )}
            <button onClick={() => edit(c)} className="text-[#D8CA82]/70 hover:text-[#D8CA82]" data-testid={`admin-competition-edit-${c.id}`}><Pencil size={15} /></button>
            <button onClick={() => del(c.id)} className="text-red-400/70 hover:text-red-400" data-testid={`admin-competition-delete-${c.id}`}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};
