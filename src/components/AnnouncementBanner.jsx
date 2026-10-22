import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { Megaphone, X } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useFeatureFlag } from "../lib/featureFlags";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";

const DISMISS_KEY = "elysium_announcements_dismissed";
const LEVELS = {
  info: { cls: "border-[#D8CA82]/50 bg-[#D8CA82]/10 text-[#f7f7f7]", badge: "text-[#D8CA82]" },
  success: { cls: "border-emerald-400/40 bg-emerald-500/10 text-emerald-50", badge: "text-emerald-300" },
  warning: { cls: "border-orange-400/50 bg-orange-500/10 text-orange-50", badge: "text-orange-300" },
  critical: { cls: "border-red-400/50 bg-red-500/10 text-red-50", badge: "text-red-300" },
};

const readDismissed = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const isLive = (announcement, now = Date.now()) => {
  if (!announcement || announcement.active === false) return false;
  const toMs = (value) => {
    if (!value) return null;
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isFinite(date.getTime()) ? date.getTime() : null;
  };
  const start = toMs(announcement.startsAt);
  const end = toMs(announcement.endsAt);
  if (start && start > now) return false;
  if (end && end < now) return false;
  return true;
};

/**
 * Bannière d'annonce publique.
 * L'admin peut cibler un rôle et/ou un jeu. Un visiteur ne télécharge que les
 * annonces actives ; la bannière est masquée une fois fermée (localStorage).
 */
export const AnnouncementBanner = () => {
  const enabled = useFeatureFlag("publicAnnouncements");
  const { user, role, game, isOfficial } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      collection(db, "announcements"),
      (snap) => setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("announcements sync", err),
    );
  }, [enabled]);

  const visible = useMemo(() => {
    if (!enabled) return [];
    const now = Date.now();
    const effectiveRole = isOfficial ? "bureau" : role;
    return announcements
      .filter((a) => a && !dismissed.includes(a.id) && isLive(a, now))
      .filter((a) => !a.targetRoles?.length || isOfficial || a.targetRoles.includes(effectiveRole) || a.targetRoles.includes("visitor"))
      .filter((a) => !a.targetGames?.length || isOfficial || a.targetGames.includes(game))
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  }, [announcements, dismissed, enabled, isOfficial, role, game]);

  const current = visible[0];
  if (!current) return null;

  const level = LEVELS[current.level] || LEVELS.info;
  const dismiss = () => {
    const next = [...new Set([...dismissed, current.id])].slice(-30);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch (_) {}
  };
  const onClick = () => {
    trackEvent(ANALYTICS_EVENTS.ANNOUNCEMENT_CLICK, { id: current.id, level: current.level || "info" });
  };

  return (
    <div className={`border-b ${level.cls}`} role="region" aria-label="Annonce" data-testid="announcement-banner">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-2.5 flex items-start sm:items-center gap-3">
        <Megaphone size={15} className={`${level.badge} shrink-0 mt-0.5 sm:mt-0`} aria-hidden="true" />
        <div className="flex-1 min-w-0 text-sm">
          <span className={`font-display uppercase tracking-widest text-xs mr-2 ${level.badge}`} data-testid="announcement-banner-title">
            {current.title}
          </span>
          <span className="text-[#f7f7f7]/85">{current.message}</span>
          {current.link && (
            <Link
              to={current.link}
              onClick={onClick}
              data-testid="announcement-banner-link"
              className="ml-2 underline underline-offset-2 decoration-[#D8CA82]/60 hover:text-[#D8CA82] whitespace-nowrap"
            >
              {current.linkLabel || "En savoir plus"}
            </Link>
          )}
        </div>
        {current.dismissible !== false && (
          <button onClick={dismiss} aria-label="Masquer l'annonce" data-testid="announcement-banner-close"
            className="text-[#f7f7f7]/50 hover:text-[#f7f7f7] shrink-0">
            <X size={15} />
          </button>
        )}
      </div>
      {visible.length > 1 && (
        <span className="sr-only">{visible.length - 1} autre(s) annonce(s) disponible(s)</span>
      )}
    </div>
  );
};
