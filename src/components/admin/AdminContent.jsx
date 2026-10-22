import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { Markdown } from "../../lib/markdown";
import { logAdminAction } from "../../lib/notify";
import {
  CONTENT_DEFAULTS,
  DEFAULT_ABOUT,
  DEFAULT_DONATE,
  DEFAULT_HOME_GAMES,
  DEFAULT_LEGAL,
  DEFAULT_PARTNERS,
  isSafeContent,
  mergeContent,
} from "../../lib/siteContent";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

const SECTIONS = [
  { id: "about", label: "À propos" },
  { id: "partners", label: "Offres partenaires" },
  { id: "legal", label: "Pages légales" },
  { id: "homeGames", label: "Accueil — Nos jeux" },
  { id: "donate", label: "Dons" },
  { id: "press", label: "Presse" },
];

const Field = ({ label, value, onChange, rows = 0, testId, placeholder }) => (
  <label className="block text-[10px] uppercase tracking-widest text-[#c8c8c8]">
    {label}
    {rows > 0 ? (
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} className={`${inputCls} mt-1`} data-testid={testId} />
    ) : (
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inputCls} mt-1`} data-testid={testId} />
    )}
  </label>
);

const ListEditor = ({ items, onChange, fields, title, testId }) => {
  const move = (index, direction) => {
    const next = [...items];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-[#D8CA82]">{title}</p>
        <button type="button" onClick={() => onChange([...items, fields.reduce((acc, field) => ({ ...acc, [field.key]: "" }), {})])}
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[#D8CA82] hover:underline">
          <Plus size={11} /> Ajouter
        </button>
      </div>
      {items.length === 0 && <p className="text-xs text-[#c8c8c8]">Aucune entrée.</p>}
      {items.map((item, index) => (
        <div key={`${item.key || item.title || index}-${index}`} className="border border-white/10 bg-[#141414] p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#c8c8c8]">#{index + 1}</span>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={() => move(index, -1)} aria-label="Monter" className="text-[#c8c8c8] hover:text-[#D8CA82]"><ArrowUp size={12} /></button>
              <button type="button" onClick={() => move(index, 1)} aria-label="Descendre" className="text-[#c8c8c8] hover:text-[#D8CA82]"><ArrowDown size={12} /></button>
              <button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))} aria-label="Supprimer" className="text-red-400/70 hover:text-red-400"><Trash2 size={12} /></button>
            </div>
          </div>
          {fields.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              value={item[field.key] || ""}
              rows={field.rows || 0}
              onChange={(value) => onChange(items.map((entry, i) => (i === index ? { ...entry, [field.key]: value } : entry)))}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

export const AdminContent = () => {
  const { user, displayName, can } = useAuth();
  const { t } = useLang();
  const canEdit = can("content.edit");
  const [section, setSection] = useState("about");
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(() => DEFAULT_ABOUT);
  const [jsonDraft, setJsonDraft] = useState({ grille: "", rows: "" });
  const [legalTab, setLegalTab] = useState("mentions");

  useEffect(() => {
    setLoading(true);
    return onSnapshot(
      doc(db, "siteContent", section),
      (snap) => {
        const data = snap.exists() ? snap.data() : null;
        setRaw(data);
        const merged = mergeContent(section, data);
        setDraft(merged);
        if (section === "partners") {
          setJsonDraft({
            grille: JSON.stringify(merged.grille, null, 2),
            rows: JSON.stringify(merged.rows, null, 2),
          });
        }
        if (section === "press") {
          setJsonDraft({
            assets: JSON.stringify(merged.assets, null, 2),
            usage: JSON.stringify(merged.usage, null, 2),
          });
        }
        setLoading(false);
      },
      (err) => {
        console.error("siteContent", err);
        setLoading(false);
        toast.error("Lecture des contenus impossible");
      },
    );
  }, [section]);

  const set = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!canEdit) return;
    let payload = draft;
    if (section === "partners") {
      try {
        const grille = JSON.parse(jsonDraft.grille);
        const rows = JSON.parse(jsonDraft.rows);
        if (typeof grille !== "object" || !Array.isArray(rows)) throw new Error("format");
        payload = { ...draft, grille, rows };
      } catch {
        toast.error("La grille ou les lignes ne sont pas un JSON valide.");
        return;
      }
    }
    if (section === "press") {
      try {
        const assets = JSON.parse(jsonDraft.assets);
        const usage = JSON.parse(jsonDraft.usage);
        if (!Array.isArray(assets) || !Array.isArray(usage)) throw new Error("format");
        payload = { ...draft, assets, usage };
      } catch {
        toast.error("Les ressources presse ne sont pas un JSON valide.");
        return;
      }
    }
    if (!isSafeContent(payload)) {
      toast.error("Contenu trop volumineux ou trop profond.");
      return;
    }
    try {
      await setDoc(doc(db, "siteContent", section), { ...payload, updatedAt: serverTimestamp(), updatedBy: user?.uid || null }, { merge: true });
      await logAdminAction({
        action: "site_content_updated",
        label: `siteContent/${section}`,
        actor: { uid: user?.uid, name: displayName, email: user?.email },
        target: { collection: "siteContent", id: section },
      });
      toast.success(t("common.saved"));
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const resetDefaults = async () => {
    if (!canEdit) return;
    try {
      await setDoc(doc(db, "siteContent", section), { ...CONTENT_DEFAULTS[section], updatedAt: serverTimestamp(), updatedBy: user?.uid || null });
      toast.success("Contenu réinitialisé");
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const legal = useMemo(() => draft || DEFAULT_LEGAL, [draft]);
  const legalDoc = legal[legalTab] || DEFAULT_LEGAL[legalTab];
  const updateLegal = (patch) => set(legalTab, { ...legalDoc, ...patch });

  return (
    <div className="space-y-5" data-testid="admin-content">
      <div>
        <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">Contenus du site</h2>
        <p className="text-sm text-[#f7f7f7]/50 mt-1">
          Modifiez les pages statiques sans redéploiement. Les valeurs par défaut restent le repli si le document Firestore est absent.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-white/10" data-testid="admin-content-tabs">
        {SECTIONS.map((item) => (
          <button key={item.id} onClick={() => setSection(item.id)} data-testid={`admin-content-tab-${item.id}`}
            className={`px-4 py-2.5 text-[10px] uppercase tracking-widest border-b-2 -mb-px ${section === item.id ? "border-[#D8CA82] text-[#D8CA82]" : "border-transparent text-[#c8c8c8] hover:text-[#f7f7f7]"}`}>
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[#c8c8c8]">Chargement…</p>
      ) : (
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-4 border border-white/10 bg-[#1A1A1A] p-5">
            {section === "about" && (
              <>
                <Field label="Introduction" value={draft.intro || ""} rows={3} onChange={(value) => set("intro", value)} testId="admin-content-about-intro" />
                <Field label="Histoire" value={draft.history || ""} rows={5} onChange={(value) => set("history", value)} testId="admin-content-about-history" />
                <ListEditor
                  title="Valeurs"
                  items={draft.values || []}
                  onChange={(values) => set("values", values)}
                  fields={[
                    { key: "key", label: "Clé (1, 2, 3…)" },
                    { key: "title", label: "Titre" },
                    { key: "description", label: "Description", rows: 3 },
                  ]}
                  testId="admin-content-about-values"
                />
                <ListEditor
                  title="Chronologie"
                  items={draft.timeline || []}
                  onChange={(timeline) => set("timeline", timeline)}
                  fields={[
                    { key: "date", label: "Date affichée" },
                    { key: "title", label: "Titre" },
                    { key: "text", label: "Texte", rows: 2 },
                  ]}
                  testId="admin-content-about-timeline"
                />
              </>
            )}

            {section === "partners" && (
              <>
                <Field label="Introduction" value={draft.intro || ""} rows={3} onChange={(value) => set("intro", value)} testId="admin-content-partners-intro" />
                <p className="text-xs text-[#c8c8c8]">
                  Les paliers sont structurés en JSON (clé bronze/argent/gold). Chaque palier reprend les champs de la grille affichée sur /partenaires.
                </p>
                <label className="block text-[10px] uppercase tracking-widest text-[#D8CA82]">
                  Grille des paliers (JSON)
                  <textarea value={jsonDraft.grille} onChange={(e) => setJsonDraft((prev) => ({ ...prev, grille: e.target.value }))}
                    rows={14} spellCheck={false} className={`${inputCls} mt-1 font-mono text-[11px]`} data-testid="admin-content-partners-grille" />
                </label>
                <label className="block text-[10px] uppercase tracking-widest text-[#D8CA82]">
                  Lignes du tableau (JSON)
                  <textarea value={jsonDraft.rows} onChange={(e) => setJsonDraft((prev) => ({ ...prev, rows: e.target.value }))}
                    rows={10} spellCheck={false} className={`${inputCls} mt-1 font-mono text-[11px]`} data-testid="admin-content-partners-rows" />
                </label>
              </>
            )}

            {section === "legal" && (
              <>
                <div className="flex gap-1" role="tablist">
                  {[
                    { id: "mentions", label: "Mentions" },
                    { id: "privacy", label: "Confidentialité" },
                    { id: "terms", label: "CGU" },
                  ].map((tab) => (
                    <button key={tab.id} onClick={() => setLegalTab(tab.id)} role="tab" aria-selected={legalTab === tab.id}
                      data-testid={`admin-content-legal-tab-${tab.id}`}
                      className={`px-3 py-1.5 text-[10px] uppercase tracking-widest border ${legalTab === tab.id ? "border-[#D8CA82] text-[#D8CA82]" : "border-white/15 text-[#c8c8c8]"}`}>
                      {tab.label}
                    </button>
                  ))}
                </div>
                <Field label="Titre" value={legalDoc.title || ""} onChange={(value) => updateLegal({ title: value })} testId="admin-content-legal-title" />
                <Field label="Dernière mise à jour" value={legalDoc.updatedAt || ""} onChange={(value) => updateLegal({ updatedAt: value })} testId="admin-content-legal-updated" />
                <label className="block text-[10px] uppercase tracking-widest text-[#D8CA82]">
                  Texte (Markdown)
                  <textarea value={legalDoc.markdown || ""} onChange={(e) => updateLegal({ markdown: e.target.value })}
                    rows={18} className={`${inputCls} mt-1 font-mono text-[11px]`} data-testid="admin-content-legal-markdown" />
                </label>
              </>
            )}

            {section === "homeGames" && (
              <>
                {["eva", "rl"].map((game) => (
                  <fieldset key={game} className="border border-white/10 p-3 space-y-2">
                    <legend className="text-[10px] uppercase tracking-widest text-[#D8CA82] px-1">{game === "eva" ? "EVA" : "Rocket League"}</legend>
                    <Field label="Équipe / badge" value={draft[game]?.tagline || ""} onChange={(value) => set(game, { ...(draft[game] || {}), tagline: value })} testId={`admin-content-home-${game}-tagline`} />
                    <Field label="Sous-titre" value={draft[game]?.short || ""} onChange={(value) => set(game, { ...(draft[game] || {}), short: value })} testId={`admin-content-home-${game}-short`} />
                    <Field label="Description" value={draft[game]?.description || ""} rows={3} onChange={(value) => set(game, { ...(draft[game] || {}), description: value })} testId={`admin-content-home-${game}-description`} />
                  </fieldset>
                ))}
                <Field label="Piliers (texte)" value={draft.pillars || ""} rows={3} onChange={(value) => set("pillars", value)} testId="admin-content-home-pillars" />
              </>
            )}

            {section === "donate" && (
              <>
                <Field label="Introduction" value={draft.intro || ""} rows={3} onChange={(value) => set("intro", value)} testId="admin-content-donate-intro" />
                <ListEditor
                  title="Usages des dons"
                  items={draft.usages || []}
                  onChange={(usages) => set("usages", usages)}
                  fields={[
                    { key: "title", label: "Poste" },
                    { key: "description", label: "Description", rows: 2 },
                    { key: "percent", label: "Part (%)" },
                  ]}
                  testId="admin-content-donate-usages"
                />
                <Field label="Transparence" value={draft.transparency || ""} rows={4} onChange={(value) => set("transparency", value)} testId="admin-content-donate-transparency" />
              </>
            )}

            {section === "press" && (
              <>
                <Field label="Introduction (facultatif)" value={draft.intro || ""} rows={3} onChange={(value) => set("intro", value)} testId="admin-content-press-intro" />
                <p className="text-xs text-[#c8c8c8]">
                  Groupes de logos et documents de charte. Chaque groupe contient <code>group</code>, <code>kind</code> et une liste <code>items</code>
                  (<code>name</code>, <code>file</code>, <code>w</code>, <code>h</code>, <code>ratio</code>).
                </p>
                <label className="block text-[10px] uppercase tracking-widest text-[#D8CA82]">
                  Ressources (JSON)
                  <textarea value={jsonDraft.assets} onChange={(e) => setJsonDraft((prev) => ({ ...prev, assets: e.target.value }))}
                    rows={16} spellCheck={false} className={`${inputCls} mt-1 font-mono text-[11px]`} data-testid="admin-content-press-assets" />
                </label>
                <label className="block text-[10px] uppercase tracking-widest text-[#D8CA82]">
                  Exports recommandés (JSON)
                  <textarea value={jsonDraft.usage} onChange={(e) => setJsonDraft((prev) => ({ ...prev, usage: e.target.value }))}
                    rows={8} spellCheck={false} className={`${inputCls} mt-1 font-mono text-[11px]`} data-testid="admin-content-press-usage" />
                </label>
              </>
            )}

            <div className="flex items-center gap-3 flex-wrap border-t border-white/10 pt-4">
              <button onClick={save} disabled={!canEdit} data-testid="admin-content-save"
                className="inline-flex items-center gap-2 bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-6 py-3 disabled:opacity-40">
                <Save size={13} /> Enregistrer
              </button>
              <button onClick={resetDefaults} disabled={!canEdit} data-testid="admin-content-reset"
                className="inline-flex items-center gap-2 border border-white/25 text-[#f7f7f7]/70 text-[10px] uppercase tracking-widest px-4 py-2.5 hover:border-[#D8CA82] hover:text-[#D8CA82] disabled:opacity-40">
                <RotateCcw size={12} /> Rétablir les valeurs par défaut
              </button>
              <span className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">
                {raw ? "Document Firestore" : "Valeurs par défaut (aucune surcharge)"}
              </span>
            </div>
          </div>

          <div className="lg:col-span-4 border border-white/10 bg-[#141414] p-4">
            <p className="text-[10px] uppercase tracking-widest text-[#c8c8c8] mb-3">Aperçu</p>
            {section === "legal" ? (
              <div className="max-h-[520px] overflow-y-auto" data-testid="admin-content-legal-preview">
                <Markdown source={legalDoc.markdown || ""} className="text-sm" />
              </div>
            ) : section === "partners" ? (
              <div className="space-y-2 text-xs text-[#c8c8c8]">
                <p className="text-[#f7f7f7]/80">{draft.intro}</p>
                {Object.entries(DEFAULT_PARTNERS.grille).map(([key, tier]) => (
                  <div key={key} className="border border-white/10 p-2">
                    <p className="text-[#D8CA82] font-display">{tier.label}</p>
                    <p>{tier.tarifRef} · {tier.engagement}</p>
                  </div>
                ))}
              </div>
            ) : section === "about" ? (
              <div className="space-y-3 text-xs text-[#c8c8c8]">
                <p className="text-[#f7f7f7]/80">{draft.intro}</p>
                <div>
                  <p className="text-[#D8CA82] uppercase tracking-widest text-[10px] mb-1">Valeurs</p>
                  {(draft.values || []).map((value, i) => (
                    <p key={i}><strong className="text-[#f7f7f7]">{value.title}</strong> — {value.description}</p>
                  ))}
                </div>
                <div>
                  <p className="text-[#D8CA82] uppercase tracking-widest text-[10px] mb-1">Chronologie</p>
                  {(draft.timeline || []).map((step, i) => (
                    <p key={i}><strong className="text-[#f7f7f7]">{step.date}</strong> — {step.title}</p>
                  ))}
                </div>
              </div>
            ) : section === "homeGames" ? (
              <div className="space-y-3 text-xs text-[#c8c8c8]">
                {["eva", "rl"].map((game) => (
                  <div key={game}>
                    <p className="text-[#D8CA82] uppercase tracking-widest text-[10px]">{draft[game]?.tagline}</p>
                    <p>{draft[game]?.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2 text-xs text-[#c8c8c8]">
                <p>{draft.intro}</p>
                {(draft.usages || []).map((usage, i) => (
                  <p key={i}><strong className="text-[#f7f7f7]">{usage.title}</strong> — {usage.percent}% · {usage.description}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
