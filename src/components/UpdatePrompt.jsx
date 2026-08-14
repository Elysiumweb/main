import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { useLang } from "../lib/i18n";
import { applyServiceWorkerUpdate, hasPendingUpdate, onServiceWorkerUpdate } from "../lib/pwa";

const TOAST_ID = "elysium-sw-update";

/**
 * Affiche un toast persistant « nouvelle version disponible » dès qu'un
 * service worker est installé et en attente. L'utilisateur garde la main :
 * il peut recharger tout de suite ou continuer et le faire plus tard.
 */
export const UpdatePrompt = () => {
  const { t } = useLang();
  const shownRef = useRef(false);

  useEffect(() => {
    const show = () => {
      if (shownRef.current) return;
      shownRef.current = true;
      toast(t("pwa.update.title"), {
        id: TOAST_ID,
        description: t("pwa.update.desc"),
        duration: Infinity,
        icon: <RefreshCw size={16} className="text-[#D8CA82]" aria-hidden="true" />,
        action: {
          label: t("pwa.update.action"),
          onClick: () => applyServiceWorkerUpdate(),
        },
        cancel: {
          label: t("pwa.update.dismiss"),
          onClick: () => toast.dismiss(TOAST_ID),
        },
        onDismiss: () => { shownRef.current = false; },
      });
    };

    if (hasPendingUpdate()) show();
    return onServiceWorkerUpdate(show);
  }, [t]);

  return null;
};
