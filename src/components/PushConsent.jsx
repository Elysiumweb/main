import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { X } from "lucide-react";

export const PushConsent = () => {
  const { user, hasPlayerAccess } = useAuth();
  const { t } = useLang();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!hasPlayerAccess || !user) return;
    if (!("Notification" in window)) return;
    const dismissed = localStorage.getItem("elysium_push_consent");
    if (dismissed) return;
    if (Notification.permission === "granted" || Notification.permission === "denied") return;
    // Show consent banner after a short delay
    const timer = setTimeout(() => setShow(true), 2000);
    return () => clearTimeout(timer);
  }, [user, hasPlayerAccess]);

  const handleAccept = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        // Register service worker for push
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.ready;
          // The actual subscription to push would need a server-side VAPID key
          // Here we just register the SW and store the consent
          localStorage.setItem("elysium_push_token", "registered");
        }
      }
    } catch (e) {
      console.error("Push notification error:", e);
    }
    localStorage.setItem("elysium_push_consent", "true");
    setShow(false);
  };

  const handleDecline = () => {
    localStorage.setItem("elysium_push_consent", "declined");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 max-w-sm border border-[#D8CA82]/30 bg-[#1A1A1A] p-5 shadow-2xl" data-testid="push-consent-banner">
      <button onClick={handleDecline} className="absolute top-2 right-2 text-[#f7f7f7]/30 hover:text-[#f7f7f7]/60" data-testid="push-consent-close">
        <X size={14} />
      </button>
      <p className="font-display text-sm font-bold text-[#D8CA82] mb-2">{t("pwa.push.consent.title")}</p>
      <p className="text-xs text-[#f7f7f7]/50 mb-4">{t("pwa.push.consent.text")}</p>
      <div className="flex gap-3">
        <button onClick={handleAccept} data-testid="push-consent-accept"
          className="bg-[#D8CA82] text-[#111111] text-xs font-display font-bold uppercase tracking-widest px-4 py-2">
          {t("pwa.push.accept")}
        </button>
        <button onClick={handleDecline} data-testid="push-consent-decline"
          className="border border-white/20 text-[#f7f7f7]/60 text-xs uppercase tracking-widest px-4 py-2 hover:border-white/40 transition-colors">
          {t("pwa.push.decline")}
        </button>
      </div>
    </div>
  );
};
