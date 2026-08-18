import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";
import {
  CalendarDays, Download, ExternalLink, Trophy, Dumbbell, Radio, PartyPopper,
  List, Grid3X3, ChevronLeft, ChevronRight, Check, UserPlus, UserCheck, Link2,
} from "lucide-react";
import { db } from "../lib/firebase";
import { callProtected, protectedErrorMessage } from "../lib/secureForms";
import { useLang } from "../lib/i18n";
import { useAuth } from "../context/AuthContext";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { SITE_URL } from "../lib/useSEO";
import { downloadICS, gcalUrl, buildICSSubscribeUrl, matchToCalendarEvent } from "../lib/calendar";
import { PageBreadcrumb } from "../components/PageBreadcrumb";
import { GAMES, ROSTERS } from "../lib/constants";
import { Link } from "react-router-dom";
import { matchDetailUrl } from "../lib/constants";

const TYPE_ICONS = { tournament: Trophy, training: Dumbbell, stream: Radio, community: PartyPopper };
const TYPE_COLORS = { tournament: "#D8CA82", training: "#4FC3F7", stream: "#E53935", community: "#81C784" };
const TYPES = ["tournament", "training", "stream", "community"];

const getLegacyAnonId = () => {
  try { return localStorage.getItem("elysium_anon_id") || ""; } catch { return ""; }
};
const rsvpReceiptKey = (eventId) => `elysium_rsvp_${eventId}`;
const readRsvpReceipt = (eventId) => {
  try {
    const raw = localStorage.getItem(rsvpReceiptKey(eventId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const writeRsvpReceipt = (eventId, receipt) => {
  try {
    if (receipt) localStorage.setItem(rsvpReceiptKey(eventId), JSON.stringify(receipt));
    else localStorage.removeItem(rsvpReceiptKey(eventId));
  } catch { }
};

const MonthGrid = ({ events, selectedDate, onSelect, t, lang }) => {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const out = [];
    for (let i = 0; i < offset; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = {};
    events.forEach((ev) => {
      const d = ev.date ? new Date(ev.date) : null;
      if (!d) return;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    return map;
  }, [events]);

  const monthLabel = cursor.toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", { month: "long", year: "numeric" });

  return (
    <div data-testid="cal-month-view">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label={t("cal.month.prev")} data-testid="cal-month-prev"
          className="border border-white/15 text-[#f7f7f7]/60 p-2 hover:border-[#D8CA82] hover:text-[#D8CA82] transition-colors"><ChevronLeft size={15} /></button>
        <p className="font-display uppercase tracking-[0.3em] text-[#f7f7f7] text-sm">{monthLabel}</p>
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label={t("cal.month.next")} data-testid="cal-month-next"
          className="border border-white/15 text-[#f7f7f7]/60 p-2 hover:border-[#D8CA82] hover:text-[#D8CA82] transition-colors"><ChevronRight size={15} /></button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-white/10 border border-white/10" role="grid" aria-label={monthLabel}>
        {(lang === "en" ? ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] : ["L", "M", "M", "J", "V", "S", "D"]).map((d, i) => (
          <div key={i} className="bg-[#0c0c0c] text-center text-[10px] uppercase tracking-widest text-[#f7f7f7]/40 py-2">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="bg-[#111111] min-h-[70px]" />;
          const dateObj = new Date(cursor.getFullYear(), cursor.getMonth(), day);
          const key = `${dateObj.getFullYear()}-${dateObj.getMonth()}-${day}`;
          const dayEvents = byDay[key] || [];
          const isSelected = selectedDate === key;
          const isToday = new Date().toDateString() === dateObj.toDateString();
          return (
            <button key={i} role="gridcell" onClick={() => onSelect(isSelected ? null : key)} data-testid={`cal-month-day-${day}`} aria-label={`${day} ${monthLabel}${dayEvents.length ? ` — ${dayEvents.length} ${t("cal.month.events")}` : ""}`}
              className={`min-h-[70px] p-1.5 text-left bg-[#141414] hover:bg-[#1A1A1A] transition-colors flex flex-col gap-1 ${isSelected ? "ring-1 ring-inset ring-[#D8CA82] bg-[#D8CA82]/10" : ""}`}>
              <span className={`text-xs font-display font-bold ${isToday ? "text-[#D8CA82]" : "text-[#f7f7f7]/70"}`}>{day}{isToday && <span className="ml-1 text-[8px] uppercase tracking-widest text-[#D8CA82]">•</span>}</span>
              <span className="flex flex-wrap gap-1">{dayEvents.slice(0, 3).map((ev) => <span key={ev.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TYPE_COLORS[ev.type] || (ev.raw ? "#F4511E" : "#D8CA82") }} title={ev.title} />)}{dayEvents.length > 3 && <span className="text-[8px] text-[#f7f7f7]/40">+{dayEvents.length - 3}</span>}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[10px] uppercase tracking-widest text-[#f7f7f7]/40">
        {TYPES.map((ty) => (<span key={ty} className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TYPE_COLORS[ty] }} />{t(`cal.type.${ty}`)}</span>))}
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#F4511E]" /> Match officiel</span>
      </div>
    </div>
  );
};

const EventRow = ({ ev, dim, user, displayName, isMatch }) => {
  const { t } = useLang();
  const Icon = isMatch ? Trophy : (TYPE_ICONS[ev.type] || PartyPopper);
  const d = ev.date ? new Date(ev.date) : null;
  const [pending, setPending] = useState(false);
  const [anonName, setAnonName] = useState("");
  const [askName, setAskName] = useState(false);

  const participants = Array.isArray(ev.participants) ? ev.participants : [];
  const receipt = user ? null : readRsvpReceipt(ev.id);
  const legacyAnonId = user ? "" : getLegacyAnonId();
  const myId = user ? user.uid : (receipt?.participantId || legacyAnonId);
  const isIn = Boolean(myId) && participants.some((p) => p.id === myId);

  const toggleRsvp = async (name) => {
    if (dim || isMatch) return;
    setPending(true);
    try {
      if (isIn) {
        await callProtected("rsvpCommunityEvent", { eventId: ev.id, action: "leave", ...(user ? {} : { participantId: myId, token: receipt?.token || "" }), });
        if (!user) writeRsvpReceipt(ev.id, null);
      } else {
        const result = await callProtected("rsvpCommunityEvent", { eventId: ev.id, action: "join", name: name || (user ? displayName : "Anonyme"), });
        if (!user && result?.participantId) writeRsvpReceipt(ev.id, { participantId: result.participantId, token: result.token || "" });
      }
      toast.success(t("common.saved"));
    } catch (err) { console.error(err); toast.error(protectedErrorMessage(err, t("common.error"))); }
    setPending(false);
  };

  const onParticipateClick = () => {
    if (user) { toggleRsvp(); return; }
    if (askName) return;
    try {
      const stored = localStorage.getItem("elysium_anon_name");
      if (stored) { toggleRsvp(stored); return; }
    } catch { }
    setAskName(true);
  };
  const confirmAnon = () => {
    const name = anonName.trim() || "Anonyme";
    try { localStorage.setItem("elysium_anon_name", name); } catch { }
    setAskName(false);
    toggleRsvp(name);
  };

  // viewer timezone conversion
  const localTime = d ? d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }) : "";

  if (isMatch) {
    const m = ev.raw;
    const detailUrl = m ? matchDetailUrl(m) : "#";
    const statusLabel = m.status === "postponed" ? "Reporté" : m.status === "cancelled" ? "Annulé" : m.status === "live" ? "En direct" : m.status === "upcoming" ? "À venir" : "Terminé";
    return (
      <div className={`flex items-center gap-5 border px-5 py-4 flex-wrap ${m.status === "cancelled" ? "border-white/5 bg-[#0c0c0c] opacity-60" : m.status === "postponed" ? "border-amber-300/20 bg-amber-300/5" : "border-[#D8CA82]/20 bg-[#1A1A1A]"}`} data-testid={`cal-match-${m.id}`}>
        <div className="text-center shrink-0 w-16 border-r border-white/10 pr-4">
          <p className="font-display font-bold text-2xl text-[#D8CA82]">{d ? d.getDate() : "—"}</p>
          <p className="text-[10px] uppercase text-[#f7f7f7]/40">{d ? d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }) : ""}</p>
        </div>
        <Icon size={18} className={m.status==="cancelled"?"text-white/30":"text-[#D8CA82]"} />
        <div className="flex-1 min-w-0">
          <Link to={detailUrl} className="font-semibold text-[#f7f7f7] hover:text-[#D8CA82] hover:underline">{ev.title}</Link>
          <p className="text-xs text-[#f7f7f7]/40 mt-0.5">{m.game}{m.roster?` · ${m.roster}`:""} · {statusLabel} · {localTime} · {m.competition || ""}</p>
          {(m.status==="postponed"||m.status==="cancelled") && <p className="text-[11px] text-amber-300/80 mt-1">{m.status==="postponed"?"Match reporté":"Match annulé"}{m.notes?` — ${m.notes}`:""}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {m.watchUrl && m.status!=="cancelled" && <a href={m.watchUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] uppercase tracking-widest border border-red-400/40 text-red-300 px-2 py-1">Live</a>}
          <Link to={detailUrl} className="text-[11px] uppercase tracking-widest border border-white/20 text-[#f7f7f7]/60 px-2 py-1 hover:border-[#D8CA82] hover:text-[#D8CA82]">Fiche →</Link>
          <button onClick={() => downloadICS([ev], "match.ics")} className="text-[#f7f7f7]/50 hover:text-[#D8CA82]"><Download size={15} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-5 border border-white/10 bg-[#1A1A1A] px-5 py-4 flex-wrap ${dim ? "opacity-50" : ""}`} data-testid={`cal-event-${ev.id}`}>
      <div className="text-center shrink-0 w-16 border-r border-white/10 pr-4">
        <p className="font-display font-bold text-2xl text-[#D8CA82]">{d ? d.getDate() : "—"}</p>
        <p className="text-[10px] uppercase text-[#f7f7f7]/40">{d ? d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }) : ""}</p>
      </div>
      <Icon size={18} className="text-[#D8CA82] shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[#f7f7f7]">{ev.title}</p>
        <p className="text-xs text-[#f7f7f7]/40 mt-0.5">{t(`cal.type.${ev.type}`)}{d ? ` · ${localTime}` : ""}{ev.description ? ` — ${ev.description}` : ""}</p>
        {participants.length > 0 && <p className="text-[11px] text-[#f7f7f7]/50 mt-1 flex items-center gap-1.5" data-testid={`cal-rsvp-count-${ev.id}`}><UserCheck size={11} className="text-[#D8CA82]" />{participants.length} {t("cal.rsvp.count")}{isIn && <span className="text-[#D8CA82]">· {t("cal.rsvp.you")}</span>}</p>}
        {askName && <div className="mt-2 flex items-center gap-2" data-testid={`cal-rsvp-name-${ev.id}`}><input value={anonName} onChange={(e) => setAnonName(e.target.value)} placeholder={t("cal.rsvp.namePlaceholder")} onKeyDown={(e) => e.key === "Enter" && confirmAnon()} className="bg-[#111111] border border-white/20 px-2 py-1.5 text-xs text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" /><button onClick={confirmAnon} className="bg-[#D8CA82] text-[#111111] text-[10px] font-bold uppercase tracking-widest px-3 py-1.5" data-testid={`cal-rsvp-confirm-${ev.id}`}>{t("cal.rsvp.confirm")}</button></div>}
      </div>
      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        {!dim && <button onClick={onParticipateClick} disabled={pending} aria-pressed={isIn} data-testid={`cal-rsvp-${ev.id}`} className={`text-[10px] uppercase tracking-widest border px-3 py-2 flex items-center gap-1.5 transition-colors disabled:opacity-50 ${isIn ? "border-[#D8CA82] text-[#D8CA82] bg-[#D8CA82]/10" : "border-white/20 text-[#f7f7f7]/60 hover:border-[#D8CA82] hover:text-[#D8CA82]"}`}>{isIn ? <Check size={11} /> : <UserPlus size={11} />}{isIn ? t("cal.rsvp.leave") : t("cal.rsvp.participate")}</button>}
        {ev.link && <a href={ev.link} target="_blank" rel="noopener noreferrer" className="text-[#D8CA82]/70 hover:text-[#D8CA82]" title={ev.link} data-testid={`cal-link-${ev.id}`}><ExternalLink size={15} /></a>}
        {!dim && <><button onClick={() => downloadICS([ev], "elysium-calendrier.ics")} title={t("cal.export")} data-testid={`cal-ics-${ev.id}`} className="text-[#f7f7f7]/50 hover:text-[#D8CA82] transition-colors"><Download size={15} /></button><a href={gcalUrl(ev)} target="_blank" rel="noopener noreferrer" title={t("cal.gcal")} data-testid={`cal-gcal-${ev.id}`} className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/50 hover:text-[#D8CA82] border border-white/15 px-2 py-1 transition-colors">GCal</a></>}
      </div>
    </div>
  );
};

export default function CommunityCalendar() {
  const { t, lang } = useLang();
  const { user, displayName } = useAuth();
  const [events, setEvents] = useState(null);
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [typeFilter, setTypeFilter] = useState("all");
  const [gameFilter, setGameFilter] = useState("all");
  const [rosterFilter, setRosterFilter] = useState("all");
  const [view, setView] = useState("list");
  const [selectedDay, setSelectedDay] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showCancelled, setShowCancelled] = useState(true);

  useEffect(() => {
    setError(false); setEvents(null);
    const u1 = onSnapshot(collection(db, "communityEvents"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e)=> e.status !== "draft");
      list.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      setEvents(list);
    }, (e) => { console.error(e); setError(true); });
    const u2 = onSnapshot(collection(db, "matches"), (snap) => setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
    return () => { u1(); u2(); };
  }, [retryKey]);

  const rosterOptions = useMemo(() => {
    if (gameFilter === "all") return [];
    return ROSTERS[gameFilter] || [];
  }, [gameFilter]);

  const matchEvents = useMemo(() => matches.map(matchToCalendarEvent).filter((ev) => {
    if (gameFilter !== "all" && ev.game !== gameFilter) return false;
    if (rosterFilter !== "all" && ev.roster !== rosterFilter) return false;
    if (!showCancelled && (ev.status === "cancelled" || ev.status==="postponed")) return false;
    return true;
  }), [matches, gameFilter, rosterFilter, showCancelled]);

  const combinedEvents = useMemo(() => {
    const comm = (events || []).filter((e)=> typeFilter==="all" || e.type===typeFilter).map((e)=> ({ ...e, isMatch:false }));
    const ms = typeFilter==="all" || typeFilter==="tournament" ? matchEvents.map((ev)=> ({ ...ev, isMatch:true })) : [];
    const all = [...comm, ...ms];
    all.sort((a,b)=> (a.date||"").localeCompare(b.date||""));
    return all;
  }, [events, matchEvents, typeFilter]);

  const now = new Date().toISOString().slice(0, 16);
  const upcomingAll = combinedEvents.filter((e) => (e.date || "") >= now);
  const pastAll = combinedEvents.filter((e) => (e.date || "") < now).reverse();

  const selectedDayEvents = useMemo(() => {
    if (!selectedDay) return [];
    const [y, m, d] = selectedDay.split("-").map(Number);
    return combinedEvents.filter((ev) => {
      const dt = ev.date ? new Date(ev.date) : null;
      return dt && dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
    });
  }, [combinedEvents, selectedDay]);

  const icsUrl = `${SITE_URL}/matches.ics`;
  const dynamicFeedUrl = useMemo(() => {
    // For demo we use static URL with query params for filtering; real would be cloud function
    const params = new URLSearchParams();
    if (gameFilter !== "all") params.set("game", gameFilter);
    if (rosterFilter !== "all") params.set("roster", rosterFilter);
    if (typeFilter !== "all") params.set("type", typeFilter);
    const qs = params.toString();
    return qs ? `${icsUrl}?${qs}` : icsUrl;
  }, [gameFilter, rosterFilter, typeFilter]);

  const gcalSubscribe = `https://calendar.google.com/calendar/r?cid=webcal://${SITE_URL.replace(/^https?:\/\//, "")}/matches.ics`;

  const copyFeed = async () => {
    try { await navigator.clipboard.writeText(dynamicFeedUrl); setCopied(true); toast.success(t("cal.subscribe.copied")); setTimeout(() => setCopied(false), 2000); } catch { toast.error(t("common.error")); }
  };

  const downloadAll = () => downloadICS(combinedEvents, "elysium-calendrier.ics", { calendarName: "Elysium — Calendrier unifié" });

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 relative">
          <PageBreadcrumb items={[{ label: t("cal.title") }]} />
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="cal-title">{t("cal.title")}</h1>
          <p className="text-[#f7f7f7]/50 mt-4 tracking-wide">{t("cal.sub")}</p>
          <p className="text-xs text-[#D8CA82]/70 mt-2">Fuseau horaire du navigateur : {Intl.DateTimeFormat().resolvedOptions().timeZone} — les heures s'affichent dans votre fuseau local.</p>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#0c0c0c]" data-testid="cal-subscribe">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12">
          <div className="flex items-center gap-3 mb-2"><CalendarDays size={17} className="text-[#D8CA82]" /><h2 className="font-display text-sm tracking-[0.3em] uppercase text-[#f7f7f7]">{t("cal.subscribe.title")}</h2><span className="text-[10px] uppercase tracking-widest border border-[#D8CA82]/30 text-[#D8CA82] px-2 py-0.5">ICS dynamique</span></div>
          <p className="text-sm text-[#f7f7f7]/50 mb-6">{t("cal.subscribe.sub")}</p>
          <div className="flex items-center gap-3 flex-wrap">
            <code className="text-xs text-[#D8CA82] bg-[#111111] border border-white/10 px-3 py-2.5 break-all" data-testid="cal-subscribe-url">{dynamicFeedUrl}</code>
            <button onClick={copyFeed} data-testid="cal-subscribe-copy" className="border border-[#D8CA82]/50 text-[#D8CA82] text-xs uppercase tracking-widest px-4 py-2.5 flex items-center gap-2 hover:bg-[#D8CA82]/10 transition-colors">{copied ? <Check size={13} /> : <Link2 size={13} />}{copied ? t("cal.subscribe.copied") : t("cal.subscribe.copy")}</button>
            <a href={gcalSubscribe} target="_blank" rel="noopener noreferrer" data-testid="cal-subscribe-gcal" className="border border-white/20 text-[#f7f7f7]/70 text-xs uppercase tracking-widest px-4 py-2.5 hover:border-[#D8CA82] hover:text-[#D8CA82] transition-colors">{t("cal.subscribe.gcal")}</a>
            <button onClick={downloadAll} data-testid="cal-subscribe-download" className="border border-white/20 text-[#f7f7f7]/70 text-xs uppercase tracking-widest px-4 py-2.5 flex items-center gap-2 hover:border-[#D8CA82] hover:text-[#D8CA82] transition-colors"><Download size={13} /> {t("cal.subscribe.download")}</button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/40">Flux filtré par :</span>
            {gameFilter!=="all" && <span className="text-[10px] border border-[#D8CA82]/30 text-[#D8CA82] px-2 py-0.5">{gameFilter}</span>}
            {rosterFilter!=="all" && <span className="text-[10px] border border-white/15 text-[#f7f7f7]/60 px-2 py-0.5">{rosterFilter}</span>}
            {typeFilter!=="all" && <span className="text-[10px] border border-white/15 text-[#f7f7f7]/60 px-2 py-0.5">{typeFilter}</span>}
            {(gameFilter!=="all"||rosterFilter!=="all"||typeFilter!=="all") && <button onClick={()=>{setGameFilter("all"); setRosterFilter("all"); setTypeFilter("all");}} className="text-[10px] text-[#D8CA82] underline">Réinitialiser</button>}
          </div>
          <details className="mt-4" data-testid="cal-subscribe-how"><summary className="text-xs uppercase tracking-widest text-[#f7f7f7]/50 hover:text-[#D8CA82] cursor-pointer">{t("cal.subscribe.how")}</summary><ol className="mt-3 space-y-1.5 text-sm text-[#c8c8c8] list-decimal list-inside"><li>{t("cal.subscribe.step1")}</li><li>{t("cal.subscribe.step2")}</li><li>{t("cal.subscribe.step3")}</li><li>{t("cal.subscribe.step4")}</li></ol></details>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-8 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex flex-wrap gap-2" data-testid="cal-filters">
            {["all", ...TYPES].map((ty) => (<button key={ty} onClick={() => setTypeFilter(ty)} data-testid={`cal-filter-${ty}`} className={`text-[11px] uppercase tracking-[0.2em] border px-3 py-1.5 transition-colors ${typeFilter === ty ? "border-[#D8CA82] text-[#D8CA82] bg-[#D8CA82]/10" : "border-white/15 text-[#f7f7f7]/50 hover:text-[#f7f7f7]"}`}>{ty === "all" ? t("media.all") : t(`cal.type.${ty}`)}</button>))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select value={gameFilter} onChange={(e)=>{setGameFilter(e.target.value); setRosterFilter("all");}} className="bg-[#1A1A1A] border border-white/15 text-[#f7f7f7] text-xs px-2 py-1.5" data-testid="cal-filter-game"><option value="all">Jeu : Tous</option>{GAMES.map((g)=><option key={g} value={g}>{g}</option>)}</select>
            {rosterOptions.length>0 && <select value={rosterFilter} onChange={(e)=>setRosterFilter(e.target.value)} className="bg-[#1A1A1A] border border-white/15 text-[#f7f7f7] text-xs px-2 py-1.5" data-testid="cal-filter-roster"><option value="all">Roster : Tous</option>{rosterOptions.map((r)=><option key={r} value={r}>{r}</option>)}</select>}
            <label className="flex items-center gap-1.5 text-[11px] text-[#f7f7f7]/60"><input type="checkbox" checked={showCancelled} onChange={(e)=>setShowCancelled(e.target.checked)} className="accent-[#D8CA82]" /> Afficher reports/annulés</label>
          </div>
          <div className="flex gap-1 border border-white/15 p-1" role="tablist" aria-label={t("cal.title")}>
            <button onClick={() => setView("list")} data-testid="cal-view-list" role="tab" aria-selected={view === "list"} className={`px-3 py-1.5 text-[10px] uppercase tracking-widest flex items-center gap-1.5 transition-colors ${view === "list" ? "bg-[#D8CA82] text-[#111111] font-bold" : "text-[#f7f7f7]/50 hover:text-[#f7f7f7]"}`}><List size={12} /> {t("cal.view.list")}</button>
            <button onClick={() => setView("month")} data-testid="cal-view-month" role="tab" aria-selected={view === "month"} className={`px-3 py-1.5 text-[10px] uppercase tracking-widest flex items-center gap-1.5 transition-colors ${view === "month" ? "bg-[#D8CA82] text-[#111111] font-bold" : "text-[#f7f7f7]/50 hover:text-[#f7f7f7]"}`}><Grid3X3 size={12} /> {t("cal.view.month")}</button>
          </div>
        </div>

        {error ? <ErrorState onRetry={() => setRetryKey((k) => k + 1)} testId="cal-error" /> : events === null ? <LoadingState testId="cal-loading" /> : view === "month" ? (
          <div className="space-y-6">
            <MonthGrid events={combinedEvents} selectedDate={selectedDay} onSelect={setSelectedDay} t={t} lang={lang} />
            {selectedDay ? (
              <div className="space-y-3" data-testid="cal-month-day-events">
                <p className="text-xs uppercase tracking-[0.3em] text-[#f7f7f7]/40">{new Date(`${selectedDay}T12:00:00`).toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", { weekday: "long", day: "numeric", month: "long" })} — {selectedDayEvents.length} {t("cal.month.events")}</p>
                {selectedDayEvents.length === 0 && <p className="text-[#f7f7f7]/40 text-sm">{t("cal.empty")}</p>}
                {selectedDayEvents.map((ev) => <EventRow key={ev.id} ev={ev} isMatch={!!ev.isMatch} user={user} displayName={displayName} />)}
              </div>
            ) : <p className="text-sm text-[#f7f7f7]/40" data-testid="cal-month-hint">← {t("cal.empty")}</p>}
          </div>
        ) : upcomingAll.length === 0 && pastAll.length === 0 ? <EmptyState icon={CalendarDays} text={t("cal.empty")} testId="cal-empty" /> : (
          <div className="space-y-3" data-testid="cal-list">
            {upcomingAll.length === 0 && <p className="text-[#f7f7f7]/40 mb-4" data-testid="cal-no-upcoming">{t("cal.empty")}</p>}
            {upcomingAll.map((ev) => <EventRow key={ev.id} ev={ev} isMatch={!!ev.isMatch} user={user} displayName={displayName} />)}
            {pastAll.length > 0 && <><p className="text-xs uppercase tracking-[0.3em] text-[#f7f7f7]/30 pt-8 pb-2">{t("cal.past")}</p>{pastAll.slice(0, 20).map((ev) => <EventRow key={ev.id} ev={ev} isMatch={!!ev.isMatch} dim user={user} displayName={displayName} />)}</>}
          </div>
        )}
      </section>
    </div>
  );
}
