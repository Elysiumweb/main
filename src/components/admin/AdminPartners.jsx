import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Trash2, Pencil, ExternalLink, Eye, Archive, RotateCcw } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { ImageUpload } from "../ImageUpload";
import { logAdminAction } from "../../lib/notify";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = { name: "", logoUrl: "", website: "", tier: "bronze", level: "official", order: 0, active: true, startDate: "", endDate: "", description: "" };
const TIERS = ["gold", "silver", "bronze"];
const LEVELS = ["premium", "official", "technical", "media"];

const isUrl = (s) => !s || /^https?:\/\/.+/.test(s);

export const AdminPartners = () => {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [preview, setPreview] = useState(null);
  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const [filterActive, setFilterActive] = useState("all");

  useEffect(() => {
    return onSnapshot(collection(db, "partners"), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      setItems(list);
    }, console.error);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error(t("common.error")); return; }
    if (!isUrl(form.website) || !isUrl(form.logoUrl)) { toast.error("URL invalide"); return; }
    try {
      const data = { ...form, name: form.name.trim(), order: Number(form.order) || 0, active: !!form.active };
      if (editId) await updateDoc(doc(db, "partners", editId), data);
      else await addDoc(collection(db, "partners"), { ...data, createdAt: serverTimestamp() });
      setForm(EMPTY); setEditId(null); setPreview(null);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const edit = (p) => { setEditId(p.id); setForm({ name: p.name || "", logoUrl: p.logoUrl || "", website: p.website || "", tier: p.tier || "bronze", level: p.level || "official", order: p.order ?? 0, active: p.active !== false, startDate: p.startDate || "", endDate: p.endDate || "", description: p.description || "" }); setPreview(p); };
  const del = async (id) => { // archive rather than delete immediate
    const target = items.find((i) => i.id === id);
    try {
      // archive: set active false + archivedAt
      await updateDoc(doc(db, "partners", id), { active: false, archived: true, archivedAt: serverTimestamp() });
      toast.success("Partenaire archivé");
    } catch { toast.error(t("common.error")); }
  };
  const hardDelete = async (id) => {
    try { await deleteDoc(doc(db, "partners", id)); toast.success("Supprimé"); } catch { toast.error(t("common.error")); }
  };
  const restore = async (id) => {
    try { await updateDoc(doc(db, "partners", id), { active: true, archived: false }); toast.success("Restauré"); } catch { toast.error(t("common.error")); }
  };
  const toggleActive = async (p) => {
    try { await updateDoc(doc(db, "partners", p.id), { active: !p.active }); } catch { toast.error(t("common.error")); }
  };

  const filtered = items.filter((p) => {
    if (filterActive === "active") return p.active && !p.archived;
    if (filterActive === "archived") return p.archived;
    return true;
  });

  return (
    <div className="grid lg:grid-cols-12 gap-10">
      <form onSubmit={submit} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6" data-testid="admin-partners-form">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">{editId ? "Modifier partenaire" : "Ajouter un partenaire"}</p>
        <input value={form.name} onChange={setField("name")} placeholder="Nom du partenaire" required className={inputCls} data-testid="admin-partner-name" />
        <div>
          <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/60 block mb-2">Logo</label>
          <ImageUpload value={form.logoUrl} onChange={(url) => setForm((f) => ({ ...f, logoUrl: url }))} folder="partners" maxWidth={800} testId="admin-partner-logo" />
          <input value={form.logoUrl} onChange={setField("logoUrl")} placeholder="ou URL logo https://..." className={`${inputCls} mt-2`} data-testid="admin-partner-logo-url" />
          {form.logoUrl && /^https?:\/\//.test(form.logoUrl) && <img src={form.logoUrl} alt="" className="h-12 mt-2 object-contain border border-white/10 p-1" onError={(e)=>e.target.style.display="none"} />}
        </div>
        <input value={form.website} onChange={setField("website")} placeholder="Site web https://..." className={inputCls} data-testid="admin-partner-website" />
        <div className="grid grid-cols-2 gap-4">
          <select value={form.tier} onChange={setField("tier")} className={inputCls} data-testid="admin-partner-tier">{TIERS.map((ti) => <option key={ti} value={ti}>{ti}</option>)}</select>
          <select value={form.level} onChange={setField("level")} className={inputCls} data-testid="admin-partner-level">{LEVELS.map((lv) => <option key={lv} value={lv}>{lv}</option>)}</select>
          <input type="number" value={form.order} onChange={setField("order")} placeholder="Ordre" className={inputCls} data-testid="admin-partner-order" />
          <label className="flex items-center gap-2 text-xs text-[#f7f7f7]/70 border border-white/15 px-3 py-2 bg-[#111111]"><input type="checkbox" checked={!!form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="accent-[#D8CA82]" /> Actif</label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <input type="date" value={form.startDate} onChange={setField("startDate")} className={inputCls} data-testid="admin-partner-start" />
          <input type="date" value={form.endDate} onChange={setField("endDate")} className={inputCls} data-testid="admin-partner-end" />
        </div>
        <textarea value={form.description} onChange={setField("description")} placeholder="Description / notes contrat" rows={3} className={inputCls} data-testid="admin-partner-desc" />
        <div className="flex gap-3">
          <button type="submit" data-testid="admin-partner-submit" className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)]">{t("notes.save")}</button>
          {editId && <button type="button" onClick={() => { setEditId(null); setForm(EMPTY); setPreview(null); }} className="text-[#f7f7f7]/50 text-xs uppercase tracking-widest px-3">{t("common.cancel")}</button>}
          <button type="button" onClick={() => setPreview(form)} className="border border-white/20 text-[#f7f7f7]/60 text-xs uppercase tracking-widest px-4 py-2 flex items-center gap-1.5"><Eye size={12}/> Aperçu</button>
        </div>
        {preview && (
          <div className="border border-[#D8CA82]/30 bg-[#111111] p-4 mt-4" data-testid="admin-partner-preview">
            <p className="text-[10px] uppercase tracking-widest text-[#D8CA82] mb-2">Aperçu</p>
            <div className="flex items-center gap-3">
              {preview.logoUrl ? <img src={preview.logoUrl} alt={preview.name} className="h-10 object-contain" /> : <div className="h-10 w-10 bg-[#0c0c0c] border border-white/10" />}
              <span className="font-bold text-[#f7f7f7]">{preview.name || "Nom"}</span>
              <span className="text-[10px] uppercase tracking-widest border px-1.5 py-0.5 border-white/20 text-[#f7f7f7]/50">{preview.tier} · {preview.level}</span>
            </div>
            {preview.website && <a href={preview.website} target="_blank" rel="noopener noreferrer" className="text-xs text-[#D8CA82] hover:underline mt-2 inline-flex items-center gap-1"><ExternalLink size={11}/> {preview.website}</a>}
          </div>
        )}
      </form>
      <div className="lg:col-span-7 space-y-3" data-testid="admin-partners-list">
        <div className="flex gap-2 mb-2">
          {["all","active","archived"].map((f)=> <button key={f} onClick={()=>setFilterActive(f)} className={`text-[11px] uppercase tracking-widest border px-3 py-1 ${filterActive===f ? "border-[#D8CA82] text-[#D8CA82] bg-[#D8CA82]/10" : "border-white/15 text-[#f7f7f7]/50"}`}>{f}</button>)}
          <span className="ml-auto text-xs text-[#f7f7f7]/40">{filtered.length} partenaire(s)</span>
        </div>
        {filtered.length===0 && <p className="text-[#f7f7f7]/40">Aucun partenaire.</p>}
        {filtered.map((p)=>(
          <div key={p.id} className={`flex items-center gap-4 border px-4 py-3 ${p.archived ? "border-white/5 bg-[#141414] opacity-60" : p.active===false ? "border-amber-300/30 bg-amber-300/5" : "border-white/10 bg-[#1A1A1A]"}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#f7f7f7] truncate flex items-center gap-2">{p.name} <span className="text-[9px] uppercase tracking-widest border px-1 py-0.5 border-[#D8CA82]/30 text-[#D8CA82]">{p.tier}</span> {!p.active && <span className="text-[9px] text-amber-300 border border-amber-300/30 px-1">inactif</span>} {p.archived && <span className="text-[9px] text-white/40 border border-white/20 px-1">archivé</span>}</p>
              <p className="text-xs text-[#f7f7f7]/40 truncate">{p.website || "—"} {p.startDate ? `· ${p.startDate} → ${p.endDate || "?"}` : ""} · ordre {p.order ?? 0}</p>
            </div>
            {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer" className="text-[#f7f7f7]/50 hover:text-[#D8CA82]"><ExternalLink size={15}/></a>}
            <button onClick={()=>toggleActive(p)} title={p.active?"Désactiver":"Activer"} className={`text-xs border px-2 py-1 ${p.active?"border-amber-300/40 text-amber-300":"border-emerald-300/40 text-emerald-300"}`}>{p.active?"Désactiver":"Activer"}</button>
            <button onClick={()=>edit(p)} className="text-[#D8CA82]/70 hover:text-[#D8CA82]" data-testid={`admin-partner-edit-${p.id}`}><Pencil size={15}/></button>
            {p.archived ? <><button onClick={()=>restore(p.id)} className="text-emerald-300/70 hover:text-emerald-300"><RotateCcw size={15}/></button><button onClick={()=>hardDelete(p.id)} className="text-red-400/70 hover:text-red-400"><Trash2 size={15}/></button></> : <button onClick={()=>del(p.id)} className="text-amber-300/70 hover:text-amber-300" title="Archiver"><Archive size={15}/></button>}
          </div>
        ))}
      </div>
    </div>
  );
};
