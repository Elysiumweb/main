import { useState } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "./ui/alert-dialog";
import { ActionButton } from "./ui/action-button";

/* =====================================================================
 * ConfirmDelete
 * ---------------------------------------------------------------------
 * Remplace les suppressions "discrètes au survol" par :
 *  - un bouton TOUJOURS visible (cible tactile 44px min, donc mobile OK)
 *  - une confirmation explicite nommant l'élément supprimé
 *  - un état de chargement pendant la suppression
 * =================================================================== */

export const ConfirmDelete = ({
  onConfirm,
  itemLabel = "cet élément",
  title = "Confirmer la suppression",
  description,
  confirmLabel = "Supprimer définitivement",
  cancelLabel = "Annuler",
  triggerLabel,
  variant = "icon", // "icon" | "button"
  testId = "confirm-delete",
  className,
  successMessage = "Supprimé",
  errorMessage = "Une erreur est survenue",
}) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      toast.success(successMessage);
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(errorMessage);
    } finally {
      setBusy(false);
    }
  };

  const accessibleLabel = triggerLabel || `Supprimer ${itemLabel}`;

  return (
    <AlertDialog open={open} onOpenChange={(v) => (busy ? null : setOpen(v))}>
      <AlertDialogTrigger asChild>
        {variant === "icon" ? (
          <button
            type="button"
            data-testid={`${testId}-trigger`}
            aria-label={accessibleLabel}
            title={accessibleLabel}
            className={`inline-flex items-center justify-center shrink-0 w-11 h-11 min-w-[44px] min-h-[44px] border border-[#ff9b95]/40 text-[#ff9b95] hover:bg-[#8c1d18]/30 hover:border-[#ff9b95] hover:text-[#ffd0cd] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D8CA82] ${className || ""}`}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        ) : (
          <ActionButton
            variant="dangerOutline"
            size="sm"
            icon={Trash2}
            data-testid={`${testId}-trigger`}
            className={className}
          >
            {triggerLabel || "Supprimer"}
          </ActionButton>
        )}
      </AlertDialogTrigger>

      <AlertDialogContent
        className="bg-[#1A1A1A] border border-[#ff9b95]/30 rounded-none text-[#f7f7f7] max-w-md sm:rounded-none"
        data-testid={`${testId}-dialog`}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display uppercase tracking-widest text-base text-[#ffd0cd] flex items-center gap-2">
            <AlertTriangle size={18} aria-hidden="true" /> {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[#c8c8c8] text-sm leading-relaxed">
            {description || (
              <>
                Vous êtes sur le point de supprimer{" "}
                <span className="text-[#f7f7f7] font-semibold">{itemLabel}</span>. Cette action est
                irréversible.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-3 sm:space-x-0">
          <ActionButton
            variant="secondary"
            size="md"
            onClick={() => setOpen(false)}
            disabled={busy}
            data-testid={`${testId}-cancel`}
            className="w-full sm:w-auto"
          >
            {cancelLabel}
          </ActionButton>
          <ActionButton
            variant="danger"
            size="md"
            icon={Trash2}
            loading={busy}
            loadingLabel="Suppression…"
            onClick={handleConfirm}
            data-testid={`${testId}-confirm`}
            className="w-full sm:w-auto"
          >
            {confirmLabel}
          </ActionButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
