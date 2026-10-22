import { useEffect } from "react";
import { useFeatureFlag } from "../lib/featureFlags";

/** Bandeau + `noindex` lorsque le mode staging est activé. */
export const StagingBanner = () => {
  const staging = useFeatureFlag("stagingMode");

  useEffect(() => {
    if (!staging || typeof document === "undefined") return;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    meta.dataset.staging = "true";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [staging]);

  if (!staging) return null;

  return (
    <div className="bg-orange-500/20 border-b border-orange-400/40 text-orange-100 text-center text-[10px] uppercase tracking-[0.3em] py-1.5" data-testid="staging-banner">
      Environnement de préproduction — données non publiques
    </div>
  );
};
