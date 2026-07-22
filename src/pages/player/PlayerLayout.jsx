import { NavLink, Outlet, Navigate } from "react-router-dom";
import { MessageSquare, CalendarDays, StickyNote, LayoutDashboard, Activity } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";

export default function PlayerLayout() {
  const { user, loading, hasPlayerAccess, game, roster, role, isOfficial } = useAuth();
  const { t } = useLang();

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-[#f7f7f7]/40">{t("common.loading")}</div>;
  if (!user) return <Navigate to="/connexion" replace />;
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
    <div className="flex h-[calc(100vh-4rem)] bg-[#111111]" data-testid="player-space">
      <aside className="w-16 sm:w-56 border-r border-white/10 bg-[#0c0c0c] flex flex-col shrink-0">
        <div className="p-4 border-b border-white/10 hidden sm:block">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#f7f7f7]/40">{t("nav.playerSpace")}</p>
          <p className="text-sm font-display text-[#D8CA82] mt-1 uppercase" data-testid="player-game-badge">
            {isOfficial ? "OFFICIEL" : `${t(`admin.role.${role}`)}${game ? ` · ${game}` : ""}${roster ? ` · ${roster}` : ""}`}
          </p>
        </div>
        <nav className="flex-1 py-4 space-y-1">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} data-testid={`player-tab-${to}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-3 text-sm uppercase tracking-wider transition-colors ${isActive ? "text-[#D8CA82] bg-[#D8CA82]/10 border-r-2 border-[#D8CA82]" : "text-[#f7f7f7]/50 hover:text-[#f7f7f7]"}`}>
              <Icon size={18} className="shrink-0" />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
