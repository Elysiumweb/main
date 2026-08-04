import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { CalendarX, Users } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";

const pad = (n) => String(n).padStart(2, "0");
const toDateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Bandeau compact (staff uniquement) : liste les joueurs absents aujourd'hui.
 * Alimenté par la collection `absences` (date du jour) + l'annuaire `profiles`.
 * Affiché dans l'en-tête de l'espace joueur pour un repérage immédiat.
 */
export const AbsentTodayBar = () => {
  const { canManage } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [absences, setAbsences] = useState([]);
  const [profiles, setProfiles] = useState([]);

  useEffect(() => {
    if (!canManage) return;
    const u1 = onSnapshot(collection(db, "absences"), (s) => setAbsences(s.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
    const u2 = onSnapshot(collection(db, "profiles"), (s) => setProfiles(s.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
    return () => { u1(); u2(); };
  }, [canManage]);

  const todayKey = toDateKey(new Date());
  const nameByUid = useMemo(() => {
    const m = new Map();
    profiles.forEach((p) => m.set(p.id, p.displayName || "?"));
    return m;
  }, [profiles]);

  const absentToday = useMemo(() =>
    absences
      .filter((a) => a.date === todayKey)
      .map((a) => ({ uid: a.uid, name: nameByUid.get(a.uid) || a.displayName || "?", reason: a.reason || "", game: a.game || null }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [absences, todayKey, nameByUid]);

  if (!canManage || absentToday.length === 0) return null;

  return (
    <button
      onClick={() => navigate("/espace-joueur/planning")}
      data-testid="absent-today-bar"
      className="w-full flex items-center gap-3 px-4 py-2 bg-[#8c1d18]/15 border-b border-red-400/25 hover:bg-[#8c1d18]/25 transition-colors text-left"
      title={t("player.absentToday.view")}
    >
      <CalendarX size={15} className="text-red-300 shrink-0" aria-hidden="true" />
      <span className="text-[10px] uppercase tracking-[0.2em] text-red-200/90 shrink-0 hidden sm:inline">{t("player.absentToday")}</span>
      <span className="flex items-center gap-1.5 flex-wrap">
        {absentToday.slice(0, 8).map((p) => (
          <span key={p.uid} className="flex items-center gap-1 text-xs text-[#f7f7f7]/80" data-testid={`absent-today-${p.uid}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" aria-hidden="true" />
            {p.name}
            {p.reason && <span className="text-[10px] text-[#f7f7f7]/40">— {p.reason}</span>}
          </span>
        ))}
        {absentToday.length > 8 && <span className="text-[10px] text-[#f7f7f7]/40">+{absentToday.length - 8}</span>}
      </span>
      <span className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-widest text-red-300/80 shrink-0">
        <Users size={11} aria-hidden="true" /> {absentToday.length} {t("player.absentToday.count")}
      </span>
    </button>
  );
};
