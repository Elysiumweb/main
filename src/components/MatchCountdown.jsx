import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bell, BellRing, Clock, Mail, Smartphone } from "lucide-react";
import { useLang } from "../lib/i18n";
import { useAuth } from "../context/AuthContext";
import { createNotification } from "../lib/notify";
import { canUsePush, subscribeToPush } from "../lib/push";
import { httpsCallable } from "firebase/functions";
import { functions, db } from "../lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

const REMINDERS_KEY = "elysium_match_reminders";
const EMAIL_ALERTS_KEY = "elysium_match_email_alerts";

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

const getEmailAlerts = () => {
  try { return JSON.parse(localStorage.getItem(EMAIL_ALERTS_KEY) || "{}"); }
  catch { return {}; }
};
const setEmailAlerts = (obj) => {
  try { localStorage.setItem(EMAIL_ALERTS_KEY, JSON.stringify(obj)); }
  catch {}
};

/**
 * Compte à rebours (jours / heures / minutes / secondes) avant un match.
 * Propose un rappel « notification in-app » : si l'utilisateur est connecté,
 * une notification est créée dans son espace (cloche) au moment du match ;
 * sinon un toast local s'affiche à la visite.
 * Pour les visiteurs non connectés : abonnement par email (newsletter) ou push anonyme.
 */
export const MatchCountdown = ({ match, testId = "match-countdown" }) => {
  const { t } = useLang();
  const { user } = useAuth();
  const target = useMemo(() => matchTimestamp(match), [match]);
  const [now, setNow] = useState(() => Date.now());
  const [email, setEmail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  useEffect(()=>{
    canUsePush().then(setPushSupported).catch(()=> setPushSupported(false));
    try {
      const alerts = getEmailAlerts();
      if (alerts[match?.id]) setShowEmail(false);
    } catch {}
  }, [match]);

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
        setShowEmail(true);
      }
    }
  };

  const handleEmailSubscribe = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Email invalide");
      return;
    }
    try {
      // 1) Inscription newsletter existante (double opt-in)
      try {
        const fn = httpsCallable(functions, "subscribeNewsletter");
        await fn({ email: trimmed, consent: true, lang: "fr", website: "" });
      } catch (e) { console.warn("newsletter callable failed", e); }
      // 2) Alerte spécifique au match (collection matchAlerts, règles publiques)
      try {
        await addDoc(collection(db, "matchAlerts"), {
          email: trimmed,
          matchId: match.id,
          opponentName: match.opponentName || "",
          matchDate: match.date || "",
          createdAt: serverTimestamp(),
        });
      } catch (e) { console.warn("matchAlerts write failed", e); }
      const alerts = getEmailAlerts();
      alerts[match.id] = { email: trimmed, date: new Date().toISOString() };
      setEmailAlerts(alerts);
      toast.success("Alerte par email activée — vous recevrez un rappel avant le match.");
      setShowEmail(false);
    } catch (err) {
      console.error(err);
      const alerts = getEmailAlerts();
      alerts[match.id] = { email: trimmed, date: new Date().toISOString(), localOnly: true };
      setEmailAlerts(alerts);
      toast.success("Rappel local enregistré + email noté (envoi si service disponible).");
      setShowEmail(false);
    }
  };

  const handleAnonymousPush = async () => {
    try {
      const localUid = localStorage.getItem("elysium_anon_uid") || `anon_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("elysium_anon_uid", localUid);
      const token = await subscribeToPush({ uid: localUid });
      localStorage.setItem("elysium_anon_push_token", token);
      setPushEnabled(true);
      toast.success("Notifications push activées pour ce navigateur (rappel match).");
    } catch (e) {
      console.error(e);
      toast.error("Push non disponible — utilisez l'alerte email.");
    }
  };

  const parts = [
    { value: days, label: t("countdown.days") },
    { value: hours, label: t("countdown.hours") },
    { value: minutes, label: t("countdown.minutes") },
    { value: seconds, label: t("countdown.seconds") },
  ];

  const emailAlerts = getEmailAlerts();
  const hasEmailAlert = !!emailAlerts[match?.id];

  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <div className="flex items-center flex-wrap gap-3">
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
        {!user && pushSupported && (
          <button onClick={handleAnonymousPush} data-testid={`${testId}-push-anon`} className={`text-xs uppercase tracking-widest border px-2.5 py-1.5 flex items-center gap-1.5 ${pushEnabled ? "border-[#D8CA82] text-[#D8CA82] bg-[#D8CA82]/10" : "border-white/15 text-[#c8c8c8] hover:text-[#D8CA82]"}`}>
            <Smartphone size={11}/> Push anonyme
          </button>
        )}
      </div>

      {showEmail && !user && (
        <form onSubmit={handleEmailSubscribe} className="flex flex-wrap items-center gap-2 border border-[#D8CA82]/20 bg-[#D8CA82]/5 px-3 py-2" data-testid={`${testId}-email-form`}>
          <Mail size={12} className="text-[#D8CA82]"/>
          <span className="text-xs text-[#D8CA82]">Recevoir l'alerte par email (visiteur) :</span>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="votre@email.fr" required className="bg-[#111111] border border-white/20 px-2 py-1 text-xs text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" data-testid={`${testId}-email-input`} />
          <button type="submit" className="bg-[#D8CA82] text-[#111111] text-xs uppercase tracking-widest px-3 py-1 font-bold">Activer</button>
          <button type="button" onClick={()=> setShowEmail(false)} className="text-xs text-[#c8c8c8] hover:text-[#f7f7f7]">Fermer</button>
        </form>
      )}
      {hasEmailAlert && (
        <p className="text-xs text-[#D8CA82]/80">✓ Alerte email active pour ce match : {emailAlerts[match.id]?.email || "enregistrée"}</p>
      )}
      {!user && reminded && !hasEmailAlert && (
        <p className="text-xs text-[#c8c8c8]">{t("reminder.loginHint")} Vous pouvez aussi ajouter une alerte par email ci-dessus (infrastructure newsletter existante) ou push anonyme.</p>
      )}
    </div>
  );
};
