import { Link, NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { Menu, X, Shield, LogOut, Gamepad2, Search, Heart, ChevronDown, User } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { NotificationsBell } from "./NotificationsBell";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const linkCls = ({ isActive }) =>
  `text-xs uppercase tracking-[0.18em] transition-colors ${isActive ? "text-[#D8CA82]" : "text-[#c8c8c8] hover:text-[#D8CA82]"}`;

const mobileLinkCls = ({ isActive }) =>
  `text-xs uppercase tracking-[0.18em] transition-colors min-h-[44px] flex items-center ${isActive ? "text-[#D8CA82] font-semibold" : "text-[#c8c8c8] hover:text-[#D8CA82]"}`;

export const UserAvatar = ({ src, name, className = "h-8 w-8" }) => {
  const [err, setErr] = useState(false);
  const initials = (name || "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("") || "E";

  if (!src || err) {
    return (
      <div className={`${className} rounded-full bg-[#1A1A1A] border border-[#D8CA82]/50 flex items-center justify-center text-xs font-display font-bold text-[#D8CA82] select-none shrink-0`} aria-hidden="true">
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name || "Avatar"}
      onError={() => setErr(true)}
      className={`${className} rounded-full object-cover border border-[#D8CA82]/50 shrink-0`}
    />
  );
};

// Architecture D-05 : principal 5 + Découvrir 5 + CTA visibles + actions compactes
export const Navbar = () => {
  const { user, profile, hasPlayerAccess, isOfficial, role, displayName, logout } = useAuth();
  const { t, lang, toggle } = useLang();
  const [open, setOpen] = useState(false);
  const headerRef = useRef(null);
  const navigate = useNavigate();

  const photoUrl = profile?.photoURL || user?.photoURL || "";

  // Principal : 5 liens max — dense -> lisible (D-05)
  const principalLinks = [
    { to: "/", label: t("nav.home") },
    { to: "/equipe", label: t("nav.team") },
    { to: "/resultats", label: t("nav.results") },
    { to: "/actus", label: t("nav.news") },
    { to: "/calendrier", label: t("nav.calendar") },
  ];

  // Découvrir : médias, compétitions, stats, à propos, presse (D-05)
  const discoverLinks = [
    { to: "/medias", label: t("nav.media") },
    { to: "/competitions", label: t("nav.competitions") },
    { to: "/statistiques", label: t("nav.stats") },
    { to: "/a-propos", label: t("nav.about") },
    { to: "/presse", label: t("nav.press") },
  ];

  // Liens secondaires conservés pour ne pas casser les parcours existants — regroupés dans Découvrir
  const secondaryLinks = [
    { to: "/support", label: t("nav.support") },
    { to: "/partenaires", label: t("nav.partners") },
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
        {/* Desktop : visible dès lg (pas xl) pour éviter le saut mobile -> dense */}
        <nav className="hidden lg:flex items-center gap-5" aria-label="Navigation principale">
          {principalLinks.map((l) => (
            <NavLink key={l.to} to={l.to} className={linkCls} data-testid={`nav-link-${l.to === "/" ? "home" : l.to.slice(1)}`}>
              {l.label}
            </NavLink>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`${linkCls({ isActive: false })} flex items-center gap-1 min-h-[44px]`} data-testid="nav-link-more">
                Découvrir <ChevronDown size={12} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-[#161616] border border-white/15 rounded-none p-1.5 text-[#f7f7f7] min-w-[220px]" data-testid="nav-more-menu">
              <p className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] px-3 py-2">Découvrir</p>
              {discoverLinks.map((l) => (
                <DropdownMenuItem key={l.to} asChild className="rounded-none focus:bg-[#D8CA82]/10 focus:text-[#D8CA82] cursor-pointer">
                  <NavLink to={l.to} className="text-xs uppercase tracking-[0.18em] px-3 py-2.5" data-testid={`nav-more-link-${l.to.slice(1)}`}>
                    {l.label}
                  </NavLink>
                </DropdownMenuItem>
              ))}
              <div className="border-t border-white/10 my-1" />
              <p className="text-xs uppercase tracking-[0.25em] text-[#c8c8c8] px-3 py-2">Communauté</p>
              {secondaryLinks.map((l) => (
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
        <div className="flex items-center gap-2 sm:gap-3">
          {/* CTAs visibles : Rejoindre + Soutenir — D-05 */}
          <Link
            to="/recrutement"
            data-testid="nav-cta-join"
            onClick={() => trackEvent(ANALYTICS_EVENTS.RECRUIT_CLICK, { source: "navbar" })}
            className="hidden sm:inline-flex bg-[#D8CA82] text-[#111111] text-xs font-display font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow min-h-[44px] items-center justify-center"
          >
            Rejoindre
          </Link>
          <Link
            to="/soutenir"
            data-testid="nav-donate-btn"
            title={t("donate.cta")}
            className="border border-[#D8CA82]/50 text-[#D8CA82] text-xs font-display font-bold uppercase tracking-widest px-3 py-2 hidden sm:flex items-center gap-1.5 hover:bg-[#D8CA82]/10 hover:border-[#D8CA82] transition-colors motion-reduce:transition-none min-h-[44px] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82]"
          >
            <Heart size={13} aria-hidden="true" />
            <span className="hidden lg:inline">{t("nav.donate")}</span>
          </Link>
          {/* Actions compactes : recherche / notif / langue / compte */}
          <button
            onClick={openSearch}
            data-testid="nav-search-btn"
            aria-label={`${t("search.title")} (${t("search.shortcut")})`}
            className="text-[#c8c8c8] hover:text-[#D8CA82] transition-colors hidden sm:flex items-center justify-center border border-white/10 w-11 h-11 min-h-[44px] min-w-[44px] motion-reduce:transition-none"
            title={`${t("search.title")} (${t("search.shortcut")})`}
          >
            <Search size={16} aria-hidden="true" />
          </button>
          {user && <NotificationsBell />}
          <button
            onClick={toggle}
            data-testid="lang-toggle-btn"
            aria-label={lang === "fr" ? "Switch to English" : "Passer en français"}
            className="text-xs font-display tracking-widest border border-white/20 w-11 h-11 text-[#c8c8c8] hover:border-[#D8CA82]/60 hover:text-[#D8CA82] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center motion-reduce:transition-none"
          >
            <span aria-hidden="true">{lang === "fr" ? "EN" : "FR"}</span>
          </button>

          {/* User Avatar + Dropdown Menu */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-testid="nav-username"
                  className="flex items-center gap-2 border border-white/15 bg-[#161616] hover:border-[#D8CA82]/50 px-2 py-1.5 transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8CA82] min-h-[44px]"
                  aria-label={`${displayName} — ${t("nav.profile")}`}
                >
                  <UserAvatar src={photoUrl} name={displayName} className="h-7 w-7" />
                  <span className="hidden sm:inline text-xs font-semibold text-[#f7f7f7] max-w-[110px] truncate">
                    {displayName}
                  </span>
                  <ChevronDown size={12} className="text-[#c8c8c8]" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[#161616] border border-white/15 rounded-none p-2 text-[#f7f7f7] min-w-[220px]" data-testid="nav-user-dropdown">
                <div className="px-3 py-2 border-b border-white/10 mb-1">
                  <p className="text-xs font-display font-bold text-[#D8CA82] truncate">{displayName}</p>
                  {user.email && <p className="text-xs text-[#c8c8c8] truncate">{user.email}</p>}
                  <span className="mt-1 inline-block text-xs uppercase tracking-widest px-1.5 py-0.5 border border-[#D8CA82]/30 text-[#D8CA82]/80">
                    {isOfficial ? "Officiel" : t(`admin.role.${role}`)}
                  </span>
                </div>
                <DropdownMenuItem asChild className="rounded-none focus:bg-[#D8CA82]/10 focus:text-[#D8CA82] cursor-pointer">
                  <Link to="/profil" className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] px-3 py-2" data-testid="nav-menu-profile">
                    <User size={13} aria-hidden="true" /> {t("nav.profile")}
                  </Link>
                </DropdownMenuItem>
                {hasPlayerAccess && (
                  <DropdownMenuItem asChild className="rounded-none focus:bg-[#D8CA82]/10 focus:text-[#D8CA82] cursor-pointer">
                    <Link to="/espace-joueur" className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] px-3 py-2" data-testid="nav-menu-player-space">
                      <Gamepad2 size={13} aria-hidden="true" /> {t("nav.playerSpace")}
                    </Link>
                  </DropdownMenuItem>
                )}
                {isOfficial && (
                  <DropdownMenuItem asChild className="rounded-none focus:bg-[#D8CA82]/10 focus:text-[#D8CA82] cursor-pointer">
                    <Link to="/admin" className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] px-3 py-2" data-testid="nav-menu-admin">
                      <Shield size={13} aria-hidden="true" /> {t("nav.admin")}
                    </Link>
                  </DropdownMenuItem>
                )}
                <div className="border-t border-white/10 my-1" />
                <DropdownMenuItem asChild className="rounded-none focus:bg-red-500/10 focus:text-red-300 text-red-300/80 cursor-pointer">
                  <button
                    onClick={() => { logout(); navigate("/"); }}
                    data-testid="nav-logout-btn"
                    className="w-full flex items-center gap-2 text-xs uppercase tracking-[0.15em] px-3 py-2 text-left text-red-300/80 hover:text-red-300"
                  >
                    <LogOut size={13} aria-hidden="true" /> {t("nav.logout")}
                  </button>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
            className="lg:hidden text-[#f7f7f7] min-w-[44px] min-h-[44px] flex items-center justify-center"
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
          className="lg:hidden fixed inset-0 top-16 z-40 bg-[#111111] overflow-y-auto border-t border-white/10 px-6 py-6 flex flex-col"
          data-testid="nav-mobile-menu"
        >
          {user && (
            <div className="flex items-center gap-3 pb-4 mb-4 border-b border-white/10">
              <UserAvatar src={photoUrl} name={displayName} className="h-10 w-10" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#f7f7f7] truncate">{displayName}</p>
                <p className="text-xs text-[#D8CA82] uppercase tracking-wider">{isOfficial ? "Officiel" : t(`admin.role.${role}`)}</p>
              </div>
            </div>
          )}
          <div className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-3">Principal</p>
              <div className="flex flex-col">
                {principalLinks.map((l) => (
                  <NavLink key={l.to} to={l.to} className={mobileLinkCls} onClick={() => setOpen(false)} data-testid={`nav-mobile-link-${l.to === "/" ? "home" : l.to.slice(1)}`}>
                    {l.label}
                  </NavLink>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-3">Découvrir</p>
              <div className="flex flex-col">
                {discoverLinks.map((l) => (
                  <NavLink key={l.to} to={l.to} className={mobileLinkCls} onClick={() => setOpen(false)} data-testid={`nav-mobile-link-${l.to.slice(1)}`}>
                    {l.label}
                  </NavLink>
                ))}
                {secondaryLinks.map((l) => (
                  <NavLink key={l.to} to={l.to} className={mobileLinkCls} onClick={() => setOpen(false)} data-testid={`nav-mobile-link-${l.to.slice(1)}`}>
                    {l.label}
                  </NavLink>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#D8CA82] mb-3">Communauté & Actions</p>
              <div className="flex flex-col">
                <NavLink to="/recrutement" className={mobileLinkCls} onClick={() => { setOpen(false); trackEvent(ANALYTICS_EVENTS.RECRUIT_CLICK, { source: "mobile_navbar" }); }} data-testid="nav-mobile-link-recrutement">
                  Rejoindre
                </NavLink>
                <NavLink to="/soutenir" className={mobileLinkCls} onClick={() => setOpen(false)} data-testid="nav-mobile-donate-link">
                  <span className="inline-flex items-center gap-1.5"><Heart size={14} aria-hidden="true" />{t("nav.donate")}</span>
                </NavLink>
                <button
                  onClick={(e) => { setOpen(false); openSearch(e); }}
                  className="text-xs uppercase tracking-[0.18em] text-[#c8c8c8] hover:text-[#D8CA82] flex items-center gap-2 min-h-[44px]"
                >
                  <Search size={14} aria-hidden="true" /> {t("search.title")}
                </button>
                {user && (
                  <NavLink to="/profil" className={mobileLinkCls} onClick={() => setOpen(false)} data-testid="nav-mobile-profile">
                    <span className="inline-flex items-center gap-1.5"><User size={14} aria-hidden="true" />{t("nav.profile")}</span>
                  </NavLink>
                )}
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
                {user && (
                  <button
                    onClick={() => { setOpen(false); logout(); navigate("/"); }}
                    className="text-xs uppercase tracking-[0.18em] text-red-300/80 hover:text-red-300 flex items-center gap-2 min-h-[44px]"
                  >
                    <LogOut size={14} aria-hidden="true" /> {t("nav.logout")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
};
