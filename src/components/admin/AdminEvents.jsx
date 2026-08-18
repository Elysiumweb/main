import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Trash2, Pencil, Copy, Eye, EyeOff } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { fmtDate } from "../../lib/formatters";
import { ConfirmAction } from "../ConfirmAction";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = { title: "", type: "tournament", date: "", description: "", link: "", status: "published", order: 0 };
const TYPES = ["tournament", "training", "stream", "community"];

export const AdminEvents = () => {
  const { t, lang } = useLang();
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    return onSnapshot(collection(db, "communityEvents"), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || (a.date || "").localeCompare(b.date || ""));
      setEvents(list);
    }, console.error);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error(t("common.error")); return; }
    if (form.link && !/^https?:\/\/.+/.test(form.link)) { toast.error(t("admin.match.invalidUrl")); return; }
    try {
      const data = { ...form, title: form.title.trim(), order: Number(form.order) || 0 };
      if (editId) await updateDoc(doc(db, "communityEvents", editId), { ...data, updatedAt: serverTimestamp() });
      else await addDoc(collection(db, "communityEvents"), { ...data, createdAt: serverTimestamp() });
      setForm(EMPTY); setEditId(null);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const edit = (ev) => { setEditId(ev.id); setForm({ title: ev.title || "", type: ev.type || "tournament", date: ev.date || "", description: ev.description || "", link: ev.link || "", status: ev.status || "published", order: ev.order ?? 0 }); };
  const del = async (id) => { try { await deleteDoc(doc(db, "communityEvents", id)); if (editId===id) { setEditId(null); setForm(EMPTY);} } catch { toast.error(t("common.error")); } };
  const duplicate = async (ev) => { try { const { id, createdAt, ...rest } = ev; await addDoc(collection(db, "communityEvents"), { ...rest, title: `${rest.title} (copie)`, createdAt: serverTimestamp() }); toast.success("Événement dupliqué"); } catch { toast.error(t("common.error")); } };
  const toggleStatus = async (ev) => { try { await updateDoc(doc(db, "communityEvents", ev.id), { status: ev.status === "draft" ? "published" : "draft" }); } catch { toast.error(t("common.error")); } };

  return (
    <div className="grid lg:grid-cols-12 gap-10">
      <form onSubmit={submit} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6" data-testid="admin-events-form">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">{editId ? "Modifier l'événement" : t("admin.events.add")}</p>
        <input value={form.title} onChange={setF("title")} placeholder={t("admin.events.titlePlaceholder")} required className={inputCls} data-testid="admin-event-title" />
        <div className="grid grid-cols-2 gap-4">
          <select value={form.type} onChange={setF("type")} className={inputCls} data-testid="admin-event-type">{TYPES.map((ty) => <option key={ty} value={ty}>{t(`cal.type.${ty}`)}</option>)}</select>
          <input type="datetime-local" value={form.date} onChange={setF("date")} required className={inputCls} data-testid="admin-event-date" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <select value={form.status} onChange={setF("status")} className={inputCls} data-testid="admin-event-status"><option value="published">{t("admin.published")}</option><option value="draft">{t("notes.draft")}</option></select>
          <input type="number" value={form.order} onChange={setF("order")} placeholder="Ordre" className={inputCls} data-testid="admin-event-order" />
        </div>
        <input value={form.link} onChange={setF("link")} placeholder={t("admin.events.linkPlaceholder")} className={inputCls} data-testid="admin-event-link" />
        <textarea value={form.description} onChange={setF("description")} placeholder={t("admin.events.descPlaceholder")} rows={3} className={inputCls} data-testid="admin-event-desc" />
        <div className="flex gap-3">
          <button type="submit" data-testid="admin-event-submit" className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">{t("notes.save")}</button>
          {editId && <button type="button" onClick={() => { setEditId(null); setForm(EMPTY); }} className="text-[#f7f7f7]/50 text-xs uppercase tracking-widest px-3">{t("common.cancel")}</button>}
        </div>
      </form>
      <div className="lg:col-span-7 space-y-2" data-testid="admin-events-list">
        {events.length === 0 && <p className="text-[#f7f7f7]/40">{t("cal.empty")}</p>}
        {events.map((ev) => (
          <div key={ev.id} className="flex items-center gap-3 border border-white/10 bg-[#1A1A1A] px-4 py-3">
            <span className={`text-[9px] uppercase tracking-widest border px-1.5 py-0.5 ${ev.status==="draft"?"border-orange-300/40 text-orange-300":"border-emerald-300/30 text-emerald-300"}`}>{ev.status==="draft"?t("notes.draft"):t("admin.published")}</span>
            <span className="text-[9px] border border-white/10 text-[#f7f7f7]/40 px-1">{ev.order ?? 0}</span>
            <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-[#f7f7f7] truncate">{ev.title}</p><p className="text-xs text-[#f7f7f7]/40">{t(`cal.type.${ev.type}`)} · {ev.date ? fmtDate(ev.date, lang, { hour: "2-digit", minute: "2-digit" }) : ""}</p></div>
            <button onClick={()=>toggleStatus(ev)} className="text-[#f7f7f7]/50 hover:text-[#D8CA82]">{ev.status==="draft"?<Eye size={15}/>:<EyeOff size={15}/>}</button>
            <button onClick={()=>duplicate(ev)} title="Dupliquer" className="text-[#f7f7f7]/50 hover:text-[#D8CA82]"><Copy size={15}/></button>
            <button onClick={()=>edit(ev)} className="text-[#D8CA82]/70 hover:text-[#D8CA82]"><Pencil size={15}/></button>
            <ConfirmAction title="Supprimer cet événement ?" description="Confirmation de suppression." confirmLabel={t("common.delete")} onConfirm={()=>del(ev.id)}><button className="text-red-400/70 hover:text-red-400" data-testid={`admin-event-delete-${ev.id}`}><Trash2 size={15} /></button></ConfirmAction>
          </div>
        ))}
      </div>
    </div>
  );
};
