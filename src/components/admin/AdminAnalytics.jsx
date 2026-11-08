import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Activity, BarChart3, Eye, MousePointerClick, RefreshCw, Users } from "lucide-react";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { useAdminT } from "../../lib/adminI18n";
import { ANALYTICS_EVENTS, analyticsConsentGranted } from "../../lib/analytics";
import { summarizeAnalytics } from "../../lib/analyticsSummary";

const RANGES = [7, 30, 90];
const EVENT_LABELS = {
  [ANALYTICS_EVENTS.PAGE_VIEW]: "Vue de page",
  [ANALYTICS_EVENTS.RECRUIT_CLICK]: "Clic recrutement",
  [ANALYTICS_EVENTS.APPLICATION_STARTED]: "Formulaire commencé",
  [ANALYTICS_EVENTS.APPLICATION_SUBMITTED]: "Candidature envoyée",
  [ANALYTICS_EVENTS.TRYOUT_BOOKED]: "Tryout réservé",
  [ANALYTICS_EVENTS.SUPPORT_GUEST_TICKET]: "Ticket invité",
  [ANALYTICS_EVENTS.HELP_ARTICLE_OPEN]: "Article d'aide ouvert",
  [ANALYTICS_EVENTS.DISCORD_CLICK]: "Clic Discord",
  [ANALYTICS_EVENTS.LIVE_CLICK]: "Clic live",
  [ANALYTICS_EVENTS.MATCH_VIEW]: "Vue match",
  [ANALYTICS_EVENTS.MERCH_CLICK]: "Clic boutique",
  [ANALYTICS_EVENTS.PARTNER_CLICK]: "Clic partenaire",
  [ANALYTICS_EVENTS.DONATE_CLICK]: "Clic don",
  [ANALYTICS_EVENTS.NEWSLETTER_SIGNUP]: "Inscription newsletter",
  [ANALYTICS_EVENTS.GLOBAL_SEARCH]: "Recherche globale",
  [ANALYTICS_EVENTS.SHARE]: "Partage",
  [ANALYTICS_EVENTS.ANNOUNCEMENT_VIEW]: "Annonce vue",
  [ANALYTICS_EVENTS.ANNOUNCEMENT_CLICK]: "Annonce cliquée",
};

const KPI = ({ label, value, hint, Icon }) => (
  <div className="border border-white/10 bg-[#141414] px-4 py-4">
    <div className="flex items-center justify-between mb-1">
      <p className="text-xs uppercase tracking-widest text-[#c8c8c8]">{label}</p>
      <Icon size={14} className="text-[#D8CA82]" aria-hidden="true" />
    </div>
    <p className="font-display font-bold text-2xl text-[#f7f7f7]">{value}</p>
    {hint && <p className="text-[11px] text-[#c8c8c8]/60 mt-0.5">{hint}</p>}
  </div>
);

export const AdminAnalytics = () => {
  const { lang } = useLang();
  const tx = useAdminT();
  const [days, setDays] = useState(30);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError("");
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    // `timestamp` est un ISO 8601 : la comparaison lexicographique est valide.
    const q = query(
      collection(db, "analytics_events"),
      where("timestamp", ">=", since),
      limit(5000),
    );
    return onSnapshot(q, (snap) => {
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (e) => {
      console.error("analytics", e);
      setError(tx("an.error"));
      setLoading(false);
    });
  }, [days, refreshKey, tx]);

  const summary = useMemo(
    () => summarizeAnalytics(events, { days }),
    [events, days],
  );

  const fmtDate = (iso) => {
    const date = new Date(`${iso}T00:00:00`);
    return date.toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", { day: "2-digit", month: "2-digit" });
  };

  const nf = useMemo(() => new Intl.NumberFormat(lang === "en" ? "en-US" : "fr-FR"), [lang]);
  const consent = analyticsConsentGranted();

  return (
    <div data-testid="admin-analytics">
      <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="text-[#D8CA82]" size={18} />
            <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">{tx("an.title")}</h2>
          </div>
          <p className="text-sm text-[#f7f7f7]/50 max-w-2xl">{tx("an.sub")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-white/15" role="group" aria-label={tx("an.title")}>
            {RANGES.map((r) => (
              <button key={r} type="button" onClick={() => setDays(r)} data-testid={`admin-analytics-range-${r}`}
                aria-pressed={days === r}
                className={`px-3 py-2 text-xs uppercase tracking-widest ${days === r ? "bg-[#D8CA82] text-[#111111]" : "text-[#c8c8c8] hover:text-[#f7f7f7]"}`}>
                {tx(`an.range.${r}`)}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setRefreshKey((k) => k + 1)} data-testid="admin-analytics-refresh"
            className="inline-flex items-center gap-2 border border-white/20 text-[#f7f7f7] text-xs uppercase tracking-widest px-3 py-2 hover:border-[#D8CA82] hover:text-[#D8CA82]">
            <RefreshCw size={13} /> {tx("an.refresh")}
          </button>
        </div>
      </div>

      {!consent && (
        <p className="text-xs border border-amber-400/40 bg-amber-400/10 text-amber-200 px-3 py-2 mb-4" role="status">
          {tx("an.consent.off")}
        </p>
      )}
      <p className="text-xs text-[#c8c8c8]/60 mb-6">{tx("an.hint")}</p>

      {error && <p className="text-sm text-red-300 mb-4" role="alert">{error}</p>}
      {loading ? (
        <p className="text-sm text-[#c8c8c8]">{tx("an.loading")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6" data-testid="admin-analytics-kpis">
            <KPI label={tx("an.kpi.views")} value={nf.format(summary.views)} Icon={Eye} />
            <KPI label={tx("an.kpi.sessions")} value={nf.format(summary.sessions)} Icon={Users} />
            <KPI label={tx("an.kpi.applications")} value={nf.format(summary.funnel.submitted)} Icon={Activity}
              hint={`${summary.funnel.started} ${tx("an.funnel.started").toLowerCase()}`} />
            <KPI label={tx("an.kpi.conversion")} value={`${summary.funnel.rate} %`} Icon={MousePointerClick} />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8" data-testid="admin-analytics-secondary-kpis">
            <KPI label={tx("an.kpi.recruit")} value={nf.format(summary.kpis.recruitClicks)} Icon={MousePointerClick} />
            <KPI label={tx("an.kpi.donate")} value={nf.format(summary.kpis.donateClicks)} Icon={MousePointerClick} />
            <KPI label={tx("an.kpi.partners")} value={nf.format(summary.kpis.partnerClicks)} Icon={MousePointerClick} />
            <KPI label={tx("an.kpi.newsletter")} value={nf.format(summary.kpis.newsletterSignups)} Icon={Users} />
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 border border-white/10 bg-[#141414] p-4">
              <p className="font-display text-xs uppercase tracking-[0.25em] text-[#D8CA82] mb-4">{tx("an.chart.daily")}</p>
              <div className="h-64" data-testid="admin-analytics-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={summary.daily} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: "#c8c8c8", fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "#c8c8c8", fontSize: 10 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: "#1A1A1A", border: "1px solid rgba(216,202,130,0.3)", borderRadius: 0, color: "#f7f7f7" }}
                      labelFormatter={fmtDate}
                      formatter={(value, name) => [value, name === "views" ? tx("an.kpi.views") : tx("an.chart.events")]}
                    />
                    <Line type="monotone" dataKey="views" stroke="#D8CA82" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="events" stroke="#6b7280" strokeWidth={1} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="border border-white/10 bg-[#141414] p-4">
              <p className="font-display text-xs uppercase tracking-[0.25em] text-[#D8CA82] mb-4">{tx("an.chart.topPages")}</p>
              {summary.pages.length === 0 ? (
                <p className="text-sm text-[#c8c8c8]">{tx("an.empty")}</p>
              ) : (
                <ul className="space-y-2" data-testid="admin-analytics-top-pages">
                  {summary.pages.slice(0, 10).map((page) => (
                    <li key={page.path} className="text-sm">
                      <div className="flex items-center justify-between gap-2 text-[#f7f7f7]/80">
                        <span className="truncate">{page.path}</span>
                        <span className="text-[#D8CA82] tabular-nums">{nf.format(page.count)}</span>
                      </div>
                      <div className="h-1 bg-white/10 mt-1">
                        <div className="h-full bg-[#D8CA82]/70" style={{ width: `${Math.max(4, (page.count / summary.pages[0].count) * 100)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mt-6">
            <div className="border border-white/10 bg-[#141414] p-4" data-testid="admin-analytics-funnel">
              <p className="font-display text-xs uppercase tracking-[0.25em] text-[#D8CA82] mb-4">{tx("an.funnel.title")}</p>
              <div className="space-y-4">
                {[
                  { label: tx("an.funnel.started"), value: summary.funnel.started, max: Math.max(1, summary.funnel.started) },
                  { label: tx("an.funnel.submitted"), value: summary.funnel.submitted, max: Math.max(1, summary.funnel.started) },
                ].map((step) => (
                  <div key={step.label}>
                    <div className="flex items-center justify-between text-sm text-[#f7f7f7]/80 mb-1">
                      <span>{step.label}</span>
                      <span className="tabular-nums">{nf.format(step.value)}</span>
                    </div>
                    <div className="h-2 bg-white/10">
                      <div className="h-full bg-[#D8CA82]" style={{ width: `${Math.min(100, (step.value / step.max) * 100)}%` }} />
                    </div>
                  </div>
                ))}
                <p className="text-xs uppercase tracking-widest text-[#c8c8c8]">
                  {tx("an.funnel.rate")} : <span className="text-[#D8CA82]">{summary.funnel.rate} %</span>
                </p>
              </div>
            </div>

            <div className="border border-white/10 bg-[#141414] p-4">
              <p className="font-display text-xs uppercase tracking-[0.25em] text-[#D8CA82] mb-4">{tx("an.chart.events")}</p>
              {summary.topEvents.length === 0 ? (
                <p className="text-sm text-[#c8c8c8]">{tx("an.empty")}</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.topEvents.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fill: "#c8c8c8", fontSize: 10 }}
                        tickFormatter={(name) => EVENT_LABELS[name] || name} />
                      <Tooltip
                        contentStyle={{ background: "#1A1A1A", border: "1px solid rgba(216,202,130,0.3)", borderRadius: 0, color: "#f7f7f7" }}
                        formatter={(value) => [value, tx("an.table.count")]}
                        labelFormatter={(name) => EVENT_LABELS[name] || name}
                      />
                      <Bar dataKey="count" fill="#D8CA82" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="border border-white/10 bg-[#141414] mt-6" data-testid="admin-analytics-event-table">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <p className="font-display text-xs uppercase tracking-[0.25em] text-[#D8CA82]">{tx("an.plan.title")}</p>
              <p className="text-xs text-[#c8c8c8]/60">{summary.totalEvents} {tx("an.table.count")}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-widest text-[#c8c8c8] border-b border-white/10">
                    <th className="px-4 py-2">{tx("an.table.event")}</th>
                    <th className="px-4 py-2">{tx("an.table.count")}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(ANALYTICS_EVENTS).map(([, name]) => (
                    <tr key={name} className="border-b border-white/5">
                      <td className="px-4 py-2 text-[#f7f7f7]/80">
                        <span className="text-[#c8c8c8] mr-2">{EVENT_LABELS[name] || name}</span>
                        <code className="text-[11px] text-[#D8CA82]/70">{name}</code>
                      </td>
                      <td className="px-4 py-2 text-[#D8CA82] tabular-nums">{nf.format(summary.counts[name] || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
