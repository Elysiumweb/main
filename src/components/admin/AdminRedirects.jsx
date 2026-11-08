import { useState } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { toast } from "sonner";
import { CornerDownRight, Link2, Plus, Trash2 } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { useAdminT } from "../../lib/adminI18n";
import { DEFAULT_REDIRECTS, isInternalPath, normalizePath } from "../../lib/redirects";
import { useCustomRedirects } from "../../hooks/useRedirects";
import { ConfirmAction } from "../ConfirmAction";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = { from: "", to: "", note: "" };

export const AdminRedirects = () => {
  const { t } = useLang();
  const tx = useAdminT();
  const { custom } = useCustomRedirects();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const from = normalizePath(form.from);
    const to = normalizePath(form.to);
    if (!isInternalPath(form.from) || !isInternalPath(form.to) || from === to || from === "/" || to === "/") {
      toast.error(tx("redir.invalid"));
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, "redirects"), {
        from, to, note: form.note.trim().slice(0, 160), active: true,
        createdAt: serverTimestamp(),
      });
      setForm(EMPTY);
      toast.success(tx("redir.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
    setSaving(false);
  };

  const toggle = async (rule) => {
    try { await updateDoc(doc(db, "redirects", rule.id), { active: !rule.active }); }
    catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const remove = async (id) => {
    try {
      await deleteDoc(doc(db, "redirects", id));
      toast.success(tx("redir.deleted"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const rules = [
    ...DEFAULT_REDIRECTS.map((r) => ({ ...r, system: true })),
    ...custom,
  ];

  return (
    <div className="grid lg:grid-cols-12 gap-10" data-testid="admin-redirects">
      <form onSubmit={submit} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6 self-start" data-testid="admin-redirects-form">
        <div className="flex items-center gap-3">
          <Link2 size={18} className="text-[#D8CA82]" />
          <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">{tx("redir.add")}</p>
        </div>
        <div>
          <label htmlFor="redirect-from" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{tx("redir.from")}</label>
          <input id="redirect-from" value={form.from} onChange={set("from")} placeholder="/ancienne-page"
            className={inputCls} required data-testid="admin-redirect-from" />
        </div>
        <div>
          <label htmlFor="redirect-to" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{tx("redir.to")}</label>
          <input id="redirect-to" value={form.to} onChange={set("to")} placeholder="/nouvelle-page"
            className={inputCls} required data-testid="admin-redirect-to" />
        </div>
        <div>
          <label htmlFor="redirect-note" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{tx("redir.note")}</label>
          <input id="redirect-note" value={form.note} onChange={set("note")} maxLength={160}
            className={inputCls} data-testid="admin-redirect-note" />
        </div>
        <button type="submit" disabled={saving} data-testid="admin-redirect-submit"
          className="inline-flex items-center gap-2 bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow disabled:opacity-60">
          <Plus size={14} /> {tx("redir.add")}
        </button>
        <p className="text-xs text-[#c8c8c8]/60">{tx("redir.sub")}</p>
      </form>

      <div className="lg:col-span-7" data-testid="admin-redirects-list">
        {rules.length === 0 && <p className="text-sm text-[#c8c8c8]">{tx("redir.empty")}</p>}
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className={`flex flex-wrap items-center gap-3 border border-white/10 bg-[#1A1A1A] px-4 py-3 ${rule.active === false ? "opacity-60" : ""}`}
              data-testid={`admin-redirect-${rule.id}`}>
              <div className="flex items-center gap-2 min-w-0 flex-1 text-sm">
                <code className="text-[#f7f7f7]/80 truncate">{rule.from}</code>
                <CornerDownRight size={14} className="text-[#D8CA82] shrink-0" />
                <code className="text-[#D8CA82] truncate">{rule.to}</code>
              </div>
              {rule.note && <span className="text-xs text-[#c8c8c8] max-w-[220px] truncate">{rule.note}</span>}
              {rule.system && (
                <span className="text-[10px] uppercase tracking-widest border border-white/20 text-[#c8c8c8] px-1.5 py-0.5">
                  {tx("redir.default")}
                </span>
              )}
              <span className={`text-[10px] uppercase tracking-widest border px-1.5 py-0.5 ${rule.active === false ? "border-white/20 text-[#c8c8c8]" : "border-emerald-400/40 text-emerald-300"}`}>
                {rule.active === false ? "off" : tx("redir.active")}
              </span>
              {!rule.system && (
                <>
                  <button type="button" onClick={() => toggle(rule)} data-testid={`admin-redirect-toggle-${rule.id}`}
                    className="text-xs uppercase tracking-widest text-[#c8c8c8] hover:text-[#D8CA82]">
                    {rule.active === false ? tx("redir.active") : "off"}
                  </button>
                  <ConfirmAction title={tx("redir.delete")} description={`${rule.from} → ${rule.to}`}
                    confirmLabel={t("common.delete")} onConfirm={() => remove(rule.id)}>
                    <button type="button" className="text-red-400/70 hover:text-red-400" aria-label={`${tx("redir.delete")} ${rule.from}`}
                      data-testid={`admin-redirect-delete-${rule.id}`}>
                      <Trash2 size={15} />
                    </button>
                  </ConfirmAction>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
