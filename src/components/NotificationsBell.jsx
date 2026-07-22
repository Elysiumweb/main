import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot, doc, updateDoc, arrayUnion, limit } from "firebase/firestore";
import { Bell } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export const NotificationsBell = () => {
  const { user, role, game, isOfficial, hasPlayerAccess } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [direct, setDirect] = useState([]);
  const [roleNotifs, setRoleNotifs] = useState([]);

  useEffect(() => {
    if (!user) return;
    const ref = collection(db, "notifications");
    const u1 = onSnapshot(query(ref, where("targetUid", "==", user.uid), limit(30)),
      (s) => setDirect(s.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
    let u2 = () => {};
    if (hasPlayerAccess) {
      u2 = onSnapshot(query(ref, where("targetRoles", "array-contains", isOfficial ? "bureau" : role), limit(30)),
        (s) => setRoleNotifs(s.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
    } else setRoleNotifs([]);
    return () => { u1(); u2(); };
  }, [user, role, hasPlayerAccess, isOfficial]);

  const notifs = useMemo(() => {
    const map = new Map();
    [...direct, ...roleNotifs].forEach((n) => map.set(n.id, n));
    return [...map.values()]
      .filter((n) => !n.targetGame || isOfficial || n.targetGame === game || n.targetGame === "global")
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 20);
  }, [direct, roleNotifs, game, isOfficial]);

  if (!user) return null;
  const unread = notifs.filter((n) => !(n.readBy || []).includes(user.uid));

  const markAllRead = () => {
    unread.forEach((n) => updateDoc(doc(db, "notifications", n.id), { readBy: arrayUnion(user.uid) }).catch(console.error));
  };

  const open = (n) => {
    updateDoc(doc(db, "notifications", n.id), { readBy: arrayUnion(user.uid) }).catch(console.error);
    navigate(n.link || "/");
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative text-[#f7f7f7]/60 hover:text-[#D8CA82] transition-colors" data-testid="notifications-bell" title={t("notif.title")}>
          <Bell size={18} />
          {unread.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-[#D8CA82] text-[#111111] text-[9px] font-bold min-w-[15px] h-[15px] flex items-center justify-center px-0.5" data-testid="notifications-badge">
              {unread.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 bg-[#161616] border border-[#D8CA82]/25 rounded-none p-0 text-[#f7f7f7]" data-testid="notifications-panel">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <p className="font-display text-xs uppercase tracking-[0.25em] text-[#D8CA82]">{t("notif.title")}</p>
          {unread.length > 0 && (
            <button onClick={markAllRead} className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/50 hover:text-[#D8CA82]" data-testid="notifications-mark-read">
              {t("notif.markRead")}
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifs.length === 0 ? (
            <p className="text-sm text-[#f7f7f7]/40 px-4 py-6" data-testid="notifications-empty">{t("notif.empty")}</p>
          ) : notifs.map((n) => {
            const isUnread = !(n.readBy || []).includes(user.uid);
            return (
              <button key={n.id} onClick={() => open(n)} data-testid={`notification-${n.id}`}
                className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${isUnread ? "bg-[#D8CA82]/5" : ""}`}>
                <p className={`text-sm ${isUnread ? "text-[#f7f7f7]" : "text-[#f7f7f7]/50"}`}>
                  {isUnread && <span className="inline-block w-1.5 h-1.5 bg-[#D8CA82] mr-2 align-middle" />}
                  {t(`notif.${n.type}`)}{n.extra ? ` — ${n.extra}` : ""}
                </p>
                <p className="text-[10px] text-[#f7f7f7]/30 mt-0.5">
                  {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                </p>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
