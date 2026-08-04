import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";

export const confirmDangerBtn =
  "bg-red-500/15 border border-red-400/50 text-red-200 hover:bg-red-500/25 hover:text-red-100 font-display font-bold uppercase tracking-widest text-xs px-5 py-2.5 rounded-none";

export const cancelBtn =
  "bg-transparent border border-white/20 text-[#f7f7f7]/70 hover:bg-white/5 hover:text-[#f7f7f7] uppercase tracking-widest text-xs px-5 py-2.5 rounded-none mt-0";

export const ConfirmAction = ({
  children,
  title = "Confirmer l'action",
  description = "Cette action est irréversible.",
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  onConfirm,
  destructive = true,
}) => (
  <AlertDialog>
    <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
    <AlertDialogContent className="bg-[#1A1A1A] border border-[#D8CA82]/30 rounded-none text-[#f7f7f7] shadow-[0_0_40px_rgba(0,0,0,0.65)]">
      <AlertDialogHeader>
        <AlertDialogTitle className="font-display uppercase tracking-[0.25em] text-[#D8CA82] text-base">
          {title}
        </AlertDialogTitle>
        <AlertDialogDescription className="text-[#f7f7f7]/60 leading-relaxed">
          {description}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="gap-2 sm:space-x-0">
        <AlertDialogCancel className={cancelBtn}>{cancelLabel}</AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          className={destructive
            ? confirmDangerBtn
            : "bg-[#D8CA82] text-[#111111] hover:bg-[#D8CA82]/90 font-display font-bold uppercase tracking-widest text-xs px-5 py-2.5 rounded-none"}
        >
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default ConfirmAction;
