import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";
import { CalendarCheck, MapPin, Users } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { callProtected, protectedErrorMessage } from "../lib/secureForms";
import { checkSessionRateLimit, rateLimitMessage } from "../lib/antiSpam";
import { fmtTryoutStart, isTryoutBookable, tryoutRemaining } from "../lib/recruitment";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";

/**
 * Créneaux d'essai publics + réservation.
 * ----------------------------------------------------------------------------
 * Avant, rien dans le planning privé n'était relié au recrutement : un essai
 * dument organisé n'existait nulle part côté candidat. Un créneau est un document
 * `tryoutSlots/{id}` (date, jeu, capacité, consignes) éventuellement adossé à un
 * événement du planning staff (`eventId`). La réservation passe par la Cloud
 * Function `bookTryoutSlot` (capacité vérifiée en transaction) et ouvre
 * automatiquement l'étape « Essai / Entretien » du dossier de candidature.
 */
export const TryoutList = ({ onBooked }) => {
  const { user } = useAuth();
  const { t, lang } = useLang();
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState({});
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    return onSnapshot(
      collection(db, "tryoutSlots"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => {
          const da = a.start?.toDate ? a.start.toDate().getTime() : new Date(a.start || 0).getTime();
          const dbb = b.start?.toDate ? b.start.toDate().getTime() : new Date(b.start || 0).getTime();
          return da - dbb;
        });
        setSlots(list);
      },
      (err) => console.error("tryoutSlots sync", err)
    );
  }, []);

  /* Réservations du candidat connecté : une lecture par créneau (règles Firestore
     : un candidat ne voit que sa propre réservation, le staff voit tout). */
  const loadBookings = useCallback(async (ids) => {
    if (!user || !ids.length) return;
    try {
      const results = await Promise.all(
        ids.map(async (id) => {
          const snap = await getDoc(doc(db, "tryoutSlots", id, "bookings", user.uid));
          return [id, snap.exists()];
        })
      );
      setBookings((prev) => ({ ...prev, ...Object.fromEntries(results) }));
    } catch (err) {
      console.error("tryout bookings", err);
    }
  }, [user]);

  useEffect(() => { loadBookings(slots.map((s) => s.id)); }, [slots, loadBookings]);

  const upcoming = useMemo(
    () => slots.filter((s) => {
      const start = s.start?.toDate ? s.start.toDate().getTime() : new Date(s.start || 0).getTime();
      return start > Date.now() && s.open !== false;
    }),
    [slots]
  );

  const book = async (slot) => {
    const limit = checkSessionRateLimit("tryout_booking", { max: 5, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) { toast.error(rateLimitMessage(limit.retryAt)); return; }
    setBusyId(slot.id);
    try {
      const result = await callProtected("bookTryoutSlot", { slotId: slot.id });
      setBookings((prev) => ({ ...prev, [slot.id]: true }));
      trackEvent(ANALYTICS_EVENTS.TRYOUT_BOOKED, { slotId: slot.id, game: slot.game || "" });
      toast.success(t("recruit.tryout.booked"));
      onBooked?.(result);
    } catch (err) {
      console.error(err);
      toast.error(protectedErrorMessage(err, t("common.error")));
    } finally {
      setBusyId(null);
    }
  };

  if (upcoming.length === 0) {
    return (
      <p className="text-[#c8c8c8] border border-white/10 bg-[#141414] p-5" data-testid="recruit-tryout-empty">
        {t("recruit.tryout.empty")}
      </p>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-6" data-testid="recruit-tryout-list">
      {upcoming.map((slot) => {
        const remaining = tryoutRemaining(slot);
        const bookable = isTryoutBookable(slot);
        const mine = !!bookings[slot.id];
        return (
          <article key={slot.id} className="border border-white/10 bg-[#1A1A1A] p-6 flex flex-col gap-4" data-testid={`recruit-tryout-${slot.id}`}>
            <div className="flex items-start justify-between gap-3">
              <p className="font-display font-bold text-[#f7f7f7]">{slot.title}</p>
              {slot.game && (
                <span className="text-xs font-display tracking-[0.25em] uppercase text-[#D8CA82] border border-[#D8CA82]/40 px-2 py-0.5 shrink-0">
                  {slot.game}
                </span>
              )}
            </div>

            <p className="text-sm text-[#f7f7f7]/80 flex items-center gap-2">
              <CalendarCheck size={14} className="text-[#D8CA82]" aria-hidden="true" />
              {fmtTryoutStart(slot, lang)}
              {Number(slot.durationMin) > 0 && ` · ${slot.durationMin} min`}
            </p>

            {slot.location && (
              <p className="text-sm text-[#c8c8c8] flex items-center gap-2">
                <MapPin size={14} className="text-[#D8CA82]/80" aria-hidden="true" />
                {/^https?:\/\//.test(slot.location) ? (
                  <a href={slot.location} target="_blank" rel="noopener noreferrer" className="text-[#D8CA82] hover:underline break-all">
                    {slot.location}
                  </a>
                ) : (
                  slot.location
                )}
              </p>
            )}

            {slot.instructions && (
              <p className="text-sm text-[#c8c8c8]/70 leading-relaxed">
                <span className="text-[#D8CA82]/80 text-xs uppercase tracking-wider">{t("recruit.tryout.instructions")} :</span>{" "}
                {slot.instructions}
              </p>
            )}

            <div className="mt-auto pt-3 border-t border-white/10 flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs text-[#c8c8c8] flex items-center gap-1.5">
                <Users size={12} aria-hidden="true" />
                {bookable ? (remaining === null ? `${slot.capacity || "∞"} ${t("recruit.tryout.unlimited")}` : `${remaining} ${t("recruit.tryout.remaining")}`) : t("recruit.tryout.full")}
              </span>

              {mine ? (
                <span className="text-xs font-display uppercase tracking-widest text-emerald-300 border border-emerald-300/40 px-3 py-2" data-testid={`recruit-tryout-booked-${slot.id}`}>
                  ✓ {t("recruit.tryout.booked")}
                </span>
              ) : !user ? (
                <Link to="/connexion" state={{ from: { pathname: "/recrutement" } }}
                  className="focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82] text-xs font-display uppercase tracking-widest text-[#D8CA82] hover:underline" data-testid={`recruit-tryout-login-${slot.id}`}>
                  {t("nav.login")} → {t("recruit.tryout.book")}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => book(slot)}
                  disabled={!bookable || busyId === slot.id}
                  data-testid={`recruit-tryout-book-${slot.id}`}
                  className="focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82] bg-[#D8CA82] text-[#111111] text-xs font-display font-bold uppercase tracking-widest px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-[0_0_12px_rgba(216,202,130,0.4)] transition-shadow"
                >
                  {bookable ? t("recruit.tryout.book") : t("recruit.tryout.full")}
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
};