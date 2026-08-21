import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bell, BellRing, Clock } from "lucide-react";
import { useLang } from "../lib/i18n";
import { useAuth } from "../context/AuthContext";
import { createNotification } from "../lib/notify";

const REMINDERS_KEY = "elysium_match_reminders";

const matchTimestamp = (match) => {
  if (!match?.date) return null;
  const d = new Date(`${match.date}T${match.time ? match.time.slice(0, 5) : "20:00"}:00`);
  return isNaN(d.getTime()) ? null : d.getTime();
};

const getReminders = () => {
  try { return JSON.parse(localStorage.getItem(REMINDERS_KEY) || "{}"); }
  catch { return {}; }
};

const setReminders = (reminders) => {
  try { localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders)); }
  catch { /* stockage indisponible */ }
};

/**
 * Compte à rebours (jours / heures / minutes / secondes) avant un match.
 * Propose un rappel « notification in-app » : si l'utilisateur est connecté,
 * une notification est créée dans son espace (cloche) au moment du match ;
 * sinon un toast local s'affiche à la visite.
 */
export const MatchCountdown = ({ match, testId = "match-countdown" }) => {
  const { t } = useLang();
  const { user } = useAuth();
  const target = useMemo(() => matchTimestamp(match), [match]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  // Au montage, on traite les rappels arrivés à échéance.
  useEffect(() => {
    if (!match?.id) return;
    const reminders = getReminders();
    if (reminders[match.id]) {
      if (target && now >= target && Date.now() - target < 6 * 3600 * 1000) {
        if (user) {
          createNotification({
            targetUid: user.uid,
            type: "match_reminder",
            extra: match.opponentName || "",
            link: "/resultats",
          }).then(() => toast(t("reminder.fired")));
        } else {
          toast(t("reminder.fired"));
        }
        const next = { ...reminders };
        delete next[match.id];
        setReminders(next);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!target) return null;
  const diff = target - now;
  if (diff <= 0) return null;

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  const reminders = getReminders();
  const reminded = !!reminders[match?.id];

  const toggleReminder = () => {
    if (!match?.id) return;
    const next = { ...reminders };
    if (reminded) {
      delete next[match.id];
      setReminders(next);
      toast(t("reminder.off"));
    } else {
      next[match.id] = target;
      setReminders(next);
      toast(t("reminder.on"));
      if (!user) {
        toast(t("reminder.loginHint"), { duration: 6000 });
      }
    }
  };

  const parts = [
    { value: days, label: t("countdown.days") },
    { value: hours, label: t("countdown.hours") },
    { value: minutes, label: t("countdown.minutes") },
    { value: seconds, label: t("countdown.seconds") },
  ];

  return (
    <div className="flex items-center flex-wrap gap-3" data-testid={testId}>
      <div className="flex items-center gap-1.5 text-[#c8c8c8]">
        <Clock size={13} className="text-[#D8CA82]" aria-hidden="true" />
        <span className="text-xs uppercase tracking-[0.25em] text-[#f7f7f7]/50 mr-1">{t("countdown.before")}</span>
        {parts.map((p, i) => (
          <span key={p.label} className="flex items-center gap-1.5">
            <span className="font-display font-black text-lg text-[#f7f7f7] min-w-[2ch] text-center tabular-nums" title={p.label}>
              {String(p.value).padStart(2, "0")}
            </span>
            <span className="text-xs uppercase tracking-widest text-[#c8c8c8]">{p.label}</span>
            {i < parts.length - 1 && <span className="text-[#c8c8c8]">:</span>}
          </span>
        ))}
      </div>
      <button
        onClick={toggleReminder}
        data-testid={`${testId}-remind`}
        aria-pressed={reminded}
        className={`text-xs uppercase tracking-widest border px-2.5 py-1.5 flex items-center gap-1.5 transition-colors ${
          reminded
            ? "border-[#D8CA82] text-[#D8CA82] bg-[#D8CA82]/10"
            : "border-white/20 text-[#f7f7f7]/60 hover:border-[#D8CA82] hover:text-[#D8CA82]"
        }`}
      >
        {reminded ? <BellRing size={11} aria-hidden="true" /> : <Bell size={11} aria-hidden="true" />}
        {reminded ? t("reminder.active") : t("reminder.set")}
      </button>
    </div>
  );
};
