import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { CalendarDays, Download, ExternalLink, Trophy, Dumbbell, Radio, PartyPopper } from "lucide-react";
import { db } from "../lib/firebase";
import { useLang } from "../lib/i18n";
import { LoadingState, ErrorState, EmptyState } from "../components/States";

const TYPE_ICONS = { tournament: Trophy, training: Dumbbell, stream: Radio, community: PartyPopper };

const toICSDate = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

const downloadICS = (ev) => {
  const start = new Date(ev.date);
  const end = new Date(start.getTime() + 2 * 3600 * 1000);
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Elysium//FR", "BEGIN:VEVENT",
    `UID:${ev.id}@elysium`, `DTSTART:${toICSDate(start)}`, `DTEND:${toICSDate(end)}`,
    `SUMMARY:${ev.title}`, `DESCRIPTION:${(ev.description || "").replace(/\n/g, "\\n")}`,
    ev.link ? `URL:${ev.link}` : "", "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `elysium-${ev.title.replace(/\W+/g, "-").toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
};

const gcalUrl = (ev) => {
  const start = new Date(ev.date);
  const end = new Date(start.getTime() + 2 * 3600 * 1000);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.title)}&dates=${toICSDate(start)}/${toICSDate(end)}&details=${encodeURIComponent(ev.description || "")}`;
};

export default function CommunityCalendar() {
  const { t } = useLang();
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setError(false); setEvents(null);
    return onSnapshot(collection(db, "communityEvents"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      setEvents(list);
    }, (e) => { console.error(e); setError(true); });
  }, [retryKey]);

  const now = new Date().toISOString().slice(0, 16);
  const upcoming = (events || []).filter((e) => (e.date || "") >= now);
  const past = (events || []).filter((e) => (e.date || "") < now).reverse();

  const EventRow = ({ ev, dim }) => {
    const Icon = TYPE_ICONS[ev.type] || PartyPopper;
    const d = ev.date ? new Date(ev.date) : null;
    return (
      <div className={`flex items-center gap-5 border border-white/10 bg-[#1A1A1A] px-5 py-4 ${dim ? "opacity-50" : ""}`} data-testid={`cal-event-${ev.id}`}>
        <div className="text-center shrink-0 w-16 border-r border-white/10 pr-4">
          <p className="font-display font-bold text-2xl text-[#D8CA82]">{d ? d.getDate() : "—"}</p>
          <p className="text-[10px] uppercase text-[#f7f7f7]/40">{d ? d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }) : ""}</p>
        </div>
        <Icon size={18} className="text-[#D8CA82] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#f7f7f7]">{ev.title}</p>
          <p className="text-xs text-[#f7f7f7]/40 mt-0.5">
            {t(`cal.type.${ev.type}`)}{d ? ` · ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}
            {ev.description ? ` — ${ev.description}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {ev.link && (
            <a href={ev.link} target="_blank" rel="noopener noreferrer" className="text-[#D8CA82]/70 hover:text-[#D8CA82]" title={ev.link} data-testid={`cal-link-${ev.id}`}>
              <ExternalLink size={15} />
            </a>
          )}
          {!dim && (
            <>
              <button onClick={() => downloadICS(ev)} title={t("cal.export")} data-testid={`cal-ics-${ev.id}`}
                className="text-[#f7f7f7]/50 hover:text-[#D8CA82] transition-colors"><Download size={15} /></button>
              <a href={gcalUrl(ev)} target="_blank" rel="noopener noreferrer" title={t("cal.gcal")} data-testid={`cal-gcal-${ev.id}`}
                className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/50 hover:text-[#D8CA82] border border-white/15 px-2 py-1 transition-colors">
                GCal
              </a>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-[70vh] bg-[#111111]">
      <section className="relative border-b border-white/10 overflow-hidden">
        <div className="pattern-overlay" />
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20 relative">
          <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[#f7f7f7] uppercase" data-testid="cal-title">{t("cal.title")}</h1>
          <p className="text-[#f7f7f7]/50 mt-4 tracking-wide">{t("cal.sub")}</p>
        </div>
      </section>
      <section className="max-w-5xl mx-auto px-4 sm:px-8 py-12">
        {error ? (
          <ErrorState onRetry={() => setRetryKey((k) => k + 1)} testId="cal-error" />
        ) : events === null ? (
          <LoadingState testId="cal-loading" />
        ) : upcoming.length === 0 && past.length === 0 ? (
          <EmptyState icon={CalendarDays} text={t("cal.empty")} testId="cal-empty" />
        ) : (
          <div className="space-y-3" data-testid="cal-list">
            {upcoming.length === 0 && <p className="text-[#f7f7f7]/40 mb-4" data-testid="cal-no-upcoming">{t("cal.empty")}</p>}
            {upcoming.map((ev) => <EventRow key={ev.id} ev={ev} />)}
            {past.length > 0 && (
              <>
                <p className="text-xs uppercase tracking-[0.3em] text-[#f7f7f7]/30 pt-8 pb-2">{t("cal.past")}</p>
                {past.slice(0, 10).map((ev) => <EventRow key={ev.id} ev={ev} dim />)}
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
