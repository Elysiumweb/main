import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { Users, Plus, Trash2, GripVertical } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

export default function AvailabilitySheet() {
  const { user, game, canManage, role, displayName } = useAuth();
  const { t } = useLang();
  const [columns, setColumns] = useState([]); // colonnes de dates
  const [players, setPlayers] = useState([]); // joueurs (collection players)
  const [matrix, setMatrix] = useState({}); // { columnId: { odUID: "yes|no|maybe" } }
  const [newDate, setNewDate] = useState("");
  const [newDateLabel, setNewDateLabel] = useState("");
  const [showAddCol, setShowAddCol] = useState(false);

  // Collection selon le jeu
  const availColsColl = game === "Rocket League" ? "availcols_rl" : "availcols";
  const availRowsColl = game === "Rocket League" ? "availrows_rl" : "availrows";

  // Charger les colonnes (dates)
  useEffect(() => {
    return onSnapshot(collection(db, availColsColl), (snap) => {
      const cols = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      cols.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      setColumns(cols);
    }, console.error);
  }, [availColsColl]);

  // Charger la matrice des disponibilités
  useEffect(() => {
    if (columns.length === 0) return;
    return onSnapshot(collection(db, availRowsColl), (snap) => {
      const mat = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        if (!mat[d.id]) mat[d.id] = {};
        columns.forEach((col) => {
          mat[d.id][col.id] = data[col.id] || "";
        });
      });
      setMatrix(mat);
    }, console.error);
  }, [availRowsColl, columns]);

  // Charger les joueurs du jeu
  useEffect(() => {
    return onSnapshot(collection(db, "players"), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p.game === game || p.uid);
      setPlayers(list);
    }, console.error);
  }, [game]);

  // Ajouter une colonne (date)
  const addColumn = async (e) => {
    e.preventDefault();
    if (!newDate) return;
    try {
      await addDoc(collection(db, availColsColl), {
        date: newDate,
        label: newDateLabel || newDate,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
      setNewDate("");
      setNewDateLabel("");
      setShowAddCol(false);
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  // Supprimer une colonne
  const deleteColumn = async (colId) => {
    if (!window.confirm("Supprimer cette colonne et toutes les réponses ?")) return;
    try {
      // Supprimer la colonne
      await deleteDoc(doc(db, availColsColl, colId));
      // Supprimer les réponses associées
      const snap = await import("firebase/firestore").then(m => 
        m.getDocs(collection(db, availRowsColl))
      );
      const updates = snap.docs.map(d => {
        const data = d.data();
        if (data[colId]) {
          const newData = { ...data };
          delete newData[colId];
          return updateDoc(doc(db, availRowsColl, d.id), newData);
        }
        return Promise.resolve();
      });
      await Promise.all(updates);
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  // Toggle disponibilité d'un joueur (cycle: "" -> "yes" -> "no" -> "maybe" -> "")
  const toggleCell = async (odUid, colId) => {
    const rowId = `row_${odUid}`;
    const current = matrix[rowId]?.[colId] || "";
    const next = current === "yes" ? "no" : current === "no" ? "maybe" : current === "maybe" ? "" : "yes";
    
    try {
      await updateDoc(doc(db, availRowsColl, rowId), {
        [colId]: next,
        odUid,
        odName: displayName,
        game,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      // Si le doc n'existe pas, on le crée
      if (err.code === "not-found") {
        try {
          await addDoc(collection(db, availRowsColl), {
            odUid,
            odName: displayName,
            game,
            [colId]: next,
            createdAt: serverTimestamp(),
          });
        } catch (e2) { console.error(e2); toast.error(t("common.error")); }
      } else {
        console.error(err);
        toast.error(t("common.error"));
      }
    }
  };

  // Récupérer ou créer le rowId pour un joueur
  const getRowId = (odUid) => `row_${odUid}`;

  // Compter les réponses par colonne
  const countByCol = (colId) => {
    let yes = 0, no = 0, maybe = 0;
    Object.values(matrix).forEach((row) => {
      const val = row[colId];
      if (val === "yes") yes++;
      else if (val === "no") no++;
      else if (val === "maybe") maybe++;
    });
    return { yes, no, maybe };
  };

  // Tous les joueurs uniques qui ont une ligne
  const allRowIds = [...new Set(Object.keys(matrix).filter(id => id.startsWith("row_")))];

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users size={20} className="text-[#D8CA82]" />
            <h2 className="font-display text-base uppercase tracking-[0.3em] text-[#f7f7f7]">
              {t("avail自由.sheet")} — {game || "EVA"}
            </h2>
          </div>
          {canManage && (
            <button
              onClick={() => setShowAddCol(!showAddCol)}
              className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-4 py-2 flex items-center gap-2 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow"
            >
              <Plus size={14} /> {t("avail自由.add")}
            </button>
          )}
        </div>

        {/* Formulaire ajout colonne */}
        {showAddCol && canManage && (
          <form onSubmit={addColumn} className="border border-white/10 bg-[#141414] p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-[#f7f7f7]/50 block mb-1 uppercase tracking-wider">{t("avail自由.date")}</label>
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} required className={inputCls + " w-40"} />
            </div>
            <div>
              <label className="text-xs text-[#f7f7f7]/50 block mb-1 uppercase tracking-wider">Label (optionnel)</label>
              <input type="text" value={newDateLabel} onChange={(e) => setNewDateLabel(e.target.value)} placeholder="Ex: Entrainement" className={inputCls + " w-48"} />
            </div>
            <button type="submit" className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-4 py-2">
              Ajouter
            </button>
            <button type="button" onClick={() => setShowAddCol(false)} className="text-[#f7f7f7]/50 hover:text-[#f7f7f7] text-sm px-2">
              ✕
            </button>
          </form>
        )}

        {/* Tableau style Google Sheets */}
        {columns.length === 0 ? (
          <div className="border border-white/10 bg-[#0d0d0d] p-12 text-center">
            <p className="text-[#f7f7f7]/40 text-sm">{t("avail自由.empty")}</p>
            {canManage && (
              <p className="text-[#f7f7f7]/30 text-xs mt-2">Ajoutez une colonne de date pour commencer</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto border border-white/10 bg-[#0d0d0d]">
            <table className="min-w-[800px] w-full">
              <thead>
                <tr className="border-b border-white/10 bg-[#141414] sticky top-0 z-10">
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-[#D8CA82] font-display w-8">
                    <GripVertical size={14} />
                  </th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-[#f7f7f7]/60 font-display min-w-[120px]">
                    {t("avail自由.name")}
                  </th>
                  {columns.map((col) => {
                    const counts = countByCol(col.id);
                    const d = col.date ? new Date(col.date) : null;
                    return (
                      <th key={col.id} className="px-3 py-3 min-w-[100px]">
                        <div className="text-center">
                          <p className="text-xs font-display text-[#D8CA82] uppercase">
                            {d ? d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : col.label}
                          </p>
                          <p className="text-[10px] text-[#f7f7f7]/30 mt-0.5">
                            {col.label !== col.date ? col.label : ""}
                          </p>
                          <div className="flex justify-center gap-1 mt-2 text-[10px]">
                            <span className="text-emerald-400">{counts.yes > 0 ? `✓${counts.yes}` : ""}</span>
                            <span className="text-red-400">{counts.no > 0 ? `✗${counts.no}` : ""}</span>
                            <span className="text-yellow-400">{counts.maybe > 0 ? `?${counts.maybe}` : ""}</span>
                          </div>
                          {canManage && (
                            <button
                              onClick={() => deleteColumn(col.id)}
                              className="text-[#f7f7f7]/20 hover:text-red-400 mt-1 transition-colors"
                              title={t("avail自由.delete")}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {/* Ligne pour l'utilisateur courant */}
                <tr className="border-b border-[#D8CA82]/20 bg-[#1a1a1a]/50 hover:bg-[#1a1a1a] transition-colors">
                  <td className="px-4 py-2 text-[#D8CA82]">
                    <span title="Vous" className="text-[#D8CA82] font-bold">★</span>
                  </td>
                  <td className="px-4 py-2 text-sm font-medium text-[#D8CA82]">
                    {displayName} (vous)
                  </td>
                  {columns.map((col) => {
                    const rowId = getRowId(user.uid);
                    const val = matrix[rowId]?.[col.id] || "";
                    return (
                      <td key={col.id} className="px-2 py-2 text-center">
                        <button
                          onClick={() => toggleCell(user.uid, col.id)}
                          className={`w-10 h-8 border text-lg font-bold transition-all hover:scale-110 ${
                            val === "yes" ? "border-emerald-400 text-emerald-400 bg-emerald-400/10" :
                            val === "no" ? "border-red-400 text-red-400 bg-red-400/10" :
                            val === "maybe" ? "border-yellow-400 text-yellow-400 bg-yellow-400/10" :
                            "border-white/20 text-white/20 hover:border-white/40 hover:text-white/40"
                          }`}
                          title={t("avail自由.editCell")}
                        >
                          {val === "yes" ? "✓" : val === "no" ? "✗" : val === "maybe" ? "?" : "–"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
                {/* Lignes pour les autres joueurs qui ont rempli */}
                {allRowIds
                  .filter((id) => id !== getRowId(user.uid))
                  .map((rowId) => {
                    const odUid = rowId.replace("row_", "");
                    const odName = matrix[rowId]?.odName || odUid;
                    return (
                      <tr key={rowId} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-2 text-[#f7f7f7]/20">
                          <GripVertical size={14} />
                        </td>
                        <td className="px-4 py-2 text-sm text-[#f7f7f7]/60">
                          {odName}
                        </td>
                        {columns.map((col) => {
                          const val = matrix[rowId]?.[col.id] || "";
                          return (
                            <td key={col.id} className="px-2 py-2 text-center">
                              <button
                                onClick={() => toggleCell(odUid, col.id)}
                                disabled={!canManage}
                                className={`w-10 h-8 border text-lg font-bold transition-all ${
                                  canManage ? "hover:scale-110 cursor-pointer" : "cursor-default"
                                } ${
                                  val === "yes" ? "border-emerald-400 text-emerald-400 bg-emerald-400/10" :
                                  val === "no" ? "border-red-400 text-red-400 bg-red-400/10" :
                                  val === "maybe" ? "border-yellow-400 text-yellow-400 bg-yellow-400/10" :
                                  "border-white/10 text-white/10"
                                }`}
                                title={t("avail自由.editCell")}
                              >
                                {val === "yes" ? "✓" : val === "no" ? "✗" : val === "maybe" ? "?" : "–"}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        {/* Légende */}
        <div className="flex items-center justify-center gap-6 text-xs text-[#f7f7f7]/40">
          <span className="flex items-center gap-1">
            <span className="w-4 h-4 border border-emerald-400 text-emerald-400 flex items-center justify-center text-[10px]">✓</span>
            {t("avail自由.yes")} Présent
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-4 border border-red-400 text-red-400 flex items-center justify-center text-[10px]">✗</span>
            {t("avail自由.no")} Absent
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-4 border border-yellow-400 text-yellow-400 flex items-center justify-center text-[10px]">?</span>
            {t("avail自由.maybe")} Peut-être
          </span>
        </div>
      </div>
    </div>
  );
}
