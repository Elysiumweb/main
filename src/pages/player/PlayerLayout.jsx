import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom";
import { MessageSquare, CalendarDays, StickyNote, LayoutDashboard, Activity } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { AbsentTodayBar } from "../../components/AbsentTodayBar";
import { RouteChunkBoundary } from "../../components/RouteChunkBoundary";

export default function PlayerLayout() {
  const { user, loading, hasPlayerAccess, game, roster, role, isOfficial } = useAuth();
  const { t } = useLang();
  const location = useLocation();

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-[#c8c8c8]">{t("common.loading")}</div>;
  if (!user) return <Navigate to="/connexion" replace state={{ from: location }} />;
  if (!hasPlayerAccess) return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <p className="text-[#f7f7f7]/50 text-center" data-testid="player-no-access">{t("player.noAccess")}</p>
    </div>
  );

  const tabs = [
    { to: "chat", label: t("player.chat"), icon: MessageSquare },
    { to: "planning", label: t("player.planning"), icon: CalendarDays },
    { to: "notes", label: t("player.notes"), icon: StickyNote },
    { to: "tableau", label: t("player.canvas"), icon: LayoutDashboard },
    { to: "activite", label: t("player.activity"), icon: Activity },
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)] sm:h-[calc(100vh-4rem)] bg-[#111111] pb-16 sm:pb-0" data-testid="player-space">
      {/* Sidebar desktop — hidden on mobile (D-07) */}
      <aside className="hidden sm:flex w-56 border-r border-white/10 bg-[#0c0c0c] flex-col shrink-0" aria-label={t("nav.playerSpace")}>
        <div className="p-4 border-b border-white/10">
          <p className="text-xs uppercase tracking-[0.3em] text-[#c8c8c8]">{t("nav.playerSpace")}</p>
          <p className="text-sm font-display text-[#D8CA82] mt-1 uppercase" data-testid="player-game-badge">
            {isOfficial ? "OFFICIEL" : `${t(`admin.role.${role}`)}${game ? ` · ${game}` : ""}${roster ? ` · ${roster}` : ""}`}
          </p>
        </div>
        <nav className="flex-1 py-4 space-y-1">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} data-testid={`player-tab-${to}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-3 text-sm uppercase tracking-wider transition-colors min-h-[44px] ${isActive ? "text-[#D8CA82] bg-[#D8CA82]/10 border-r-2 border-[#D8CA82]" : "text-[#c8c8c8] hover:text-[#f7f7f7]"}`}>
              <Icon size={18} className="shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 min-h-0 overflow-hidden outline-none focus-visible:outline-none flex flex-col">
        <AbsentTodayBar />
        <div className="flex-1 min-h-0 overflow-hidden overflow-y-auto sm:overflow-hidden">
          <RouteChunkBoundary routeKey={location.pathname}>
            <Outlet />
          </RouteChunkBoundary>
        </div>
      </main>
      {/* Bottom navigation mobile — D-07 : 44px touch targets, agenda par défaut */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0c0c0c] border-t border-white/10 flex items-center justify-around px-2 py-1" aria-label={`${t("nav.playerSpace")} — mobile`} data-testid="player-bottom-nav">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} data-testid={`player-bottom-tab-${to}`}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px] px-3 py-2 text-xs uppercase tracking-wider ${isActive ? "text-[#D8CA82]" : "text-[#c8c8c8]"}`}>
            <Icon size={18} aria-hidden="true" />
            <span className="text-xs leading-none">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
