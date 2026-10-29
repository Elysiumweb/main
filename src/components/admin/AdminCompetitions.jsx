import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { toast } from "sonner";
import { Trash2, Pencil, ExternalLink, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { StandingsCsvImport } from "./StandingsCsvImport";
import { sortStandingsRows } from "../../lib/standingsCsv";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const STATUSES = ["upcoming", "ongoing", "finished"];
const EMPTY = { name: "", officialUrl: "", season: "", status: "upcoming", position: "", notes: "", standings: [], order: "" };

const EMPTY_STANDING = { team: "", played: "", wins: "", draws: "", losses: "", points: "", diff: "" };

// Comparateur centralisé : ordre personnalisé d'abord, puis saison/nom en fallback
const competitionsComparator = (a, b) => {
  const ao = typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
  const bo = typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  // fallback historique : saison puis nom
  return (a.season || "").localeCompare(b.season || "") || (a.name || "").localeCompare(b.name || "");
};

export const AdminCompetitions = () => {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    return onSnapshot(collection(db, "competitions"), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort(competitionsComparator);
      setItems(list);
    }, console.error);
  }, []);

  const updateStanding = (idx, key, value) => {
    setForm(f=>{
      const next = [...(f.standings||[])];
      next[idx] = { ...next[idx], [key]: value };
      return { ...f, standings: next };
    });
  };
  const addStanding = () => setForm(f=>({ ...f, standings: [...(f.standings||[]), { ...EMPTY_STANDING }] }));
  const removeStanding = (idx) => setForm(f=>({ ...f, standings: (f.standings||[]).filter((_,i)=>i!==idx) }));

  // Déplacer une compétition dans la liste (boutons ↑ / ↓)
  const move = async (fromIndex, direction) => {
    if (savingOrder) return;
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= items.length) return;
    setSavingOrder(true);
    try {
      // items est déjà trié par order
      const newList = [...items];
      const [moved] = newList.splice(fromIndex, 1);
      newList.splice(toIndex, 0, moved);
      // Réécriture normalisée 0..n-1 pour éviter doublons / trous
      const batch = writeBatch(db);
      newList.forEach((c, idx) => {
        if (c.order !== idx) {
          batch.update(doc(db, "competitions", c.id), { order: idx });
        }
      });
      await batch.commit();
      toast.success(t("admin.competitions.orderSaved") || "Ordre enregistré");
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    } finally {
      setSavingOrder(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error(t("common.error")); return; }
    if (form.officialUrl && !/^https?:\/\//.test(form.officialUrl)) { toast.error("URL invalide"); return; }
    const cleanStandings = sortStandingsRows((form.standings||[]).filter(s=>s.team?.trim()).map(s=>({
      team: s.team.trim(),
      played: Number(s.played)||0,
      wins: Number(s.wins)||0,
      draws: Number(s.draws)||0,
      losses: Number(s.losses)||0,
      points: Number(s.points)||0,
      diff: s.diff ? String(s.diff) : "",
    })));
    try {
      // Gestion de l'ordre : 1 = premier → stocké 0
      let orderValue;
      if (form.order !== "" && form.order != null) {
        const parsed = parseInt(String(form.order), 10);
        orderValue = Number.isFinite(parsed) && parsed > 0 ? parsed - 1 : 0;
      } else if (editId) {
        const existing = items.find((x) => x.id === editId);
        orderValue = typeof existing?.order === "number" ? existing.order : items.length;
      } else {
        // Ajout en dernier si non renseigné
        const maxOrder = items.reduce((m, c) => (typeof c.order === "number" ? Math.max(m, c.order) : m), -1);
        orderValue = maxOrder + 1;
        if (maxOrder === -1) orderValue = items.length;
      }

      const payload = {
        name: form.name.trim(),
        officialUrl: form.officialUrl || "",
        season: form.season || "",
        status: form.status || "upcoming",
        position: form.position || "",
        notes: form.notes || "",
        standings: cleanStandings,
        order: orderValue,
      };
      if (editId) await updateDoc(doc(db, "competitions", editId), payload);
      else await addDoc(collection(db, "competitions"), { ...payload, createdAt: serverTimestamp() });
      setForm(EMPTY); setEditId(null);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const edit = (c) => {
    setEditId(c.id);
    setForm({
      name: c.name || "",
      officialUrl: c.officialUrl || "",
      season: c.season || "",
      status: c.status || "upcoming",
      position: c.position || "",
      notes: c.notes || "",
      standings: Array.isArray(c.standings) ? c.standings : [],
      order: typeof c.order === "number" ? String(c.order + 1) : "",
    });
  };
  const del = async (id) => {
    try {
      await deleteDoc(doc(db, "competitions", id));
      if (editId === id) { setEditId(null); setForm(EMPTY); }
      // Optionnel : renormaliser les ordres après suppression pour garder 0..n-1
      // On laisse tel quel pour éviter des writes en cascade, le tri reste cohérent.
    }
    catch { toast.error(t("common.error")); }
  };

  const cancelEdit = () => { setEditId(null); setForm(EMPTY); };

  return (
    <div className="grid lg:grid-cols-12 gap-10">
      <form onSubmit={submit} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6 h-fit lg:sticky lg:top-6" data-testid="admin-competitions-form">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">
          {editId ? "Modifier" : t("admin.competitions.add")}
        </p>
        <input value={form.name} onChange={set("name")} placeholder={t("admin.competitions.name")} required className={inputCls} data-testid="admin-competition-name" />
        <div className="grid grid-cols-2 gap-4">
          <input value={form.season} onChange={set("season")} placeholder={t("admin.competitions.season")} className={inputCls} data-testid="admin-competition-season" />
          <select value={form.status} onChange={set("status")} className={inputCls} data-testid="admin-competition-status">
            {STATUSES.map((s) => <option key={s} value={s}>{t(`competitions.status.${s}`)}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <input value={form.order} onChange={set("order")} placeholder={t("admin.competitions.order")} type="number" min="1" step="1" className={inputCls} data-testid="admin-competition-order" />
            <p className="text-xs text-[#c8c8c8] mt-1">{t("admin.competitions.orderHint")}</p>
          </div>
          <input value={form.position} onChange={set("position")} placeholder={t("admin.competitions.position")} className={inputCls} data-testid="admin-competition-position" />
        </div>
        <input value={form.officialUrl} onChange={set("officialUrl")} placeholder={t("admin.competitions.link")} type="url" className={inputCls} data-testid="admin-competition-link" />
        <input value={form.notes} onChange={set("notes")} placeholder={t("admin.competitions.notes")} className={inputCls} data-testid="admin-competition-notes" />

        <div className="border-t border-white/10 pt-4 mt-2" data-testid="admin-competition-standings">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-[0.25em] text-[#D8CA82]">Classement détaillé (équipes, J, V, N, D, Pts, +/-)</p>
            <button type="button" onClick={addStanding} className="text-xs border border-[#D8CA82]/40 text-[#D8CA82] px-3 py-1 hover:bg-[#D8CA82]/10">+ Équipe</button>
          </div>

          <StandingsCsvImport
            existingStandings={form.standings || []}
            onApply={(rows) => setForm((f) => ({ ...f, standings: rows }))}
          />

          {(form.standings||[]).length===0 && <p className="text-xs text-[#c8c8c8] mb-2">Aucune ligne — importez un .csv ou ajoutez les équipes une par une. Si vide, l'ancien affichage “position Elysium” reste.</p>}
          <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
            {(form.standings||[]).map((s,idx)=>(
              <div key={idx} className="grid grid-cols-12 gap-1 items-center">
                <input value={s.team} onChange={e=>updateStanding(idx,"team",e.target.value)} placeholder="Équipe" className="col-span-4 bg-[#111111] border border-white/20 px-2 py-1.5 text-xs text-[#f7f7f7]" />
                <input value={s.played} onChange={e=>updateStanding(idx,"played",e.target.value)} placeholder="J" type="number" className="col-span-1 bg-[#111111] border border-white/20 px-1 py-1.5 text-xs text-[#f7f7f7]" />
                <input value={s.wins} onChange={e=>updateStanding(idx,"wins",e.target.value)} placeholder="V" type="number" className="col-span-1 bg-[#111111] border border-white/20 px-1 py-1.5 text-xs text-[#f7f7f7]" />
                <input value={s.draws} onChange={e=>updateStanding(idx,"draws",e.target.value)} placeholder="N" type="number" className="col-span-1 bg-[#111111] border border-white/20 px-1 py-1.5 text-xs text-[#f7f7f7]" />
                <input value={s.losses} onChange={e=>updateStanding(idx,"losses",e.target.value)} placeholder="D" type="number" className="col-span-1 bg-[#111111] border border-white/20 px-1 py-1.5 text-xs text-[#f7f7f7]" />
                <input value={s.points} onChange={e=>updateStanding(idx,"points",e.target.value)} placeholder="Pts" type="number" className="col-span-2 bg-[#111111] border border-white/20 px-1 py-1.5 text-xs text-[#f7f7f7]" />
                <input value={s.diff} onChange={e=>updateStanding(idx,"diff",e.target.value)} placeholder="+/-" className="col-span-1 bg-[#111111] border border-white/20 px-1 py-1.5 text-xs text-[#f7f7f7]" />
                <button type="button" onClick={()=>removeStanding(idx)} className="col-span-1 text-red-400 text-xs">✕</button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" data-testid="admin-competition-submit"
            className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
            {t("notes.save")}
          </button>
          {editId && (
            <button type="button" onClick={cancelEdit} className="text-[#f7f7f7]/50 text-xs uppercase tracking-widest px-3">
              {t("common.cancel")}
            </button>
          )}
        </div>
      </form>
      <div className="lg:col-span-7 space-y-3" data-testid="admin-competitions-list">
        {items.length > 1 && (
          <p className="text-xs text-[#c8c8c8] border border-[#D8CA82]/20 bg-[#D8CA82]/5 px-3 py-2 flex items-center gap-2" data-testid="admin-competitions-reorder-hint">
            <GripVertical size={12} className="text-[#D8CA82] shrink-0" /> {t("admin.competitions.reorderHint")}
          </p>
        )}
        {items.length === 0 && <p className="text-[#c8c8c8]">{t("competitions.empty")}</p>}
        {items.map((c, idx) => (
          <div key={c.id} className="flex items-center gap-3 border border-white/10 bg-[#1A1A1A] px-3 py-3 group hover:border-white/20 transition-colors" data-testid={`admin-competition-row-${c.id}`}>
            {/* Numéro d'ordre + drag handle visuel */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden sm:flex items-center justify-center w-7 h-7 bg-[#111111] border border-white/10 text-xs font-display font-bold text-[#D8CA82]" title={`${t("admin.competitions.order")} : ${idx + 1}`}>
                #{idx + 1}
              </span>
              <span className="sm:hidden w-6 h-6 flex items-center justify-center bg-[#111111] border border-white/10 text-xs font-bold text-[#D8CA82]">#{idx + 1}</span>
            </div>

            {/* Boutons ↑ ↓ */}
            <div className="flex flex-col gap-1 shrink-0">
              <button
                type="button"
                onClick={() => move(idx, "up")}
                disabled={idx === 0 || savingOrder}
                aria-label={`${t("admin.competitions.moveUp")} ${c.name}`}
                title={t("admin.competitions.moveUp")}
                data-testid={`admin-competition-up-${c.id}`}
                className="w-7 h-6 flex items-center justify-center border border-white/15 text-[#f7f7f7]/60 hover:text-[#D8CA82] hover:border-[#D8CA82]/50 disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:text-[#f7f7f7]/30 disabled:hover:border-white/15 transition-colors"
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                onClick={() => move(idx, "down")}
                disabled={idx === items.length - 1 || savingOrder}
                aria-label={`${t("admin.competitions.moveDown")} ${c.name}`}
                title={t("admin.competitions.moveDown")}
                data-testid={`admin-competition-down-${c.id}`}
                className="w-7 h-6 flex items-center justify-center border border-white/15 text-[#f7f7f7]/60 hover:text-[#D8CA82] hover:border-[#D8CA82]/50 disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:text-[#f7f7f7]/30 disabled:hover:border-white/15 transition-colors"
              >
                <ChevronDown size={12} />
              </button>
            </div>

            <span className={`hidden sm:inline-flex text-xs uppercase tracking-widest border px-1.5 py-0.5 shrink-0 ${c.status === "ongoing" ? "border-emerald-300/40 text-emerald-300" : c.status === "upcoming" ? "border-sky-300/40 text-sky-300" : "border-white/20 text-[#c8c8c8]"}`}>
              {t(`competitions.status.${c.status}`)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#f7f7f7] truncate">{c.name}</p>
              <p className="text-xs text-[#c8c8c8] truncate">
                {c.season ? `${t("competitions.season")} ${c.season}` : ""}{c.position ? ` · ${t("competitions.position")} : ${c.position}` : ""}
                <span className="sm:hidden ml-2 text-[#D8CA82]/60">· {t(`competitions.status.${c.status}`)}</span>
              </p>
            </div>
            {c.officialUrl && (
              <a href={c.officialUrl} target="_blank" rel="noopener noreferrer" className="text-[#f7f7f7]/50 hover:text-[#D8CA82] shrink-0" title={t("competitions.visit")} data-testid={`admin-competition-link-${c.id}`}>
                <ExternalLink size={15} />
              </a>
            )}
            <button onClick={() => edit(c)} className="text-[#D8CA82]/70 hover:text-[#D8CA82] shrink-0" data-testid={`admin-competition-edit-${c.id}`} title={t("admin.edit") || "Modifier"}>
              <Pencil size={15} />
            </button>
            <button onClick={() => del(c.id)} className="text-red-400/70 hover:text-red-400 shrink-0" data-testid={`admin-competition-delete-${c.id}`} title={t("common.delete") || "Supprimer"}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
