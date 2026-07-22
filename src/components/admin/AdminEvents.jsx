import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = { title: "", type: "tournament", date: "", description: "", link: "" };
const TYPES = ["tournament", "training", "stream", "community"];

export const AdminEvents = () => {
  const { t } = useLang();
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    return onSnapshot(collection(db, "communityEvents"), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      setEvents(list);
    }, console.error);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (form.link && !/^https?:\/\/.+/.test(form.link)) { toast.error("URL invalide"); return; }
    try {
      await addDoc(collection(db, "communityEvents"), { ...form, createdAt: serverTimestamp() });
      setForm(EMPTY);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const del = async (id) => {
    try { await deleteDoc(doc(db, "communityEvents", id)); } catch { toast.error(t("common.error")); }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-10">
      <form onSubmit={submit} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6" data-testid="admin-events-form">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">Ajouter un événement communautaire</p>
        <input value={form.title} onChange={set("title")} placeholder="Titre" required className={inputCls} data-testid="admin-event-title" />
        <div className="grid grid-cols-2 gap-4">
          <select value={form.type} onChange={set("type")} className={inputCls} data-testid="admin-event-type">
            {TYPES.map((ty) => <option key={ty} value={ty}>{t(`cal.type.${ty}`)}</option>)}
          </select>
          <input type="datetime-local" value={form.date} onChange={set("date")} required className={inputCls} data-testid="admin-event-date" />
        </div>
        <input value={form.link} onChange={set("link")} placeholder="Lien (Twitch, inscription... optionnel)" className={inputCls} data-testid="admin-event-link" />
        <textarea value={form.description} onChange={set("description")} placeholder="Description" rows={3} className={inputCls} data-testid="admin-event-desc" />
        <button type="submit" data-testid="admin-event-submit"
          className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
          {t("notes.save")}
        </button>
      </form>
      <div className="lg:col-span-7 space-y-2" data-testid="admin-events-list">
        {events.length === 0 && <p className="text-[#f7f7f7]/40">{t("cal.empty")}</p>}
        {events.map((ev) => (
          <div key={ev.id} className="flex items-center gap-4 border border-white/10 bg-[#1A1A1A] px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#f7f7f7] truncate">{ev.title}</p>
              <p className="text-xs text-[#f7f7f7]/40">{t(`cal.type.${ev.type}`)} · {ev.date ? new Date(ev.date).toLocaleString("fr-FR") : ""}</p>
            </div>
            <button onClick={() => del(ev.id)} className="text-red-400/70 hover:text-red-400" data-testid={`admin-event-delete-${ev.id}`}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};
