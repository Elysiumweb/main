import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { StickyNote, CalendarDays, LayoutDashboard, Activity } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";

const ICONS = { note: StickyNote, event: CalendarDays, canvas: LayoutDashboard };

export default function ActivityLog() {
  const { game, isOfficial } = useAuth();
  const { t } = useLang();
  const [items, setItems] = useState([]);

  useEffect(() => {
    return onSnapshot(collection(db, "activity"), (snap) => {
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!isOfficial) list = list.filter((a) => a.game === game || a.game === "global");
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setItems(list.slice(0, 50));
    }, console.error);
  }, [game, isOfficial]);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Activity size={16} className="text-[#D8CA82]" />
          <h2 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">{t("player.activity")}</h2>
        </div>
        {items.length === 0 ? (
          <p className="text-[#f7f7f7]/40" data-testid="activity-empty">{t("activity.empty")}</p>
        ) : (
          <div className="space-y-1.5" data-testid="activity-list">
            {items.map((a) => {
              const Icon = ICONS[a.type?.split("_")[0]] || Activity;
              return (
                <div key={a.id} className="flex items-center gap-4 border border-white/10 bg-[#1A1A1A] px-4 py-2.5" data-testid={`activity-${a.id}`}>
                  <Icon size={15} className="text-[#D8CA82] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#f7f7f7]/80 truncate">
                      <span className="text-[#D8CA82]">{t(`activity.${a.type}`)}</span> — {a.label}
                    </p>
                    <p className="text-[10px] text-[#f7f7f7]/35">
                      {a.byName} · {a.game}{a.createdAt?.toDate ? ` · ${a.createdAt.toDate().toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
