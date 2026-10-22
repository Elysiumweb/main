import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { toast } from "sonner";
import { ArrowRight, Link2, Power, Trash2 } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { logAdminAction } from "../../lib/notify";
import { BUILTIN_REDIRECTS, isValidRedirect, normalizePath } from "../../lib/redirects";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = { from: "", to: "", enabled: true, permanent: false, note: "" };

export const AdminRedirects = () => {
  const { user, displayName, can } = useAuth();
  const { t } = useLang();
  const canManage = can("redirects.manage");
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);

  useEffect(() => {
    return onSnapshot(
      collection(db, "redirects"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => String(a.from).localeCompare(String(b.from)));
        setRows(list);
      },
      (err) => console.error("redirects", err),
    );
  }, []);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!canManage) return;
    const payload = {
      from: normalizePath(form.from),
      to: normalizePath(form.to),
      enabled: !!form.enabled,
      permanent: !!form.permanent,
      note: form.note.trim().slice(0, 160),
      updatedAt: serverTimestamp(),
    };
    if (!isValidRedirect(payload)) {
      toast.error("Les deux chemins doivent être internes, commencer par / et être différents.");
      return;
    }
    try {
      if (editId) await updateDoc(doc(db, "redirects", editId), payload);
      else await addDoc(collection(db, "redirects"), { ...payload, createdAt: serverTimestamp(), createdBy: user?.uid || null });
      await logAdminAction({
        action: editId ? "redirect_updated" : "redirect_created",
        label: `${payload.from} → ${payload.to}`,
        actor: { uid: user?.uid, name: displayName, email: user?.email },
        target: { collection: "redirects", id: editId || payload.from },
      });
      setForm(EMPTY);
      setEditId(null);
      toast.success(t("common.saved"));
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const edit = (row) => {
    setEditId(row.id);
    setForm({ from: row.from, to: row.to, enabled: row.enabled !== false, permanent: !!row.permanent, note: row.note || "" });
  };

  const toggle = async (row) => {
    try {
      await updateDoc(doc(db, "redirects", row.id), { enabled: row.enabled === false, updatedAt: serverTimestamp() });
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const remove = async (row) => {
    try {
      await deleteDoc(doc(db, "redirects", row.id));
      toast.success(t("common.saved"));
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-redirects">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Link2 className="text-[#D8CA82]" size={18} />
          <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">Redirections</h2>
        </div>
        <p className="text-sm text-[#f7f7f7]/50">
          Évitez les liens morts après un renommage de page. La résolution se fait côté client, sans redéploiement.
        </p>
      </div>

      <form onSubmit={submit} className="grid lg:grid-cols-12 gap-3 border border-white/10 bg-[#1A1A1A] p-5" data-testid="admin-redirects-form">
        <label className="lg:col-span-3 text-[10px] uppercase tracking-widest text-[#c8c8c8]">
          Ancien chemin
          <input value={form.from} onChange={set("from")} placeholder="/ancienne-page" className={`${inputCls} mt-1`} data-testid="admin-redirects-from" />
        </label>
        <label className="lg:col-span-3 text-[10px] uppercase tracking-widest text-[#c8c8c8]">
          Nouveau chemin
          <input value={form.to} onChange={set("to")} placeholder="/nouvelle-page" className={`${inputCls} mt-1`} data-testid="admin-redirects-to" />
        </label>
        <label className="lg:col-span-3 text-[10px] uppercase tracking-widest text-[#c8c8c8]">
          Note interne
          <input value={form.note} onChange={set("note")} placeholder="Ex. renommage /dons" className={`${inputCls} mt-1`} data-testid="admin-redirects-note" />
        </label>
        <div className="lg:col-span-3 flex flex-col justify-end gap-2">
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-[#c8c8c8]">
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))} className="accent-[#D8CA82]" /> Active</label>
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={form.permanent} onChange={(e) => setForm((prev) => ({ ...prev, permanent: e.target.checked }))} className="accent-[#D8CA82]" /> 301</label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={!canManage} data-testid="admin-redirects-save"
              className="flex-1 bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-4 py-2.5 disabled:opacity-40">
              {editId ? "Modifier" : "Ajouter"}
            </button>
            {editId && <button type="button" onClick={() => { setEditId(null); setForm(EMPTY); }} className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">Annuler</button>}
          </div>
        </div>
      </form>

      <div className="border border-white/10 bg-[#141414]" data-testid="admin-redirects-list">
        <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#c8c8c8]">
          <span className="flex-1">Redirections ({rows.length})</span>
          <span>Statut</span>
        </div>
        {rows.length === 0 && <p className="text-sm text-[#c8c8c8] px-4 py-6">Aucune redirection personnalisée. La redirection historique <code>/dons → /soutenir</code> reste active.</p>}
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 text-sm" data-testid={`admin-redirect-${row.id}`}>
            <button onClick={() => edit(row)} className="flex-1 min-w-0 text-left">
              <span className="text-[#f7f7f7]">{row.from}</span>
              <ArrowRight size={12} className="inline mx-2 text-[#D8CA82]" />
              <span className="text-[#c8c8c8]">{row.to}</span>
              {row.note && <span className="block text-[10px] text-[#c8c8c8]/60 mt-0.5">{row.note}</span>}
            </button>
            <span className={`text-[10px] uppercase tracking-widest border px-1.5 py-0.5 ${row.enabled === false ? "text-[#c8c8c8] border-white/20" : "text-emerald-300 border-emerald-300/40"}`}>
              {row.enabled === false ? "off" : "on"}
            </span>
            <button onClick={() => toggle(row)} aria-label="Activer / désactiver" className="text-[#D8CA82]/70 hover:text-[#D8CA82]"><Power size={14} /></button>
            <button onClick={() => remove(row)} aria-label="Supprimer" className="text-red-400/70 hover:text-red-400"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      <div className="border border-white/10 bg-[#101010] p-4">
        <p className="text-[10px] uppercase tracking-widest text-[#c8c8c8] mb-2">Redirections intégrées (repli)</p>
        {BUILTIN_REDIRECTS.map((row) => (
          <p key={row.id} className="text-xs text-[#f7f7f7]/60">
            {row.from} <ArrowRight size={10} className="inline mx-1" /> {row.to}
            <span className="ml-2 text-[#c8c8c8]/50">— permanente (une ligne Firestore peut seulement changer sa cible)</span>
          </p>
        ))}
      </div>
    </div>
  );
};
