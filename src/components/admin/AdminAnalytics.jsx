import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, BarChart3, Download, Eye, HandHeart, MousePointerClick, Users } from "lucide-react";
import { toast } from "sonner";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { ANALYTICS_EVENTS, FUNNEL_STEPS, analyticsConfigured } from "../../lib/analytics";
import { downloadCsv, csvFilename } from "../../lib/csv";

const RANGES = [
  { id: 7, label: "7 jours" },
  { id: 14, label: "14 jours" },
  { id: 30, label: "30 jours" },
];

const GOLD = "#D8CA82";
const MUTED = "#7a7a7a";

const dayKey = (date) => date.toISOString().slice(0, 10);

const fmtDay = (key, lang) => {
  const date = new Date(`${key}T12:00:00Z`);
  return date.toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", { day: "2-digit", month: "short" });
};

const Card = ({ icon: Icon, label, value, hint }) => (
  <div className="border border-white/10 bg-[#141414] p-4" data-testid="admin-analytics-card">
    <div className="flex items-center gap-2 text-[#D8CA82]">
      <Icon size={14} aria-hidden="true" />
      <p className="text-[10px] uppercase tracking-[0.2em] text-[#c8c8c8]">{label}</p>
    </div>
    <p className="font-display text-3xl text-[#f7f7f7] mt-2">{value}</p>
    {hint && <p className="text-[11px] text-[#c8c8c8]/60 mt-1">{hint}</p>}
  </div>
);

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#111111] border border-[#D8CA82]/30 px-3 py-2 text-xs text-[#f7f7f7]">
      <p className="text-[#D8CA82] uppercase tracking-widest text-[10px] mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2" style={{ background: entry.color || GOLD }} />
          {entry.name} : <strong>{entry.value}</strong>
        </p>
      ))}
    </div>
  );
};

export const AdminAnalytics = () => {
  const { lang } = useLang();
  const [range, setRange] = useState(14);
  const [events, setEvents] = useState(null);
  const [denied, setDenied] = useState(false);
  const [queryError, setQueryError] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);

  const since = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (range - 1));
    return date.toISOString();
  }, [range]);

  useEffect(() => {
    setEvents(null);
    setDenied(false);
    setQueryError(false);
    return onSnapshot(
      query(
        collection(db, "analytics_events"),
        where("timestamp", ">=", since),
        orderBy("timestamp", "desc"),
        limit(4000),
      ),
      (snap) => {
        setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        console.error("analytics_events", err);
        if (err?.code === "permission-denied") setDenied(true);
        else setQueryError(true);
        setEvents([]);
      },
    );
  }, [since]);

  const analytics = useMemo(() => {
    const list = events || [];
    const byName = new Map();
    const byPath = new Map();
    const byDay = new Map();
    const sessions = new Set();
    for (let i = 0; i < range; i += 1) {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - (range - 1 - i));
      byDay.set(dayKey(date), { day: dayKey(date), vues: 0, evenements: 0 });
    }
    list.forEach((event) => {
      byName.set(event.name, (byName.get(event.name) || 0) + 1);
      if (event.sessionId) sessions.add(event.sessionId);
      const page = event.properties?.page || event.path || "/";
      byPath.set(page, (byPath.get(page) || 0) + 1);
      const day = String(event.timestamp || "").slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, { day, vues: 0, evenements: 0 });
      const bucket = byDay.get(day);
      bucket.evenements += 1;
      if (event.name === ANALYTICS_EVENTS.PAGE_VIEW) bucket.vues += 1;
    });

    const series = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
    const pageViews = byName.get(ANALYTICS_EVENTS.PAGE_VIEW) || 0;
    const topPages = [...byPath.entries()]
      .filter(([path]) => path && path !== "/")
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([path, count]) => ({ path, count }));
    const eventList = [...byName.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
    const funnel = FUNNEL_STEPS.map((step) => ({ ...step, count: byName.get(step.event) || 0 }));
    const submitted = byName.get(ANALYTICS_EVENTS.APPLICATION_SUBMITTED) || 0;
    const started = byName.get(ANALYTICS_EVENTS.APPLICATION_STARTED) || 0;

    return {
      total: list.length,
      pageViews,
      sessions: sessions.size,
      topPages,
      events: eventList,
      series,
      funnel,
      donateClicks: byName.get(ANALYTICS_EVENTS.DONATE_CLICK) || 0,
      partnerClicks: byName.get(ANALYTICS_EVENTS.PARTNER_CLICK) || 0,
      searches: byName.get(ANALYTICS_EVENTS.GLOBAL_SEARCH) || 0,
      shares: byName.get(ANALYTICS_EVENTS.SHARE) || 0,
      newsletter: byName.get(ANALYTICS_EVENTS.NEWSLETTER_SIGNUP) || 0,
      applicationRate: started > 0 ? Math.round((submitted / started) * 100) : 0,
    };
  }, [events, range]);

  const exportEvents = () => {
    if (!events?.length) {
      toast.error("Aucun événement à exporter sur la période.");
      return;
    }
    downloadCsv(
      csvFilename("elysium-analytics"),
      events.map((event) => ({
        timestamp: event.timestamp,
        nom: event.name,
        page: event.properties?.page || event.path || "",
        session: event.sessionId || "",
        referrer: event.referrer || "",
        proprietes: JSON.stringify(event.properties || {}),
      })),
      [
        { key: "timestamp", label: "Horodatage" },
        { key: "nom", label: "Événement" },
        { key: "page", label: "Page" },
        { key: "session", label: "Session" },
        { key: "referrer", label: "Référent" },
        { key: "proprietes", label: "Propriétés" },
      ],
    );
  };

  const funnelMax = Math.max(1, ...analytics.funnel.map((step) => step.count));

  return (
    <div className="space-y-6" data-testid="admin-analytics">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="text-[#D8CA82]" size={18} />
            <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">Analytics</h2>
          </div>
          <p className="text-sm text-[#f7f7f7]/50">
            Vues de page, clics recrutement, entonnoir de candidature et dons — collecte Firestore, consentement respecté.
          </p>
          <p className="text-[11px] text-[#c8c8c8]/60 mt-1">
            Destination : {analyticsConfigured() ? "Firestore `analytics_events`" : "aucune"}
            {process.env.REACT_APP_ANALYTICS_ENDPOINT ? " + endpoint HTTP configuré" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {RANGES.map((item) => (
            <button key={item.id} onClick={() => setRange(item.id)} data-testid={`admin-analytics-range-${item.id}`}
              className={`px-3 py-2 text-[10px] uppercase tracking-widest border ${range === item.id ? "border-[#D8CA82] text-[#D8CA82] bg-[#D8CA82]/10" : "border-white/15 text-[#f7f7f7]/60 hover:border-[#D8CA82]/50"}`}>
              {item.label}
            </button>
          ))}
          <button onClick={exportEvents} data-testid="admin-analytics-export"
            className="inline-flex items-center gap-2 border border-[#D8CA82]/50 text-[#D8CA82] px-3 py-2 text-[10px] uppercase tracking-widest hover:bg-[#D8CA82]/10">
            <Download size={12} /> CSV
          </button>
        </div>
      </div>

      {denied && (
        <p className="border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" data-testid="admin-analytics-denied">
          Lecture refusée : la permission <code>analytics.view</code> est requise. Accordez-la depuis l'onglet Équipe.
        </p>
      )}
      {queryError && (
        <p className="border border-orange-400/40 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
          Les événements n'ont pas pu être chargés (index Firestore en cours de création ?). Réessayez dans une minute.
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card icon={Eye} label="Vues de page" value={events === null ? "…" : analytics.pageViews.toLocaleString(lang === "en" ? "en-US" : "fr-FR")} hint={`${range} derniers jours`} />
        <Card icon={Users} label="Sessions" value={events === null ? "…" : analytics.sessions.toLocaleString(lang === "en" ? "en-US" : "fr-FR")} hint="sessions anonymes" />
        <Card icon={HandHeart} label="Clics don" value={events === null ? "…" : analytics.donateClicks} hint={`${analytics.partnerClicks} clics partenaires`} />
        <Card icon={MousePointerClick} label="Candidatures" value={events === null ? "…" : analytics.funnel[2].count} hint={`${analytics.applicationRate} % des candidatures commencées`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 border border-white/10 bg-[#141414] p-4">
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] mb-3">Trafic quotidien</p>
          <div className="h-64" data-testid="admin-analytics-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.series} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="pv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GOLD} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis dataKey="day" tickFormatter={(v) => fmtDay(v, lang)} tick={{ fill: MUTED, fontSize: 10 }} stroke="#333" minTickGap={18} />
                <YAxis tick={{ fill: MUTED, fontSize: 10 }} stroke="#333" allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="vues" name="Vues" stroke={GOLD} strokeWidth={2} fill="url(#pv)" />
                <Area type="monotone" dataKey="evenements" name="Événements" stroke="#6b8cff" strokeWidth={1.5} fillOpacity={0} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-white/10 bg-[#141414] p-4">
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] mb-3">Entonnoir candidature</p>
          <div className="space-y-3" data-testid="admin-analytics-funnel">
            {analytics.funnel.map((step, index) => (
              <div key={step.event}>
                <div className="flex items-center justify-between text-xs text-[#f7f7f7]/70">
                  <span>{step.label}</span>
                  <span className="text-[#D8CA82] font-semibold">{step.count}</span>
                </div>
                <div className="h-2 bg-white/5 mt-1">
                  <div className="h-full" style={{ width: `${Math.round((step.count / funnelMax) * 100)}%`, background: index === 0 ? "#7a6d3a" : GOLD }} />
                </div>
                {index > 0 && analytics.funnel[index - 1].count > 0 && (
                  <p className="text-[10px] text-[#c8c8c8]/60 mt-0.5">
                    {Math.round((step.count / analytics.funnel[index - 1].count) * 100)} % de l'étape précédente
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/10 text-center">
            <div><p className="font-display text-lg text-[#f7f7f7]">{analytics.searches}</p><p className="text-[9px] uppercase tracking-widest text-[#c8c8c8]">recherches</p></div>
            <div><p className="font-display text-lg text-[#f7f7f7]">{analytics.shares}</p><p className="text-[9px] uppercase tracking-widest text-[#c8c8c8]">partages</p></div>
            <div><p className="font-display text-lg text-[#f7f7f7]">{analytics.newsletter}</p><p className="text-[9px] uppercase tracking-widest text-[#c8c8c8]">newsletter</p></div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="border border-white/10 bg-[#141414] p-4">
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] mb-3">Pages les plus vues</p>
          {analytics.topPages.length === 0 ? (
            <p className="text-sm text-[#c8c8c8]">Pas encore de données.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.topPages} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" horizontal={false} />
                  <XAxis type="number" tick={{ fill: MUTED, fontSize: 10 }} stroke="#333" allowDecimals={false} />
                  <YAxis type="category" dataKey="path" width={110} tick={{ fill: "#c8c8c8", fontSize: 10 }} stroke="#333" />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Vues" fill={GOLD} barSize={14}>
                    {analytics.topPages.map((entry) => <Cell key={entry.path} fill={GOLD} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="border border-white/10 bg-[#141414] p-4">
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#c8c8c8] mb-3">Événements suivis</p>
          <div className="flex items-center gap-2 mb-3">
            <Activity size={13} className="text-[#D8CA82]" />
            <span className="text-xs text-[#c8c8c8]">{analytics.total.toLocaleString(lang === "en" ? "en-US" : "fr-FR")} événement(s) sur la période</span>
          </div>
          <div className="space-y-1.5 max-h-52 overflow-y-auto" data-testid="admin-analytics-events">
            {(showAllEvents ? analytics.events : analytics.events.slice(0, 8)).map((event) => (
              <div key={event.name} className="flex items-center gap-2 text-xs">
                <span className="text-[#f7f7f7]/70 flex-1 truncate">{event.name}</span>
                <span className="text-[#D8CA82]">{event.count}</span>
                <div className="w-20 h-1.5 bg-white/5"><div className="h-full bg-[#D8CA82]/70" style={{ width: `${Math.min(100, (event.count / Math.max(1, analytics.events[0]?.count || 1)) * 100)}%` }} /></div>
              </div>
            ))}
            {analytics.events.length === 0 && <p className="text-sm text-[#c8c8c8]">Aucun événement collecté.</p>}
          </div>
          {analytics.events.length > 8 && (
            <button onClick={() => setShowAllEvents((v) => !v)} className="mt-3 text-[10px] uppercase tracking-widest text-[#D8CA82] hover:underline">
              {showAllEvents ? "Réduire" : `Voir les ${analytics.events.length} événements`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
