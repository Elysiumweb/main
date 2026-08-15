import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bell, BellRing, Clock, Loader2 } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { useLang } from "../lib/i18n";
import { useAuth } from "../context/AuthContext";
import { functions } from "../lib/firebase";

const REMINDERS_KEY = "elysium_match_reminders";
const REMIND_MINUTES_BEFORE = 15;

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
 *
 * Rappel :
 * - Connecté : le rappel est PLANIFIÉ CÔTÉ SERVEUR (Cloud Scheduler + FCM/email
 *   via les triggers notifications). Il arrive même navigateur fermé, à l'heure
 *   choisie, et peut être annulé.
 * - Anonyme : simple rappel LOCAL — un toast s'affiche à la prochaine visite
 *   une fois le match passé. C'est affiché honnêtement dans le libellé.
 */
export const MatchCountdown = ({ match, testId = "match-countdown" }) => {
  const { t } = useLang();
  const { user } = useAuth();
  const target = useMemo(() => matchTimestamp(match), [match]);
  const [now, setNow] = useState(() => Date.now());
  const [serverReminder, setServerReminder] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  // Rappel LOCAL (anonyme uniquement) : on traite les échéances au montage —
  // c'est un rappel « à la prochaine visite », pas un rappel programmé.
  useEffect(() => {
    if (!match?.id || user) return;
    const reminders = getReminders();
    if (reminders[match.id] && target && now >= target) {
      toast(t("reminder.fired"));
      const next = { ...reminders };
      delete next[match.id];
      setReminders(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, now, user, match?.id]);

  // Connecté : on lit l'état du rappel planifié côté serveur.
  useEffect(() => {
    if (!user || !match?.id) return;
    let cancelled = false;
    const call = httpsCallable(functions, "getMatchReminderState");
    call({ matchId: match.id })
      .then((res) => { if (!cancelled) setServerReminder(!!res.data?.active); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user, match?.id]);

  if (!target) return null;
  const diff = target - now;
  if (diff <= 0) return null;

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  const localReminded = !user && !!getReminders()[match?.id];
  const reminded = user ? serverReminder : localReminded;

  const toggleReminder = async () => {
    if (!match?.id) return;
    if (user) {
      setBusy(true);
      try {
        const call = httpsCallable(functions, reminded ? "cancelMatchReminder" : "scheduleMatchReminder");
        await call({ matchId: match.id, minutesBefore: REMIND_MINUTES_BEFORE });
        setServerReminder(!reminded);
        toast(reminded ? t("reminder.off") : t("reminder.on"));
      } catch (err) {
        console.error("reminder", err);
        toast.error(t("common.error"));
      } finally {
        setBusy(false);
      }
      return;
    }
    // Anonyme : rappel local « à la prochaine visite ».
    const next = { ...getReminders() };
    if (localReminded) delete next[match.id];
    else next[match.id] = target;
    setReminders(next);
    toast(localReminded ? t("reminder.off") : t("reminder.onLocal"));
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
        <span className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/50 mr-1">{t("countdown.before")}</span>
        {parts.map((p, i) => (
          <span key={p.label} className="flex items-center gap-1.5">
            <span className="font-display font-black text-lg text-[#f7f7f7] min-w-[2ch] text-center tabular-nums" title={p.label}>
              {String(p.value).padStart(2, "0")}
            </span>
            <span className="text-[9px] uppercase tracking-widest text-[#f7f7f7]/40">{p.label}</span>
            {i < parts.length - 1 && <span className="text-[#f7f7f7]/30">:</span>}
          </span>
        ))}
      </div>
      <button
        onClick={toggleReminder}
        disabled={busy}
        data-testid={`${testId}-remind`}
        aria-pressed={reminded}
        className={`text-[10px] uppercase tracking-widest border px-2.5 py-1.5 flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
          reminded
            ? "border-[#D8CA82] text-[#D8CA82] bg-[#D8CA82]/10"
            : "border-white/20 text-[#f7f7f7]/60 hover:border-[#D8CA82] hover:text-[#D8CA82]"
        }`}
      >
        {busy ? <Loader2 size={11} className="animate-spin" aria-hidden="true" /> : reminded ? <BellRing size={11} aria-hidden="true" /> : <Bell size={11} aria-hidden="true" />}
        {reminded ? t("reminder.active") : t("reminder.set")}
      </button>
    </div>
  );
};
