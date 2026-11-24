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
  "bg-transparent border border-border/35 text-foreground/70 hover:bg-primary/5 hover:text-foreground uppercase tracking-widest text-xs px-5 py-2.5 rounded-none mt-0";

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
    <AlertDialogContent className="panel clip-blade border border-primary/30 rounded-none text-foreground shadow-deep">
      <AlertDialogHeader>
        <AlertDialogTitle className="font-display uppercase tracking-[0.25em] text-primary text-base">
          {title}
        </AlertDialogTitle>
        <AlertDialogDescription className="text-foreground/60 leading-relaxed">
          {description}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="gap-2 sm:space-x-0">
        <AlertDialogCancel className={cancelBtn}>{cancelLabel}</AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          className={destructive
            ? confirmDangerBtn
            : "bg-gold text-primary-foreground hover:bg-primary/90 font-display font-bold uppercase tracking-widest text-xs px-5 py-2.5 rounded-none"}
        >
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default ConfirmAction;
