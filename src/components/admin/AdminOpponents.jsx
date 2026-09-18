import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Trash2, Pencil } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = { name: "", slug: "", logo: "", country: "", website: "", twitter: "" };

const slugify = (s) => String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80);

export const AdminOpponents = () => {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const set = (k) => (e) => setForm(f=>({ ...f, [k]: e.target.value }));

  useEffect(()=>{
    return onSnapshot(collection(db,"opponents"), (s)=>{
      const list = s.docs.map(d=>({id:d.id, ...d.data()}));
      list.sort((a,b)=>(a.name||"").localeCompare(b.name||""));
      setItems(list);
    }, console.error);
  },[]);

  const submit = async (e)=>{
    e.preventDefault();
    if (!form.name.trim()) { toast.error(t("common.error")); return; }
    const slug = form.slug.trim() ? slugify(form.slug) : slugify(form.name);
    if (form.logo && !/^https?:\/\//.test(form.logo)) { toast.error("URL logo invalide"); return; }
    if (form.website && !/^https?:\/\//.test(form.website)) { toast.error("URL site invalide"); return; }
    try {
      const payload = { ...form, name: form.name.trim(), slug, logo: form.logo.trim(), country: form.country.trim(), website: form.website.trim(), twitter: form.twitter.trim() };
      if (editId) await updateDoc(doc(db,"opponents",editId), payload);
      else await addDoc(collection(db,"opponents"), { ...payload, createdAt: serverTimestamp() });
      setForm(EMPTY); setEditId(null);
      toast.success(t("common.saved"));
    } catch(err){ console.error(err); toast.error(t("common.error")); }
  };

  const edit = (o)=>{ setEditId(o.id); setForm({ name:o.name||"", slug:o.slug||"", logo:o.logo||"", country:o.country||"", website:o.website||"", twitter:o.twitter||"" }); };
  const del = async (id)=>{ try{ await deleteDoc(doc(db,"opponents",id)); if(editId===id){ setEditId(null); setForm(EMPTY);} } catch{ toast.error(t("common.error")); } };

  return (
    <div className="grid lg:grid-cols-12 gap-10">
      <form onSubmit={submit} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6" data-testid="admin-opponents-form">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">{editId ? "Modifier adversaire" : "Ajouter un adversaire"}</p>
        <input value={form.name} onChange={set("name")} placeholder="Nom équipe adverse" required className={inputCls} data-testid="admin-opponent-name" />
        <input value={form.slug} onChange={set("slug")} placeholder="Slug (auto si vide) ex: team-liquid" className={inputCls} data-testid="admin-opponent-slug" />
        <input value={form.logo} onChange={set("logo")} placeholder="Logo URL https://..." className={inputCls} data-testid="admin-opponent-logo" />
        {form.logo && /^https?:\/\//.test(form.logo) && <img src={form.logo} alt="" className="h-10 object-contain border border-white/10 p-1" onError={e=>e.target.style.display="none"} />}
        <div className="grid grid-cols-2 gap-4">
          <input value={form.country} onChange={set("country")} placeholder="Pays (FR, EU, US...)" className={inputCls} data-testid="admin-opponent-country" />
          <input value={form.website} onChange={set("website")} placeholder="Site officiel https://..." className={inputCls} data-testid="admin-opponent-website" />
        </div>
        <input value={form.twitter} onChange={set("twitter")} placeholder="Lien X/Twitter https://..." className={inputCls} data-testid="admin-opponent-twitter" />
        <button type="submit" data-testid="admin-opponent-submit" className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">{t("notes.save")}</button>
        {editId && <button type="button" onClick={()=>{setEditId(null); setForm(EMPTY);}} className="text-[#f7f7f7]/50 text-xs uppercase tracking-widest px-3">{t("common.cancel")}</button>}
      </form>
      <div className="lg:col-span-7 space-y-2" data-testid="admin-opponents-list">
        {items.length===0 && <p className="text-[#c8c8c8]">Aucun adversaire enrichi — les fiches sont générées automatiquement depuis les matchs, cette collection permet d'ajouter logo/pays/liens.</p>}
        {items.map(o=>(
          <div key={o.id} className="flex items-center gap-4 border border-white/10 bg-[#1A1A1A] px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#f7f7f7] truncate">{o.name} <span className="text-xs text-[#c8c8c8]">/{o.slug}</span></p>
              <p className="text-xs text-[#c8c8c8] truncate">{o.country||"—"} {o.website?`· ${o.website}`:""}</p>
            </div>
            <button onClick={()=>edit(o)} className="text-[#D8CA82]/70 hover:text-[#D8CA82]" data-testid={`admin-opponent-edit-${o.id}`}><Pencil size={15}/></button>
            <button onClick={()=>del(o.id)} className="text-red-400/70 hover:text-red-400" data-testid={`admin-opponent-delete-${o.id}`}><Trash2 size={15}/></button>
          </div>
        ))}
      </div>
    </div>
  );
};
