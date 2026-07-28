import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { X } from "lucide-react";
import { ActionButton } from "./ui/action-button";

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
      <button onClick={handleDecline} aria-label={t("pwa.push.decline")}
        className="absolute top-1 right-1 w-9 h-9 flex items-center justify-center text-[#c8c8c8] hover:text-[#f7f7f7] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
        data-testid="push-consent-close">
        <X size={14} aria-hidden="true" />
      </button>
      <p className="font-display text-sm font-bold text-[#D8CA82] mb-2">{t("pwa.push.consent.title")}</p>
      <p className="text-xs text-[#c8c8c8] mb-4">{t("pwa.push.consent.text")}</p>
      <div className="flex gap-3">
        <ActionButton variant="primary" size="sm" onClick={handleAccept} data-testid="push-consent-accept">
          {t("pwa.push.accept")}
        </ActionButton>
        <ActionButton variant="secondary" size="sm" onClick={handleDecline} data-testid="push-consent-decline">
          {t("pwa.push.decline")}
        </ActionButton>
      </div>
    </div>
  );
};
