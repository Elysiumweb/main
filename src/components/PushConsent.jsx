import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { canUsePush, subscribeToPush } from "../lib/push";
import { X } from "lucide-react";

export const PushConsent = () => {
  const { user, hasPlayerAccess } = useAuth();
  const { t } = useLang();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!hasPlayerAccess || !user) return;
      const supported = await canUsePush();
      if (!supported || cancelled) return;
      const dismissed = localStorage.getItem("elysium_push_consent");
      if (dismissed) return;
      if (Notification.permission === "granted" || Notification.permission === "denied") return;
      const timer = setTimeout(() => !cancelled && setShow(true), 2000);
      return () => clearTimeout(timer);
    };
    const cleanupPromise = run();
    return () => {
      cancelled = true;
      cleanupPromise.then((cleanup) => typeof cleanup === "function" && cleanup()).catch(() => {});
    };
  }, [user, hasPlayerAccess]);

  const handleAccept = async () => {
    setBusy(true);
    try {
      const token = await subscribeToPush({ uid: user.uid });
      localStorage.setItem("elysium_push_token", token);
      localStorage.setItem("elysium_push_consent", "true");
      toast.success("Notifications push activées.");
      setShow(false);
    } catch (e) {
      console.error("Push notification error:", e);
      toast.error(e.message || "Impossible d'activer les notifications push.");
      localStorage.removeItem("elysium_push_consent");
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = () => {
    localStorage.setItem("elysium_push_consent", "declined");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 max-w-sm border border-[#D8CA82]/40 bg-[#1A1A1A] p-5 animate-in slide-in-from-bottom-4 fade-in duration-200 motion-reduce:animate-none" data-testid="push-consent-banner">
      <button onClick={handleDecline} className="absolute top-2 right-2 text-[#f7f7f7]/30 hover:text-[#f7f7f7]/60" data-testid="push-consent-close" aria-label="Fermer">
        <X size={14} />
      </button>
      <p className="font-display text-sm font-bold text-[#D8CA82] mb-2">{t("pwa.push.consent.title")}</p>
      <p className="text-xs text-[#f7f7f7]/50 mb-4">{t("pwa.push.consent.text")}</p>
      <div className="flex gap-3">
        <button onClick={handleAccept} disabled={busy} data-testid="push-consent-accept"
          className="bg-[#D8CA82] text-[#111111] text-xs font-display font-bold uppercase tracking-widest px-4 py-2 disabled:opacity-50">
          {t("pwa.push.accept")}
        </button>
        <button onClick={handleDecline} disabled={busy} data-testid="push-consent-decline"
          className="border border-white/20 text-[#f7f7f7]/60 text-xs uppercase tracking-widest px-4 py-2 hover:border-white/40 transition-colors disabled:opacity-50">
          {t("pwa.push.decline")}
        </button>
      </div>
    </div>
  );
};
