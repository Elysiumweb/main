import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../../lib/firebase";
import { useLang } from "../../lib/i18n";
import { CalendarDays, Trophy, Mail, Handshake, FileText, AlertTriangle, Activity, Users, Megaphone } from "lucide-react";

export const AdminDashboard = () => {
  const { t } = useLang();
  const [matches, setMatches] = useState([]);
  const [events, setEvents] = useState([]);
  const [articles, setArticles] = useState([]);
  const [partnerReqs, setPartnerReqs] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, "matches"), (s) => setMatches(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "communityEvents"), (s) => setEvents(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "articles"), (s) => setArticles(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "partner_requests"), (s) => setPartnerReqs(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "campaigns"), (s) => setCampaigns(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "users"), (s) => setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const now = new Date().toISOString().slice(0, 10);
  const upcomingMatches = useMemo(() => matches.filter((m) => m.status === "upcoming" || m.status === "live").sort((a, b) => (a.date || "").localeCompare(b.date || "")), [matches]);
  const drafts = useMemo(() => articles.filter((a) => a.status === "draft"), [articles]);
  const pendingPartners = useMemo(() => partnerReqs.filter((r) => !r.status || r.status === "new"), [partnerReqs]);
  const activeCampaign = campaigns.find((c) => c.active);

  return (
    <div className="space-y-8" data-testid="admin-dashboard">
      <div className="flex items-center gap-3 mb-2">
        <LayoutDashboard className="text-[#D8CA82]" size={18} />
        <h2 className="font-display text-base md:text-lg tracking-[0.3em] uppercase text-[#f7f7f7]">Tableau de bord</h2>
      </div>
      <p className="text-sm text-[#f7f7f7]/50">Vue d'ensemble — prochaines échéances et actions en attente.</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border border-white/10 bg-[#1A1A1A] p-5">
          <p className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/40 flex items-center gap-1.5"><CalendarDays size={12} /> Matchs à venir</p>
          <p className="font-display font-black text-3xl text-[#D8CA82] mt-2">{upcomingMatches.length}</p>
          {upcomingMatches[0] && <p className="text-xs text-[#f7f7f7]/50 mt-1 truncate">Prochain : {upcomingMatches[0].opponentName} — {upcomingMatches[0].date}</p>}
        </div>
        <div className="border border-white/10 bg-[#1A1A1A] p-5">
          <p className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/40 flex items-center gap-1.5"><Handshake size={12} /> Partenaires en attente</p>
          <p className="font-display font-black text-3xl text-amber-300 mt-2">{pendingPartners.length}</p>
          <p className="text-xs text-[#f7f7f7]/50 mt-1">{pendingPartners.length ? "À recontacter" : "Aucune demande"}</p>
        </div>
        <div className="border border-white/10 bg-[#1A1A1A] p-5">
          <p className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/40 flex items-center gap-1.5"><FileText size={12} /> Brouillons</p>
          <p className="font-display font-black text-3xl text-[#f7f7f7] mt-2">{drafts.length}</p>
          <p className="text-xs text-[#f7f7f7]/50 mt-1">{articles.filter((a) => a.status === "deleted").length} en corbeille</p>
        </div>
        <div className="border border-white/10 bg-[#1A1A1A] p-5">
          <p className="text-[10px] uppercase tracking-widest text-[#f7f7f7]/40 flex items-center gap-1.5"><Users size={12} /> Membres</p>
          <p className="font-display font-black text-3xl text-[#f7f7f7] mt-2">{users.length}</p>
          <p className="text-xs text-[#f7f7f7]/50 mt-1">{users.filter((u) => u.role === "player").length} joueurs</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="border border-white/10 bg-[#1A1A1A] p-6">
          <h3 className="font-display text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-4 flex items-center gap-2"><Trophy size={14} /> Prochains matchs à compléter</h3>
          {upcomingMatches.length === 0 ? <p className="text-sm text-[#f7f7f7]/40">Aucun match à venir.</p> : (
            <ul className="space-y-2">
              {upcomingMatches.slice(0, 5).map((m) => (
                <li key={m.id} className="flex items-center justify-between border border-white/5 bg-[#111111] px-3 py-2 text-sm">
                  <span className="text-[#f7f7f7] truncate">{m.game} vs {m.opponentName} <span className="text-[#f7f7f7]/40">· {m.date}</span></span>
                  <span className={`text-[10px] uppercase tracking-widest border px-1.5 py-0.5 ${m.status === "live" ? "border-red-400/40 text-red-300" : "border-sky-300/40 text-sky-300"}`}>{m.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border border-white/10 bg-[#1A1A1A] p-6">
          <h3 className="font-display text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-4 flex items-center gap-2"><AlertTriangle size={14} /> Actions requises</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between border border-white/5 bg-[#111111] px-3 py-2"><span className="text-[#f7f7f7]/70">Demandes partenaires sans réponse</span><span className="font-bold text-amber-300">{pendingPartners.length}</span></li>
            <li className="flex items-center justify-between border border-white/5 bg-[#111111] px-3 py-2"><span className="text-[#f7f7f7]/70">Brouillons articles</span><span className="font-bold text-[#f7f7f7]">{drafts.length}</span></li>
            <li className="flex items-center justify-between border border-white/5 bg-[#111111] px-3 py-2"><span className="text-[#f7f7f7]/70">Campagne active</span><span className="text-[#D8CA82]">{activeCampaign ? `${activeCampaign.title} (${activeCampaign.current || 0}/${activeCampaign.goal || "?" }€)` : "Aucune"}</span></li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="#matches" onClick={(e)=>{e.preventDefault(); document.querySelector('[data-testid=\"admin-tab-matches\"]')?.click();}} className="text-xs uppercase tracking-widest border border-[#D8CA82]/30 text-[#D8CA82] px-3 py-1.5 hover:bg-[#D8CA82]/10">Gérer les matchs →</Link>
            <Link to="#partners" onClick={(e)=>{e.preventDefault(); document.querySelector('[data-testid=\"admin-tab-partners\"]')?.click();}} className="text-xs uppercase tracking-widest border border-white/20 text-[#f7f7f7]/60 px-3 py-1.5 hover:border-[#D8CA82] hover:text-[#D8CA82]">Partenaires →</Link>
          </div>
        </div>
      </div>

      <div className="border border-white/10 bg-[#0c0c0c] p-6">
        <h3 className="font-display text-xs uppercase tracking-[0.3em] text-[#f7f7f7]/60 mb-3 flex items-center gap-2"><Activity size={14} className="text-[#D8CA82]" /> État des intégrations</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {[
            ["Firebase", "Connecté", "emerald"],
            ["Resend / Brevo", "Config CMS", "sky"],
            ["PayPal", "Webhook à configurer (F-09)", "amber"],
            ["FCM Push", "Actif", "emerald"],
            ["Sentry", "Actif", "emerald"],
            ["ICS Feed", "Dynamique /calendrier", "emerald"],
          ].map(([label, status]) => (
            <div key={label} className="border border-white/10 bg-[#1A1A1A] px-3 py-2 flex items-center justify-between">
              <span className="text-[#f7f7f7]/70">{label}</span><span className="text-[#D8CA82]">{status}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#f7f7f7]/30 mt-3">Passez en revue les intégrations côté fonctions / env vars — ce panneau est informatif (F-07).</p>
      </div>
    </div>
  );
};

const LayoutDashboard = ({ size, className }) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
);
