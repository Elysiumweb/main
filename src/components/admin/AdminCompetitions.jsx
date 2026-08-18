import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Trash2, Pencil, ExternalLink, Trophy } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { GAMES, ROLES, ROOSTERS } from "../../lib/constants";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const STATUSES = ["upcoming", "ongoing", "finished"];
const LEVELS = ["local","regional","national","international","major"];
const EMPTY = { name: "", officialUrl: "", bracketUrl: "", season: "", status: "upcoming", position: "", notes: "", game: "EVA", roster: "", organizer: "", region: "", level: "national", prizePool: "", startDate: "", endDate: "", format: "" };

export const AdminCompetitions = () => {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const rosterOptions = ROOSTERS[form.game] || [];

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
    if (form.bracketUrl && !/^https?:\/\//.test(form.bracketUrl)) { toast.error("URL bracket invalide"); return; }
    try {
      const payload = { ...form, name: form.name.trim() };
      if (editId) await updateDoc(doc(db, "competitions", editId), payload);
      else await addDoc(collection(db, "competitions"), { ...payload, createdAt: serverTimestamp() });
      setForm(EMPTY); setEditId(null);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const edit = (c) => { setEditId(c.id); setForm({ name: c.name || "", officialUrl: c.officialUrl || "", bracketUrl: c.bracketUrl || "", season: c.season || "", status: c.status || "upcoming", position: c.position || "", notes: c.notes || "", game: c.game || "EVA", roster: c.roster || "", organizer: c.organizer || "", region: c.region || "", level: c.level || "national", prizePool: c.prizePool || "", startDate: c.startDate || "", endDate: c.endDate || "", format: c.format || "" }); };

  const del = async (id) => {
    try { await deleteDoc(doc(db, "competitions", id)); if (editId === id) { setEditId(null); setForm(EMPTY); } }
    catch { toast.error(t("common.error")); }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-10">
      <form onSubmit={submit} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6" data-testid="admin-competitions-form">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">{editId ? "Modifier" : t("admin.competitions.add")}</p>
        <input value={form.name} onChange={setF("name")} placeholder={t("admin.competitions.name")} required className={inputCls} data-testid="admin-competition-name" />
        <div className="grid grid-cols-2 gap-4">
          <select value={form.game} onChange={(e)=> setForm((f)=>({...f, game:e.target.value, roster:""}))} className={inputCls} data-testid="admin-competition-game">{["EVA","Rocket League","Valorant"].map((g)=><option key={g} value={g}>{g}</option>)}</select>
          {rosterOptions.length>0 ? <select value={form.roster} onChange={setF("roster")} className={inputCls} data-testid="admin-competition-roster"><option value="">Roster — tous</option>{rosterOptions.map((r)=><option key={r} value={r}>{r}</option>)}</select> : <input value={form.format} onChange={setF("format")} placeholder="Format (ex: BO3, ligue)" className={inputCls} />}
        </div>
        {rosterOptions.length>0 && <input value={form.format} onChange={setF("format")} placeholder="Format (BO3, groupes, bracket)" className={inputCls} data-testid="admin-competition-format" />}
        <div className="grid grid-cols-2 gap-4">
          <input value={form.season} onChange={setF("season")} placeholder={t("admin.competitions.season")} className={inputCls} data-testid="admin-competition-season" />
          <select value={form.status} onChange={setF("status")} className={inputCls} data-testid="admin-competition-status">{STATUSES.map((s) => <option key={s} value={s}>{t(`competitions.status.${s}`)}</option>)}</select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <input value={form.organizer} onChange={setF("organizer")} placeholder="Organisateur" className={inputCls} data-testid="admin-competition-organizer" />
          <input value={form.region} onChange={setF("region")} placeholder="Région" className={inputCls} data-testid="admin-competition-region" />
          <select value={form.level} onChange={setF("level")} className={inputCls} data-testid="admin-competition-level">{LEVELS.map((l)=><option key={l} value={l}>{l}</option>)}</select>
          <input value={form.prizePool} onChange={setF("prizePool")} placeholder="Prize pool (ex: 5000€)" className={inputCls} data-testid="admin-competition-prize" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <input type="date" value={form.startDate} onChange={setF("startDate")} className={inputCls} data-testid="admin-competition-start" />
          <input type="date" value={form.endDate} onChange={setF("endDate")} className={inputCls} data-testid="admin-competition-end" />
        </div>
        <input value={form.position} onChange={setF("position")} placeholder={t("admin.competitions.position")} className={inputCls} data-testid="admin-competition-position" />
        <input value={form.officialUrl} onChange={setF("officialUrl")} placeholder={t("admin.competitions.link")} type="url" className={inputCls} data-testid="admin-competition-link" />
        <input value={form.bracketUrl} onChange={setF("bracketUrl")} placeholder="Lien bracket (URL)" className={inputCls} data-testid="admin-competition-bracket" />
        <textarea value={form.notes} onChange={setF("notes")} placeholder={t("admin.competitions.notes")} rows={2} className={inputCls} data-testid="admin-competition-notes" />
        <button type="submit" data-testid="admin-competition-submit" className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">{t("notes.save")}</button>
        {editId && <button type="button" onClick={() => { setEditId(null); setForm(EMPTY); }} className="text-[#f7f7f7]/50 text-xs uppercase tracking-widest px-3">{t("common.cancel")}</button>}
      </form>
      <div className="lg:col-span-7 space-y-2" data-testid="admin-competitions-list">
        {items.length === 0 && <p className="text-[#f7f7f7]/40">{t("competitions.empty")}</p>}
        {items.map((c) => (
          <div key={c.id} className="flex items-center gap-4 border border-white/10 bg-[#1A1A1A] px-4 py-3">
            <span className={`text-[9px] uppercase tracking-widest border px-1.5 py-0.5 shrink-0 ${c.status === "ongoing" ? "border-emerald-300/40 text-emerald-300" : c.status === "upcoming" ? "border-sky-300/40 text-sky-300" : "border-white/20 text-[#f7f7f7]/40"}`}>{t(`competitions.status.${c.status}`)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#f7f7f7] truncate flex items-center gap-2">{c.name} {c.game && <span className="text-[10px] text-[#D8CA82] border border-[#D8CA82]/20 px-1">{c.game}{c.roster?` · ${c.roster}`:""}</span>}</p>
              <p className="text-xs text-[#f7f7f7]/40">{c.season ? `${t("competitions.season")} ${c.season}` : ""}{c.position ? ` · ${t("competitions.position")} : ${c.position}` : ""} {c.level ? `· ${c.level}` : ""} {c.prizePool ? `· ${c.prizePool}` : ""}</p>
            </div>
            {c.bracketUrl && <a href={c.bracketUrl} target="_blank" rel="noopener noreferrer" className="text-[#f7f7f7]/50 hover:text-[#D8CA82]"><Trophy size={15}/></a>}
            {c.officialUrl && <a href={c.officialUrl} target="_blank" rel="noopener noreferrer" className="text-[#f7f7f7]/50 hover:text-[#D8CA82]"><ExternalLink size={15}/></a>}
            <button onClick={() => edit(c)} className="text-[#D8CA82]/70 hover:text-[#D8CA82]" data-testid={`admin-competition-edit-${c.id}`}><Pencil size={15} /></button>
            <button onClick={() => del(c.id)} className="text-red-400/70 hover:text-red-400" data-testid={`admin-competition-delete-${c.id}`}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};
