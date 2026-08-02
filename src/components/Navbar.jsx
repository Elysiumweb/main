import { Link, NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { Menu, X, Shield, LogOut, Gamepad2, Search, Heart, ChevronDown } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { NotificationsBell } from "./NotificationsBell";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const linkCls = ({ isActive }) =>
  `text-xs uppercase tracking-[0.18em] transition-colors ${isActive ? "text-[#D8CA82]" : "text-[#f7f7f7]/70 hover:text-[#D8CA82]"}`;

const mobileLinkCls = ({ isActive }) =>
  `text-xs uppercase tracking-[0.18em] transition-colors min-h-[44px] flex items-center ${isActive ? "text-[#D8CA82] font-semibold" : "text-[#f7f7f7]/70 hover:text-[#D8CA82]"}`;

export const Navbar = () => {
  const { user, hasPlayerAccess, isOfficial, displayName, logout } = useAuth();
  const { t, lang, toggle } = useLang();
  const [open, setOpen] = useState(false);
  const headerRef = useRef(null);
  const navigate = useNavigate();

  const links = [
    { to: "/", label: t("nav.home") },
    { to: "/equipe", label: t("nav.team") },
    { to: "/resultats", label: t("nav.results") },
    { to: "/actus", label: t("nav.news") },
    { to: "/medias", label: t("nav.media") },
    { to: "/calendrier", label: t("nav.calendar") },
    { to: "/statistiques", label: t("nav.stats") },
    { to: "/support", label: t("nav.support") },
    { to: "/recrutement", label: t("nav.recruitment") },
    { to: "/partenaires", label: t("nav.partners") },
  ];

  // Liens secondaires regroupés dans un menu « Plus » pour ne pas saturer la barre.
  const moreLinks = [
    { to: "/competitions", label: t("nav.competitions") },
    { to: "/a-propos", label: t("nav.about") },
    { to: "/presse", label: t("nav.press") },
  ];

  const openSearch = (e) => {
    e.preventDefault();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
  };

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape" || e.key === "Esc") {
        setOpen(false);
      }
    };

    const handleClickOutside = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  return (
    <header ref={headerRef} className="sticky top-0 z-50 bg-[#111111]/80 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        <Link to="/" data-testid="nav-logo-link" aria-label="Elysium — Accueil" className="flex items-center gap-3 shrink-0 min-h-[44px]">
          <img src="/brand/logo-horizontal-white.png" alt="" aria-hidden="true" className="h-9 hidden sm:block" />
          <img src="/brand/logo-icon-gold.png" alt="" aria-hidden="true" className="h-9 sm:hidden" />
        </Link>
        <nav className="hidden xl:flex items-center gap-5" aria-label="Navigation principale">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={linkCls} data-testid={`nav-link-${l.to === "/" ? "home" : l.to.slice(1)}`}
              onClick={() => l.to === "/recrutement" && trackEvent(ANALYTICS_EVENTS.RECRUIT_CLICK, { source: "navbar" })}>
              {l.label}
            </NavLink>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`${linkCls({ isActive: false })} flex items-center gap-1 min-h-[44px]`} data-testid="nav-link-more">
                {t("nav.more")} <ChevronDown size={12} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-[#161616] border border-white/15 rounded-none p-1.5 text-[#f7f7f7]" data-testid="nav-more-menu">
              {moreLinks.map((l) => (
                <DropdownMenuItem key={l.to} asChild className="rounded-none focus:bg-[#D8CA82]/10 focus:text-[#D8CA82] cursor-pointer">
                  <NavLink to={l.to} className="text-xs uppercase tracking-[0.18em] px-3 py-2.5" data-testid={`nav-more-link-${l.to.slice(1)}`}>
                    {l.label}
                  </NavLink>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {hasPlayerAccess && (
            <NavLink to="/espace-joueur" className={linkCls} data-testid="nav-link-player-space">
              <span className="inline-flex items-center gap-1.5"><Gamepad2 size={14} aria-hidden="true" />{t("nav.playerSpace")}</span>
            </NavLink>
          )}
          {isOfficial && (
            <NavLink to="/admin" className={linkCls} data-testid="nav-link-admin">
              <span className="inline-flex items-center gap-1.5"><Shield size={14} aria-hidden="true" />{t("nav.admin")}</span>
            </NavLink>
          )}
        </nav>
        <div className="flex items-center gap-3">
          {/* Donation CTA */}
          <Link
            to="/soutenir"
            data-testid="nav-donate-btn"
            title={t("donate.cta")}
            className="border border-[#D8CA82]/50 text-[#D8CA82] text-[11px] font-display font-bold uppercase tracking-widest px-3 py-2 hidden sm:flex items-center gap-1.5 hover:bg-[#D8CA82]/10 hover:border-[#D8CA82] transition-colors motion-reduce:transition-none min-h-[44px] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
          >
            <Heart size={13} aria-hidden="true" />
            <span className="hidden lg:inline">{t("nav.donate")}</span>
          </Link>
          {/* Global Search Button */}
          <button
            onClick={openSearch}
            data-testid="nav-search-btn"
            aria-label={`${t("search.title")} (${t("search.shortcut")})`}
            className="text-[#c8c8c8] hover:text-[#D8CA82] transition-colors hidden sm:flex items-center gap-1.5 border border-white/10 px-2.5 py-1.5 text-xs min-h-[44px] motion-reduce:transition-none"
            title={`${t("search.title")} (${t("search.shortcut")})`}
          >
            <Search size={14} aria-hidden="true" />
            <span className="hidden md:inline text-[#c8c8c8] text-[10px] tracking-wider">{t("search.shortcut")}</span>
          </button>
          {user && <NotificationsBell />}
          <button
            onClick={toggle}
            data-testid="lang-toggle-btn"
            aria-label={lang === "fr" ? "Switch to English" : "Passer en français"}
            className="text-xs font-display tracking-widest border border-white/20 px-2.5 py-1.5 text-[#c8c8c8] hover:border-[#D8CA82]/60 hover:text-[#D8CA82] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center motion-reduce:transition-none"
          >
            <span aria-hidden="true">{lang === "fr" ? "EN" : "FR"}</span>
          </button>
          {user ? (
            <div className="flex items-center gap-3">
              <Link to="/profil" data-testid="nav-username" title={t("nav.profile")}
                className="hidden sm:block text-sm text-[#D8CA82] font-semibold max-w-[120px] truncate hover:underline">{displayName}</Link>
              <button
                onClick={() => { logout(); navigate("/"); }}
                data-testid="nav-logout-btn"
                aria-label={t("nav.logout")}
                className="text-[#c8c8c8] hover:text-[#D8CA82] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center motion-reduce:transition-none"
                title={t("nav.logout")}
              >
                <LogOut size={18} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <Link to="/connexion" data-testid="nav-login-btn"
              className="bg-[#D8CA82] text-[#111111] text-xs font-display font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow min-h-[44px] flex items-center justify-center motion-reduce:transition-none">
              {t("nav.login")}
            </Link>
          )}
          <button
            id="nav-mobile-toggle-btn"
            aria-expanded={open}
            aria-controls="nav-mobile-menu"
            aria-label={open ? t("nav.menu.close") : t("nav.menu.open")}
            className="xl:hidden text-[#f7f7f7] min-w-[44px] min-h-[44px] flex items-center justify-center"
            onClick={() => setOpen(!open)}
            data-testid="nav-mobile-toggle"
          >
            {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="nav-mobile-menu"
          aria-label={t("nav.menu.open")}
          className="xl:hidden border-t border-white/10 px-6 py-4 flex flex-col bg-[#111111]"
          data-testid="nav-mobile-menu"
        >
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={mobileLinkCls} onClick={() => { setOpen(false); if (l.to === "/recrutement") trackEvent(ANALYTICS_EVENTS.RECRUIT_CLICK, { source: "mobile_navbar" }); }}>
              {l.label}
            </NavLink>
          ))}
          <NavLink to="/soutenir" className={mobileLinkCls} onClick={() => setOpen(false)} data-testid="nav-mobile-donate-link">
            <span className="inline-flex items-center gap-1.5"><Heart size={14} aria-hidden="true" />{t("nav.donate")}</span>
          </NavLink>
          <button
            onClick={(e) => { setOpen(false); openSearch(e); }}
            className="text-xs uppercase tracking-[0.18em] text-[#c8c8c8] hover:text-[#D8CA82] flex items-center gap-2 min-h-[44px]"
          >
            <Search size={14} aria-hidden="true" /> {t("search.title")}
          </button>
          {hasPlayerAccess && (
            <NavLink to="/espace-joueur" className={mobileLinkCls} onClick={() => setOpen(false)}>
              <span className="inline-flex items-center gap-1.5"><Gamepad2 size={14} aria-hidden="true" />{t("nav.playerSpace")}</span>
            </NavLink>
          )}
          {isOfficial && (
            <NavLink to="/admin" className={mobileLinkCls} onClick={() => setOpen(false)}>
              <span className="inline-flex items-center gap-1.5"><Shield size={14} aria-hidden="true" />{t("nav.admin")}</span>
            </NavLink>
          )}
          <div className="border-t border-white/10 my-2 pt-2">
            {moreLinks.map((l) => (
              <NavLink key={l.to} to={l.to} className={mobileLinkCls} onClick={() => setOpen(false)} data-testid={`nav-mobile-link-${l.to.slice(1)}`}>
                {l.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
};
