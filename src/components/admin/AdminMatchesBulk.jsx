import { useState } from "react";
import { deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { toast } from "sonner";
import { ChevronDown, Download, ListChecks } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { useBulkSelection } from "../../hooks/useBulkSelection";
import { downloadCsv, csvFilename } from "../../lib/csv";
import { logAdminAction } from "../../lib/notify";

/**
 * Actions en masse sur les matchs filtrés : sélection multiple, changement de
 * statut, suppression et export CSV. Complète les actions unitaires des cartes.
 */
export const AdminMatchesBulk = ({ matches = [], actor }) => {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const visible = matches.slice(0, 120);
  const bulk = useBulkSelection(visible);

  const updateStatus = async (status) => {
    if (!bulk.count) return;
    try {
      await Promise.all(bulk.selected.map((id) => updateDoc(doc(db, "matches", id), {
        status,
        updatedAt: serverTimestamp(),
      })));
      await logAdminAction({
        action: "matches_bulk_status",
        label: `${bulk.count} match(s) → ${status}`,
        actor,
        target: { collection: "matches", id: bulk.selected.join(",") },
      });
      toast.success(`${bulk.count} match(s) mis à jour`);
      bulk.clear();
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const removeSelected = async () => {
    if (!bulk.count) return;
    if (!window.confirm(`Supprimer définitivement ${bulk.count} match(s) ?`)) return;
    try {
      await Promise.all(bulk.selected.map((id) => deleteDoc(doc(db, "matches", id))));
      await logAdminAction({
        action: "matches_bulk_deleted",
        label: `${bulk.count} match(s) supprimé(s)`,
        actor,
        target: { collection: "matches", id: bulk.selected.join(",") },
      });
      toast.success(`${bulk.count} match(s) supprimé(s)`);
      bulk.clear();
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const exportSelected = () => {
    const rows = visible.filter((match) => bulk.selectedSet.has(match.id));
    if (!rows.length) return;
    downloadCsv(
      csvFilename("elysium-matchs-selection"),
      rows.map((match) => ({
        id: match.id,
        date: match.date || "",
        jeu: match.game || "",
        roster: match.roster || "",
        adversaire: match.opponentName || "",
        competition: match.competition || "",
        statut: match.status || "",
        score_elysium: match.scoreUs ?? "",
        score_adverse: match.scoreThem ?? "",
        mvp: match.mvp || "",
      })),
      [
        { key: "id", label: "ID" },
        { key: "date", label: "Date" },
        { key: "jeu", label: "Jeu" },
        { key: "roster", label: "Roster" },
        { key: "adversaire", label: "Adversaire" },
        { key: "competition", label: "Compétition" },
        { key: "statut", label: "Statut" },
        { key: "score_elysium", label: "Score Elysium" },
        { key: "score_adverse", label: "Score adverse" },
        { key: "mvp", label: "MVP" },
      ],
    );
  };

  return (
    <div className="border border-white/10 bg-[#141414] mb-4" data-testid="admin-matches-bulk">
      <button onClick={() => setOpen((value) => !value)} aria-expanded={open} data-testid="admin-matches-bulk-toggle"
        className="w-full flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-widest text-[#c8c8c8] hover:text-[#D8CA82]">
        <ListChecks size={13} /> Actions en masse
        <ChevronDown size={12} className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-white/10 pt-2">
          <p className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">{bulk.count} / {visible.length} sélectionné(s)</p>
          <div className="max-h-44 overflow-y-auto border border-white/10 divide-y divide-white/5" data-testid="admin-matches-bulk-list">
            <label className="flex items-center gap-2 px-2 py-1.5 text-[10px] uppercase tracking-widest text-[#D8CA82] cursor-pointer">
              <input type="checkbox" checked={bulk.allSelected} onChange={bulk.toggleAll} className="accent-[#D8CA82] h-3.5 w-3.5" data-testid="admin-matches-bulk-select-all" />
              Tout sélectionner
            </label>
            {visible.map((match) => (
              <label key={match.id} className="flex items-center gap-2 px-2 py-1.5 text-xs text-[#f7f7f7]/75 cursor-pointer hover:bg-white/5">
                <input type="checkbox" checked={bulk.isSelected(match.id)} onChange={() => bulk.toggle(match.id)} className="accent-[#D8CA82] h-3.5 w-3.5" data-testid={`admin-matches-bulk-select-${match.id}`} />
                <span className="truncate flex-1">{match.date || "—"} · {match.opponentName || "Adversaire"}</span>
                <span className="text-[10px] uppercase tracking-widest text-[#c8c8c8]">{match.game || ""}</span>
              </label>
            ))}
            {visible.length === 0 && <p className="px-2 py-3 text-xs text-[#c8c8c8]">Aucun match.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => updateStatus("upcoming")} disabled={!bulk.count} data-testid="admin-matches-bulk-upcoming"
              className="border border-white/20 text-[#f7f7f7]/70 text-[10px] uppercase tracking-widest px-3 py-1.5 hover:border-[#D8CA82] hover:text-[#D8CA82] disabled:opacity-40">
              {t("admin.match.upcoming")}
            </button>
            <button onClick={() => updateStatus("finished")} disabled={!bulk.count} data-testid="admin-matches-bulk-finished"
              className="border border-white/20 text-[#f7f7f7]/70 text-[10px] uppercase tracking-widest px-3 py-1.5 hover:border-[#D8CA82] hover:text-[#D8CA82] disabled:opacity-40">
              {t("admin.match.finished")}
            </button>
            <button onClick={exportSelected} disabled={!bulk.count} data-testid="admin-matches-bulk-export"
              className="inline-flex items-center gap-1 border border-[#D8CA82]/40 text-[#D8CA82] text-[10px] uppercase tracking-widest px-3 py-1.5 disabled:opacity-40">
              <Download size={11} /> CSV
            </button>
            <button onClick={removeSelected} disabled={!bulk.count} data-testid="admin-matches-bulk-delete"
              className="ml-auto text-[10px] uppercase tracking-widest text-red-300/80 hover:text-red-300 disabled:opacity-40">
              Supprimer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
