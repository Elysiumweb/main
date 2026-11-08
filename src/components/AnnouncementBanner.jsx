import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { AlertTriangle, CheckCircle2, Info, Megaphone, X } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { useAdminT } from "../lib/adminI18n";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";

const LEVELS = {
  info: { cls: "border-[#D8CA82]/40 bg-[#D8CA82]/10 text-[#f7f7f7]", Icon: Info, accent: "text-[#D8CA82]" },
  success: { cls: "border-emerald-400/40 bg-emerald-400/10 text-[#f7f7f7]", Icon: CheckCircle2, accent: "text-emerald-300" },
  warning: { cls: "border-amber-400/40 bg-amber-400/10 text-[#f7f7f7]", Icon: AlertTriangle, accent: "text-amber-300" },
  critical: { cls: "border-red-400/50 bg-red-400/10 text-[#f7f7f7]", Icon: Megaphone, accent: "text-red-300" },
};

const DISMISS_KEY = "elysium_announcement_dismissed";
const dismissedIds = () => {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]"); } catch { return []; }
};
const dismiss = (id) => {
  try {
    const next = [...new Set([...dismissedIds(), id])].slice(-30);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
  } catch { /* stockage indisponible */ }
};

const isVisibleFor = (announcement, { role, game, hasPlayerAccess }) => {
  if (!announcement?.active || announcement.banner === false) return false;
  const now = Date.now();
  if (announcement.startsAt && Date.parse(announcement.startsAt) > now) return false;
  if (announcement.expiresAt && Date.parse(announcement.expiresAt) < now) return false;
  const audience = announcement.audience || "all";
  if (audience !== "all") {
    if (audience === "visitor" && hasPlayerAccess) return false;
    if (audience !== "visitor" && audience !== role) return false;
  }
  const targetGame = announcement.targetGame || announcement.game || "all";
  if (targetGame !== "all" && targetGame && game && targetGame !== game) return false;
  if (targetGame !== "all" && targetGame && !game) return false;
  return true;
};

/**
 * Bannière d'annonce publique, pilotée depuis l'admin (`announcements`).
 * Un bandeau par visite au maximum : la fermeture est mémorisée par annonce.
 */
export const AnnouncementBanner = () => {
  const { role, game, hasPlayerAccess, user } = useAuth();
  const { lang } = useLang();
  const tx = useAdminT();
  const [items, setItems] = useState([]);
  const [closed, setClosed] = useState(() => dismissedIds());
  const seen = useRef(new Set());

  useEffect(() => {
    // Lecture publique des annonces actives uniquement (règles Firestore).
    return onSnapshot(query(collection(db, "announcements"), where("active", "==", true), limit(10)),
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setItems([]));
  }, []);

  const candidate = useMemo(() => {
    const visible = items
      .filter((a) => isVisibleFor(a, { role: user ? role : "visitor", game, hasPlayerAccess: !!user && hasPlayerAccess }))
      .filter((a) => !closed.includes(a.id))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    return visible[0] || null;
  }, [items, role, game, hasPlayerAccess, user, closed]);

  useEffect(() => {
    if (!candidate || seen.current.has(candidate.id)) return;
    seen.current.add(candidate.id);
    trackEvent(ANALYTICS_EVENTS.ANNOUNCEMENT_VIEW, { announcementId: candidate.id, level: candidate.level || "info" });
  }, [candidate]);

  if (!candidate) return null;
  const level = LEVELS[candidate.level] || LEVELS.info;
  const { Icon } = level;

  const close = () => {
    dismiss(candidate.id);
    setClosed(dismissedIds());
  };

  return (
    <div className={`border-b ${level.cls}`} role="region" aria-label={tx("ann.banner.dismiss")} data-testid="announcement-banner">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3 flex items-start sm:items-center gap-3">
        <Icon size={16} className={`${level.accent} shrink-0 mt-0.5 sm:mt-0`} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[#f7f7f7]">
            <span className="font-display uppercase tracking-widest text-xs text-[#D8CA82] mr-2">{candidate.title}</span>
            <span className="text-[#c8c8c8]">{candidate.body}</span>
          </p>
        </div>
        {candidate.link && (
          <Link to={candidate.link} onClick={() => trackEvent(ANALYTICS_EVENTS.ANNOUNCEMENT_CLICK, { announcementId: candidate.id })}
            data-testid="announcement-banner-link"
            className="text-xs font-display font-bold uppercase tracking-widest text-[#D8CA82] hover:underline shrink-0">
            {lang === "en" ? "Learn more" : "En savoir plus"} →
          </Link>
        )}
        <button type="button" onClick={close} data-testid="announcement-banner-close"
          aria-label={tx("ann.banner.dismiss")} title={tx("ann.banner.dismiss")}
          className="text-[#c8c8c8] hover:text-[#f7f7f7] shrink-0">
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
