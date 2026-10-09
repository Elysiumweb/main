import { useEffect, useState } from "react";
import { collection, doc, getDocs, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { CalendarPlus, Pencil, Trash2, Users } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { GAMES, getGameColor } from "../../lib/constants";
import { fmtTryoutStart } from "../../lib/recruitment";
import { ConfirmAction } from "../ConfirmAction";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const EMPTY = { title: "", game: "EVA", start: "", durationMin: 90, capacity: 8, location: "", instructions: "", open: true, createEvent: true };

/** datetime-local → ISO (le planning stocke des ISO). */
const toIso = (local, durationMin) => {
  const d = new Date(local);
  if (isNaN(d.getTime())) return null;
  const end = new Date(d.getTime() + (Number(durationMin) || 60) * 60000);
  return { start: d.toISOString(), end: end.toISOString() };
};
/** ISO → valeur lisible pour un input datetime-local. */
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Tryouts — créneaux d'essai ouverts au public.
 * ----------------------------------------------------------------------------
 * Un créneau d'essai est à la fois une offre publique (page /recrutement) et un
 * rendez-vous d'équipe : à la création on peut le pousser dans le planning privé
 * (`events`), ce qui manquait auparavant — un essai n'existait nulle part. Le
 * champ `eventId` fait le lien dans les deux sens.
 */
export const AdminTryouts = () => {
  const { t, lang } = useLang();
  const [slots, setSlots] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [bookings, setBookings] = useState({});
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    return onSnapshot(
      collection(db, "tryoutSlots"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => new Date(a.start?.toDate?.() || a.start || 0) - new Date(b.start?.toDate?.() || b.start || 0));
        setSlots(list);
      },
      (err) => console.error("tryoutSlots sync (admin)", err)
    );
  }, []);

  // Réservations par créneau (staff uniquement — règle Firestore).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entries = await Promise.all(
          slots.map(async (s) => {
            try {
              const snap = await getDocs(collection(db, "tryoutSlots", s.id, "bookings"));
              return [s.id, snap.docs.map((d) => d.data())];
            } catch (err) {
              console.error("bookings", s.id, err);
              return [s.id, null];
            }
          })
        );
        if (!cancelled) setBookings(Object.fromEntries(entries));
      } catch (err) {
        console.error(err);
      }
    })();
    return () => { cancelled = true; };
  }, [slots]);

  const submit = async (e) => {
    e.preventDefault();
    const range = toIso(form.start, form.durationMin);
    if (!range) { toast.error(t("admin.tryout.invalidStart")); return; }
    const payload = {
      title: form.title.trim(),
      game: form.game,
      start: range.start,
      end: range.end,
      durationMin: Number(form.durationMin) || 90,
      capacity: Number(form.capacity) || 0,
      location: form.location.trim(),
      instructions: form.instructions.trim(),
      open: form.open === "true" || form.open === true,
      updatedAt: serverTimestamp(),
    };
    try {
      if (editId) {
        await updateDoc(doc(db, "tryoutSlots", editId), payload);
        setForm(EMPTY); setEditId(null);
        toast.success(t("common.saved"));
        return;
      }
      const ref = await addDoc(collection(db, "tryoutSlots"), { ...payload, bookedCount: 0, createdAt: serverTimestamp() });
      // Planning privé : l'essai devient un vrai événement d'équipe.
      if (form.createEvent) {
        const eventRef = await addDoc(collection(db, "events"), {
          title: `Tryout — ${payload.title}`,
          description: payload.instructions || "",
          color: getGameColor(payload.game),
          game: payload.game,
          roster: null,
          start: payload.start,
          end: payload.end,
          allDay: false,
          type: "tryout",
          tryoutSlotId: ref.id,
          attendance: {},
          createdAt: serverTimestamp(),
        });
        await updateDoc(ref, { eventId: eventRef.id });
        toast.success(t("admin.tryout.eventCreated"));
      } else {
        toast.success(t("common.saved"));
      }
      setForm(EMPTY);
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    }
  };

  const edit = (s) => {
    setEditId(s.id);
    setForm({
      title: s.title || "",
      game: s.game || "EVA",
      start: toLocalInput(s.start?.toDate ? s.start.toDate().toISOString() : s.start),
      durationMin: String(s.durationMin ?? 90),
      capacity: String(s.capacity ?? 8),
      location: s.location || "",
      instructions: s.instructions || "",
      open: String(s.open !== false),
      createEvent: false,
    });
  };

  const del = async (s) => {
    try { await deleteDoc(doc(db, "tryoutSlots", s.id)); } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-10">
      <form onSubmit={submit} className="lg:col-span-5 space-y-4 border border-white/10 bg-[#1A1A1A] p-6" data-testid="admin-tryouts-form">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">
          {editId ? t("admin.tryout.edit") : t("admin.tryout.add")}
        </p>
        <div>
          <label htmlFor="admin-tryout-title" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("admin.tryout.title")}</label>
          <input id="admin-tryout-title" value={form.title} onChange={set("title")} required className={inputCls} data-testid="admin-tryout-title" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="admin-tryout-game" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("admin.help.game")}</label>
            <select id="admin-tryout-game" value={form.game} onChange={set("game")} className={inputCls} data-testid="admin-tryout-game">
              {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="admin-tryout-open" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("admin.help.published")}</label>
            <select id="admin-tryout-open" value={form.open} onChange={set("open")} className={inputCls} data-testid="admin-tryout-open">
              <option value="true">{t("status.open")}</option>
              <option value="false">{t("status.closed")}</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="admin-tryout-start" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("admin.tryout.start")}</label>
            <input id="admin-tryout-start" type="datetime-local" value={form.start} onChange={set("start")} required className={inputCls} data-testid="admin-tryout-start" />
          </div>
          <div>
            <label htmlFor="admin-tryout-duration" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("admin.tryout.duration")}</label>
            <input id="admin-tryout-duration" type="number" min="15" step="15" value={form.durationMin} onChange={set("durationMin")} className={inputCls} data-testid="admin-tryout-duration" />
          </div>
        </div>
        <div>
          <label htmlFor="admin-tryout-capacity" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("admin.tryout.capacity")}</label>
          <input id="admin-tryout-capacity" type="number" min="0" value={form.capacity} onChange={set("capacity")} className={inputCls} data-testid="admin-tryout-capacity" />
        </div>
        <div>
          <label htmlFor="admin-tryout-location" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("admin.tryout.location")}</label>
          <input id="admin-tryout-location" value={form.location} onChange={set("location")} placeholder="Discord vocal #tryouts" className={inputCls} data-testid="admin-tryout-location" />
        </div>
        <div>
          <label htmlFor="admin-tryout-instructions" className="text-xs uppercase tracking-[0.2em] text-[#c8c8c8] block mb-2">{t("admin.tryout.instructions")}</label>
          <textarea id="admin-tryout-instructions" value={form.instructions} onChange={set("instructions")} rows={3} className={inputCls} data-testid="admin-tryout-instructions" />
        </div>
        <label htmlFor="admin-tryout-create-event" className="flex items-start gap-3 cursor-pointer">
          <input id="admin-tryout-create-event" type="checkbox" checked={form.createEvent} onChange={(e) => setForm((f) => ({ ...f, createEvent: e.target.checked }))}
            className="mt-1 accent-[#D8CA82]" data-testid="admin-tryout-create-event" />
          <span className="text-xs text-[#c8c8c8] leading-relaxed">{t("admin.tryout.createEvent")}</span>
        </label>
        <div className="flex gap-3 flex-wrap">
          <button type="submit" data-testid="admin-tryout-submit"
            className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm px-8 py-3 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
            {t("notes.save")}
          </button>
          {editId && (
            <button type="button" onClick={() => { setEditId(null); setForm(EMPTY); }} data-testid="admin-tryout-cancel"
              className="border border-white/25 text-[#f7f7f7]/70 text-xs uppercase tracking-widest px-5">{t("common.cancel")}</button>
          )}
        </div>
      </form>

      <div className="lg:col-span-7 space-y-2" data-testid="admin-tryouts-list">
        {slots.length === 0 && <p className="text-[#c8c8c8]">{t("admin.tryout.empty")}</p>}
        {slots.map((s) => {
          const list = bookings[s.id];
          return (
            <div key={s.id} className="border border-white/10 bg-[#1A1A1A] px-4 py-3 flex items-start gap-4">
              <span className={`text-[10px] uppercase tracking-widest border px-2 py-0.5 shrink-0 mt-0.5 ${s.open !== false ? "text-emerald-300 border-emerald-300/40" : "text-[#c8c8c8] border-white/20"}`}>
                {s.open !== false ? t("status.open") : t("status.closed")}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#f7f7f7]">{s.title}</p>
                <p className="text-xs text-[#c8c8c8]">
                  {s.game} · {fmtTryoutStart(s, lang)} · {s.capacity > 0 ? `${s.bookedCount || 0}/${s.capacity}` : `${s.bookedCount || 0} ${t("recruit.tryout.unlimited")}`}
                </p>
                <p className="text-[11px] text-[#c8c8c8]/60 mt-1 flex items-center gap-1.5">
                  <Users size={11} aria-hidden="true" />
                  {list === null
                    ? t("admin.tryout.bookingsDenied")
                    : list.length === 0
                      ? t("admin.tryout.noBookings")
                      : `${t("admin.tryout.bookings")} : ${list.map((b) => b.title || b.uid).join(", ")}`}
                  {s.eventId && <span className="text-[#D8CA82]/70">· {t("admin.tryout.eventExists")}</span>}
                </p>
              </div>
              <button onClick={() => edit(s)} title={t("admin.edit")} aria-label={`${t("admin.edit")} ${s.title}`} className="text-[#D8CA82]/70 hover:text-[#D8CA82]" data-testid={`admin-tryout-edit-${s.id}`}><Pencil size={15} /></button>
              <ConfirmAction
                title={t("admin.tryout.deleteTitle")}
                description={t("admin.tryout.deleteDesc")}
                confirmLabel={t("common.delete")}
                onConfirm={() => del(s)}
              >
                <button className="text-red-400/70 hover:text-red-400" title={t("common.delete")} aria-label={`${t("common.delete")} ${s.title}`} data-testid={`admin-tryout-delete-${s.id}`}><Trash2 size={15} /></button>
              </ConfirmAction>
            </div>
          );
        })}
        <p className="flex items-center gap-2 text-xs text-[#c8c8c8]/60 pt-2">
          <CalendarPlus size={13} aria-hidden="true" /> {t("admin.tryout.createEvent")}
        </p>
      </div>
    </div>
  );
};