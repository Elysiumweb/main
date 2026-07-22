import { Link, NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Menu, X, Shield, LogOut, Gamepad2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { NotificationsBell } from "./NotificationsBell";

const linkCls = ({ isActive }) =>
  `text-xs uppercase tracking-[0.18em] transition-colors ${isActive ? "text-[#D8CA82]" : "text-[#f7f7f7]/70 hover:text-[#D8CA82]"}`;

export const Navbar = () => {
  const { user, hasPlayerAccess, isOfficial, displayName, logout } = useAuth();
  const { t, lang, toggle } = useLang();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const links = [
    { to: "/", label: t("nav.home") },
    { to: "/equipe", label: t("nav.team") },
    { to: "/resultats", label: t("nav.results") },
    { to: "/actus", label: t("nav.news") },
    { to: "/medias", label: t("nav.media") },
    { to: "/calendrier", label: t("nav.calendar") },
    { to: "/support", label: t("nav.support") },
    { to: "/recrutement", label: t("nav.recruitment") },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#111111]/80 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        <Link to="/" data-testid="nav-logo-link" className="flex items-center gap-3 shrink-0">
          <img src="/brand/logo-horizontal-white.png" alt="Elysium" className="h-9 hidden sm:block" />
          <img src="/brand/logo-icon-gold.png" alt="Elysium" className="h-9 sm:hidden" />
        </Link>
        <nav className="hidden lg:flex items-center gap-5">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={linkCls} data-testid={`nav-link-${l.to === "/" ? "home" : l.to.slice(1)}`}>
              {l.label}
            </NavLink>
          ))}
          {hasPlayerAccess && (
            <NavLink to="/espace-joueur" className={linkCls} data-testid="nav-link-player-space">
              <span className="inline-flex items-center gap-1.5"><Gamepad2 size={14} />{t("nav.playerSpace")}</span>
            </NavLink>
          )}
          {isOfficial && (
            <NavLink to="/admin" className={linkCls} data-testid="nav-link-admin">
              <span className="inline-flex items-center gap-1.5"><Shield size={14} />{t("nav.admin")}</span>
            </NavLink>
          )}
        </nav>
        <div className="flex items-center gap-3">
          {user && <NotificationsBell />}
          <button onClick={toggle} data-testid="lang-toggle-btn"
            className="text-xs font-display tracking-widest border border-white/20 px-2.5 py-1.5 text-[#f7f7f7]/70 hover:border-[#D8CA82]/60 hover:text-[#D8CA82] transition-colors">
            {lang === "fr" ? "EN" : "FR"}
          </button>
          {user ? (
            <div className="flex items-center gap-3">
              <Link to="/profil" data-testid="nav-username" title={t("nav.profile")}
                className="hidden sm:block text-sm text-[#D8CA82] font-semibold max-w-[120px] truncate hover:underline">{displayName}</Link>
              <button onClick={() => { logout(); navigate("/"); }} data-testid="nav-logout-btn"
                className="text-[#f7f7f7]/60 hover:text-[#D8CA82] transition-colors" title={t("nav.logout")}>
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <Link to="/connexion" data-testid="nav-login-btn"
              className="bg-[#D8CA82] text-[#111111] text-xs font-display font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
              {t("nav.login")}
            </Link>
          )}
          <button className="lg:hidden text-[#f7f7f7]" onClick={() => setOpen(!open)} data-testid="nav-mobile-toggle">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="lg:hidden border-t border-white/10 px-6 py-4 flex flex-col gap-4 bg-[#111111]" data-testid="nav-mobile-menu">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={linkCls} onClick={() => setOpen(false)}>{l.label}</NavLink>
          ))}
          {hasPlayerAccess && <NavLink to="/espace-joueur" className={linkCls} onClick={() => setOpen(false)}>{t("nav.playerSpace")}</NavLink>}
          {isOfficial && <NavLink to="/admin" className={linkCls} onClick={() => setOpen(false)}>{t("nav.admin")}</NavLink>}
        </nav>
      )}
    </header>
  );
};
