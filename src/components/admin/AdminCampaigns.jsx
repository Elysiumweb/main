import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Trash2, Pencil, Target } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = { title: "", goalAmount: "", currentAmount: "", active: true };

/**
 * Objectif de campagne (ex : « Objectif LAN 2026 : 3 000 € ») avec barre de
 * progression. Saisie manuelle en admin — reliée à la comptabilité de
 * l'association, sans connexion PayPal en temps réel.
 */
export const AdminCampaigns = () => {
  const { t } = useLang();
  const [campaigns, setCampaigns] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    return onSnapshot(collection(db, "campaigns"), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setCampaigns(list);
    }, console.error);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || Number(form.goalAmount) <= 0) { toast.error(t("common.error")); return; }
    try {
      const data = {
        title: form.title.trim(),
        goalAmount: Number(form.goalAmount) || 0,
        currentAmount: Number(form.currentAmount) || 0,
        active: form.active,
      };
      if (editId) await updateDoc(doc(db, "campaigns", editId), data);
      else await addDoc(collection(db, "campaigns"), { ...data, createdAt: serverTimestamp() });
      setForm(EMPTY); setEditId(null);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const edit = (c) => setForm({ title: c.title || "", goalAmount: c.goalAmount ?? "", currentAmount: c.currentAmount ?? "", active: !!c.active });

  const toggleActive = async (c) => {
    try { await updateDoc(doc(db, "campaigns", c.id), { active: !c.active }); toast.success(t("common.saved")); }
    catch { toast.error(t("common.error")); }
  };

  const del = async (id) => {
    try { await deleteDoc(doc(db, "campaigns", id)); if (editId === id) { setEditId(null); setForm(EMPTY); } }
    catch { toast.error(t("common.error")); }
  };

  const pct = (c) => c.goalAmount > 0 ? Math.min(100, Math.round((c.currentAmount / c.goalAmount) * 100)) : 0;

  return (
    <div className="grid lg:grid-cols-12 gap-10">
      <form onSubmit={submit} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6" data-testid="admin-campaigns-form">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">{t("admin.campaigns.add")}</p>
        <input value={form.title} onChange={set("title")} placeholder="Ex : Objectif LAN 2026" required className={inputCls} data-testid="admin-campaign-title" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/50 block mb-1">{t("admin.campaigns.goal")}</label>
            <input type="number" min="0" step="0.01" value={form.goalAmount} onChange={set("goalAmount")} required className={inputCls} data-testid="admin-campaign-goal" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-[#f7f7f7]/50 block mb-1">{t("admin.campaigns.current")}</label>
            <input type="number" min="0" step="0.01" value={form.currentAmount} onChange={set("currentAmount")} className={inputCls} data-testid="admin-campaign-current" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-[#f7f7f7]/70 cursor-pointer">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="accent-[#D8CA82] h-4 w-4" data-testid="admin-campaign-active" />
          {t("admin.campaigns.active")}
        </label>
        <p className="text-xs text-[#c8c8c8] leading-relaxed">{t("admin.campaigns.hint")}</p>
        <button type="submit" data-testid="admin-campaign-submit"
          className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
          {t("notes.save")}
        </button>
        {editId && (
          <button type="button" onClick={() => { setEditId(null); setForm(EMPTY); }} className="text-[#f7f7f7]/50 text-xs uppercase tracking-widest px-3">
            {t("common.cancel")}
          </button>
        )}
      </form>
      <div className="lg:col-span-7 space-y-3" data-testid="admin-campaigns-list">
        {campaigns.length === 0 && <p className="text-[#c8c8c8]">{t("competitions.empty")}</p>}
        {campaigns.map((c) => (
          <div key={c.id} className="border border-white/10 bg-[#1A1A1A] px-5 py-4" data-testid={`admin-campaign-${c.id}`}>
            <div className="flex items-center gap-3">
              <Target size={15} className="text-[#D8CA82] shrink-0" aria-hidden="true" />
              <p className="font-display font-bold text-[#f7f7f7] flex-1 truncate">{c.title}</p>
              <span className={`text-xs uppercase tracking-widest border px-1.5 py-0.5 ${c.active ? "border-emerald-300/40 text-emerald-300" : "border-white/20 text-[#c8c8c8]"}`}>
                {c.active ? t("admin.campaigns.active") : t("status.closed")}
              </span>
              <button onClick={() => toggleActive(c)} className="text-xs uppercase tracking-wider text-[#f7f7f7]/50 hover:text-[#D8CA82]">{c.active ? "Désactiver" : "Activer"}</button>
              <button onClick={() => edit(c)} className="text-[#D8CA82]/70 hover:text-[#D8CA82]" data-testid={`admin-campaign-edit-${c.id}`}><Pencil size={15} /></button>
              <button onClick={() => del(c.id)} className="text-red-400/70 hover:text-red-400" data-testid={`admin-campaign-delete-${c.id}`}><Trash2 size={15} /></button>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 h-2 bg-white/10 overflow-hidden">
                <div className={`h-full transition-all ${pct(c) >= 100 ? "bg-emerald-400" : "bg-[#D8CA82]"}`} style={{ width: `${pct(c)}%` }} />
              </div>
              <span className="text-xs font-display font-bold text-[#D8CA82]">{c.currentAmount}€ / {c.goalAmount}€ ({pct(c)}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
