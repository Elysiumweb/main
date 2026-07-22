import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { CalendarDays, Trash2, Swords, Dumbbell, CircleDot, Megaphone, Check, X } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { GAMES } from "../../lib/constants";
import { createNotification, logActivity } from "../../lib/notify";

const inputCls = "w-full bg-[#111111] border border-white/20 px-3 py-2 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";
const typeIcons = { match: Swords, training: Dumbbell, convocation: Megaphone, other: CircleDot };

const addWeeks = (dateStr, weeks) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 7 * weeks);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function Planning() {
  const { user, game, isOfficial, canManage, role, displayName } = useAuth();
  const { t } = useLang();
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({ title: "", type: "training", date: "", description: "", game: game || "EVA", repeatWeeks: "0" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    return onSnapshot(collection(db, "events"), (snap) => {
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!isOfficial) list = list.filter((ev) => ev.game === game || ev.game === "global");
      list.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      setEvents(list);
    }, console.error);
  }, [game, isOfficial]);

  const add = async (e) => {
    e.preventDefault();
    try {
      const g = role === "manager" && !isOfficial ? game : form.game;
      const { repeatWeeks, ...data } = form;
      const repeats = Number(repeatWeeks) || 0;
      for (let i = 0; i <= repeats; i++) {
        await addDoc(collection(db, "events"), {
          ...data, date: i === 0 ? form.date : addWeeks(form.date, i),
          game: g, attendance: {}, createdBy: user.uid, createdByName: displayName, createdAt: serverTimestamp(),
        });
      }
      createNotification({ targetRoles: ["player", "manager", "bureau"], targetGame: g, type: "event_new", extra: form.title, link: "/espace-joueur/planning" });
      logActivity({ game: g, type: "event_created", label: form.title, byUid: user.uid, byName: displayName });
      setForm({ title: "", type: "training", date: "", description: "", game: game || "EVA", repeatWeeks: "0" });
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const del = async (id) => {
    try {
      const ev = events.find((x) => x.id === id);
      await deleteDoc(doc(db, "events", id));
      if (ev) logActivity({ game: ev.game, type: "event_deleted", label: ev.title, byUid: user.uid, byName: displayName });
    } catch (e) { toast.error(t("common.error")); }
  };

  const setAttendance = async (ev, val) => {
    try { await updateDoc(doc(db, "events", ev.id), { [`attendance.${user.uid}`]: val }); }
    catch (e) { console.error(e); toast.error(t("common.error")); }
  };

  const now = new Date().toISOString();
  const upcoming = events.filter((ev) => (ev.date || "") >= now.slice(0, 10));
  const past = events.filter((ev) => (ev.date || "") < now.slice(0, 10)).reverse();

  const EventRow = ({ ev }) => {
    const Icon = typeIcons[ev.type] || CircleDot;
    const d = ev.date ? new Date(ev.date) : null;
    const att = ev.attendance || {};
    const mine = att[user.uid];
    const yes = Object.values(att).filter((v) => v === "yes").length;
    const no = Object.values(att).filter((v) => v === "no").length;
    return (
      <div className="flex items-center gap-4 border border-white/10 bg-[#1A1A1A] px-4 py-3 group" data-testid={`event-${ev.id}`}>
        <div className="text-center shrink-0 w-14 border-r border-white/10 pr-3">
          <p className="font-display font-bold text-xl text-[#D8CA82]">{d ? d.getDate() : "—"}</p>
          <p className="text-[10px] uppercase text-[#f7f7f7]/40">{d ? d.toLocaleDateString("fr-FR", { month: "short" }) : ""}</p>
        </div>
        <Icon size={16} className={`shrink-0 ${ev.type === "convocation" ? "text-orange-300" : "text-[#D8CA82]"}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#f7f7f7] truncate">{ev.title}</p>
          <p className="text-xs text-[#f7f7f7]/40 truncate">
            {t(`planning.type.${ev.type}`)} · {ev.game === "global" ? "Global" : ev.game}
            {d ? ` · ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}
            {ev.description ? ` — ${ev.description}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0" data-testid={`event-attendance-${ev.id}`}>
          <button onClick={() => setAttendance(ev, "yes")} title={t("planning.attend.yes")} data-testid={`event-attend-yes-${ev.id}`}
            className={`flex items-center gap-1 border px-2 py-1 text-[10px] transition-colors ${mine === "yes" ? "border-emerald-400 text-emerald-300 bg-emerald-400/10" : "border-white/15 text-[#f7f7f7]/40 hover:text-emerald-300"}`}>
            <Check size={11} /> {yes}
          </button>
          <button onClick={() => setAttendance(ev, "no")} title={t("planning.attend.no")} data-testid={`event-attend-no-${ev.id}`}
            className={`flex items-center gap-1 border px-2 py-1 text-[10px] transition-colors ${mine === "no" ? "border-red-400 text-red-300 bg-red-400/10" : "border-white/15 text-[#f7f7f7]/40 hover:text-red-300"}`}>
            <X size={11} /> {no}
          </button>
        </div>
        {canManage && (
          <button onClick={() => del(ev.id)} data-testid={`event-delete-${ev.id}`}
            className="opacity-0 group-hover:opacity-100 text-red-400/70 hover:text-red-400 transition-opacity">
            <Trash2 size={15} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {canManage && (
          <form onSubmit={add} className="border border-white/10 bg-[#141414] p-5 grid sm:grid-cols-2 gap-4" data-testid="planning-form">
            <p className="sm:col-span-2 font-display text-sm uppercase tracking-[0.3em] text-[#D8CA82]">{t("planning.add")}</p>
            <input value={form.title} onChange={set("title")} placeholder={t("planning.title")} required className={inputCls} data-testid="planning-title-input" />
            <input type="datetime-local" value={form.date} onChange={set("date")} required className={inputCls} data-testid="planning-date-input" />
            <select value={form.type} onChange={set("type")} className={inputCls} data-testid="planning-type-select">
              <option value="training">{t("planning.type.training")}</option>
              <option value="match">{t("planning.type.match")}</option>
              <option value="convocation">{t("planning.type.convocation")}</option>
              <option value="other">{t("planning.type.other")}</option>
            </select>
            <select value={form.repeatWeeks} onChange={set("repeatWeeks")} className={inputCls} data-testid="planning-repeat-select">
              <option value="0">{t("planning.noRepeat")}</option>
              {[1, 2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>{t("planning.repeat")} × {n} {t("planning.weeks")}</option>)}
            </select>
            {(isOfficial || role === "bureau") ? (
              <select value={form.game} onChange={set("game")} className={inputCls} data-testid="planning-game-select">
                {GAMES.map((g) => <option key={g} value={g}>{g}</option>)}
                <option value="global">Global</option>
              </select>
            ) : (
              <input value={game || ""} disabled className={inputCls + " opacity-50"} />
            )}
            <input value={form.description} onChange={set("description")} placeholder={t("planning.desc")} className={inputCls + " sm:col-span-2"} data-testid="planning-desc-input" />
            <button type="submit" data-testid="planning-submit-btn"
              className="sm:col-span-2 bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-sm py-2.5 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
              {t("planning.add")}
            </button>
          </form>
        )}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <CalendarDays size={16} className="text-[#D8CA82]" />
            <h2 className="font-display text-sm uppercase tracking-[0.3em] text-[#f7f7f7]">{t("player.planning")}</h2>
          </div>
          {events.length === 0 ? (
            <p className="text-[#f7f7f7]/40" data-testid="planning-empty">{t("planning.empty")}</p>
          ) : (
            <div className="space-y-2" data-testid="planning-list">
              {upcoming.map((ev) => <EventRow key={ev.id} ev={ev} />)}
              {past.length > 0 && <p className="text-xs uppercase tracking-widest text-[#f7f7f7]/30 pt-4">Passés</p>}
              {past.map((ev) => <EventRow key={ev.id} ev={ev} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
