import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, setDoc, deleteDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Flag, Plus, Power, Trash2 } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { FLAG_DEFINITIONS } from "../../lib/featureFlags";
import { logAdminAction } from "../../lib/notify";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 60);

export const AdminFlags = () => {
  const { user, displayName, can } = useAuth();
  const { t } = useLang();
  const canManage = can("flags.manage");
  const [docs, setDocs] = useState([]);
  const [form, setForm] = useState({ id: "", label: "", description: "" });

  useEffect(() => {
    return onSnapshot(
      collection(db, "featureFlags"),
      (snap) => setDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("featureFlags", err),
    );
  }, []);

  const stored = docs.reduce((acc, item) => { acc[item.id] = item; return acc; }, {});
  const custom = docs.filter((item) => !FLAG_DEFINITIONS.some((def) => def.id === item.id));

  const setFlag = async (id, enabled, definition = {}) => {
    if (!canManage) return;
    try {
      await setDoc(doc(db, "featureFlags", id), {
        enabled,
        label: definition.label || stored[id]?.label || id,
        description: definition.description || stored[id]?.description || "",
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
      }, { merge: true });
      await logAdminAction({
        action: "feature_flag_updated",
        label: `${id} → ${enabled ? "on" : "off"}`,
        actor: { uid: user?.uid, name: displayName, email: user?.email },
        target: { collection: "featureFlags", id },
      });
      toast.success(t("common.saved"));
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const createFlag = async (event) => {
    event.preventDefault();
    const id = slugify(form.id || form.label);
    if (!id) {
      toast.error("Identifiant requis.");
      return;
    }
    if (FLAG_DEFINITIONS.some((def) => def.id === id)) {
      toast.error("Cet identifiant existe déjà.");
      return;
    }
    try {
      await setDoc(doc(db, "featureFlags", id), {
        enabled: false,
        label: form.label.trim().slice(0, 60) || id,
        description: form.description.trim().slice(0, 200),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
      });
      setForm({ id: "", label: "", description: "" });
      toast.success(t("common.saved"));
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const removeFlag = async (id) => {
    try {
      await deleteDoc(doc(db, "featureFlags", id));
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const staging = stored.stagingMode?.enabled === true;
  const envOverrides = {
    staging: process.env.REACT_APP_STAGING === "true",
    flags: process.env.REACT_APP_FEATURE_FLAGS || "",
  };

  return (
    <div className="space-y-6" data-testid="admin-flags">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Flag className="text-[#D8CA82]" size={18} />
          <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">Feature flags & staging</h2>
        </div>
        <p className="text-sm text-[#f7f7f7]/50">
          Activez ou coupez une fonctionnalité sans redéploiement. Les flags sont lus publiquement ; l'écriture exige <code>flags.manage</code>.
        </p>
      </div>

      {staging && (
        <p className="border border-orange-400/50 bg-orange-500/10 px-4 py-3 text-sm text-orange-200" data-testid="admin-flags-staging-warning">
          Mode staging actif : un bandeau de préproduction est affiché sur le site.
        </p>
      )}

      <div className="space-y-2" data-testid="admin-flags-list">
        {FLAG_DEFINITIONS.map((definition) => {
          const value = stored[definition.id]?.enabled ?? definition.default;
          const isStaging = definition.id === "stagingMode";
          return (
            <div key={definition.id} className={`flex flex-col sm:flex-row sm:items-center gap-3 border px-4 py-3 ${isStaging && value ? "border-orange-400/50 bg-orange-500/5" : "border-white/10 bg-[#141414]"}`} data-testid={`admin-flag-${definition.id}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#f7f7f7]">{definition.label} <span className="text-[10px] uppercase tracking-widest text-[#c8c8c8]/60 ml-2">{definition.id}</span></p>
                <p className="text-xs text-[#c8c8c8]">{definition.description}</p>
              </div>
              <button
                onClick={() => setFlag(definition.id, !value, definition)}
                disabled={!canManage}
                role="switch"
                aria-checked={value}
                aria-label={`${definition.label} : ${value ? "activé" : "désactivé"}`}
                data-testid={`admin-flag-toggle-${definition.id}`}
                className={`inline-flex items-center gap-2 border px-3 py-2 text-[10px] uppercase tracking-widest disabled:opacity-40 ${value ? "border-emerald-400/50 text-emerald-300 bg-emerald-500/10" : "border-white/20 text-[#c8c8c8]"}`}
              >
                <Power size={12} /> {value ? "Activé" : "Désactivé"}
              </button>
            </div>
          );
        })}
      </div>

      <form onSubmit={createFlag} className="border border-white/10 bg-[#1A1A1A] p-5 space-y-3" data-testid="admin-flags-form">
        <p className="text-[10px] uppercase tracking-widest text-[#D8CA82]">Drapeau personnalisé</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <input value={form.id} onChange={(e) => setForm((prev) => ({ ...prev, id: e.target.value }))} placeholder="identifiant (ex. newStatsPage)" className={inputCls} data-testid="admin-flag-id" />
          <input value={form.label} onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))} placeholder="Libellé" className={inputCls} data-testid="admin-flag-label" />
          <input value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Description" className={inputCls} data-testid="admin-flag-description" />
        </div>
        <button type="submit" disabled={!canManage} data-testid="admin-flag-create"
          className="inline-flex items-center gap-2 bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-5 py-2.5 disabled:opacity-40">
          <Plus size={13} /> Créer
        </button>
      </form>

      {custom.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">Drapeaux personnalisés ({custom.length})</p>
          {custom.map((item) => (
            <div key={item.id} className="flex items-center gap-3 border border-white/10 bg-[#141414] px-4 py-2.5" data-testid={`admin-flag-custom-${item.id}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#f7f7f7]">{item.label || item.id}</p>
                <p className="text-xs text-[#c8c8c8]">{item.description || "—"}</p>
              </div>
              <button onClick={() => setFlag(item.id, !item.enabled)} disabled={!canManage} role="switch" aria-checked={!!item.enabled}
                className={`text-[10px] uppercase tracking-widest border px-2.5 py-1.5 ${item.enabled ? "border-emerald-400/50 text-emerald-300" : "border-white/20 text-[#c8c8c8]"}`}>
                {item.enabled ? "Activé" : "Désactivé"}
              </button>
              <button onClick={() => removeFlag(item.id)} aria-label="Supprimer le drapeau" className="text-red-400/70 hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="border border-white/10 bg-[#101010] p-4 text-xs text-[#c8c8c8] space-y-1">
        <p className="text-[10px] uppercase tracking-widest text-[#c8c8c8] mb-1">Surcharges d'environnement</p>
        <p>REACT_APP_STAGING : {envOverrides.staging ? "true (force le mode staging)" : "non défini"}</p>
        <p>REACT_APP_FEATURE_FLAGS : {envOverrides.flags || "non défini"}</p>
      </div>
    </div>
  );
};
