import { Link, NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { Menu, X, Shield, LogOut, Gamepad2, Search, Heart, ChevronDown, User, Inbox } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { NotificationsBell } from "./NotificationsBell";
import { useInboxCounts } from "../hooks/useInboxCounts";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import { cn } from "../lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "./ui/dropdown-menu";

/* ---------- Design primitives (ELYSIUM: obsidian + divine gold) ---------- */

/** Bladed gold CTA — same look as the primary button of the design system. */
const goldBtnCls =
  "inline-flex items-center justify-center gap-2 clip-blade-sm bg-gold font-display text-xs font-bold uppercase tracking-widest text-primary-foreground px-4 min-h-[44px] transition-shadow duration-200 hover:shadow-[0_0_20px_oklch(0.84_0.095_98/0.45)]";

/** Framed outline CTA. */
const frameBtnCls =
  "inline-flex items-center justify-center gap-2 clip-blade-sm border border-primary/50 font-display text-xs font-bold uppercase tracking-widest text-primary px-3.5 min-h-[44px] transition-colors duration-200 hover:bg-primary/10 hover:border-primary";

const iconBtnCls =
  "inline-flex items-center justify-center border border-border/40 text-muted-foreground hover:text-primary hover:border-primary/60 transition-colors duration-200 w-11 h-11 min-w-[44px] min-h-[44px] clip-blade-sm";

const navLinkCls = ({ isActive }) =>
  cn(
    "group relative font-label text-xs font-semibold uppercase tracking-[0.24em] min-h-[44px] flex items-center transition-colors duration-200",
    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
  );

const navUnderline = (isActive) =>
  cn(
    "pointer-events-none absolute -bottom-0.5 left-0 h-px bg-primary transition-all duration-300",
    isActive ? "w-full" : "w-0 group-hover:w-full"
  );

const mobileLinkCls = ({ isActive }) =>
  cn(
    "flex items-baseline gap-4 border-b border-border/20 py-3.5 font-display text-lg font-bold uppercase transition-colors min-h-[44px]",
    isActive ? "text-primary" : "text-foreground hover:text-primary"
  );

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
      <div className={cn(className, "rounded-full bg-secondary border border-primary/40 flex items-center justify-center text-xs font-display font-bold text-primary select-none shrink-0")} aria-hidden="true">
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name || "Avatar"}
      onError={() => setErr(true)}
      className={cn(className, "rounded-full object-cover border border-primary/40 shrink-0")}
    />
  );
};

// Architecture D-05 : principal 5 + Découvrir 5 + CTA visibles + actions compactes
export const Navbar = () => {
  const { user, profile, hasPlayerAccess, isOfficial, role, displayName, logout, canSeeSupport, canSeeRecruit } = useAuth();
  const inbox = useInboxCounts();
  const canSeeInbox = !!user && (canSeeSupport || canSeeRecruit);
  const { t, lang, toggle } = useLang();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
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

  // Découvrir : médias, boutique, compétitions, stats, à propos, presse (D-05)
  const discoverLinks = [
    { to: "/medias", label: t("nav.media") },
    { to: "/boutique", label: t("nav.shop") },
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

  const allMobileLinks = [...principalLinks, ...discoverLinks, ...secondaryLinks];

  const openSearch = (e) => {
    e.preventDefault();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
  };

  // Glass header once the page moves — same behaviour as the design's site header.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
    <header
      ref={headerRef}
      className={cn(
        "sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500",
        scrolled ? "border-b border-border/30 bg-background/70 backdrop-blur-xl" : "border-b border-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
        <Link to="/" data-testid="nav-logo-link" aria-label="Elysium — Accueil" className="flex items-center gap-3 shrink-0 min-h-[44px]">
          <img src="/brand/logo-horizontal-white.png" alt="" aria-hidden="true" className="h-7 sm:h-8 hidden sm:block w-auto" />
          <img src="/brand/logo-icon-gold.png" alt="" aria-hidden="true" className="h-8 sm:hidden w-auto" />
        </Link>
        {/* Desktop : visible dès lg (pas xl) pour éviter le saut mobile -> dense */}
        <nav className="hidden lg:flex items-center gap-6" aria-label="Navigation principale">
          {principalLinks.map((l) => (
            <NavLink key={l.to} to={l.to} className={navLinkCls} data-testid={`nav-link-${l.to === "/" ? "home" : l.to.slice(1)}`}>
              {({ isActive }) => (
                <>
                  {l.label}
                  <span aria-hidden="true" className={navUnderline(isActive)} />
                </>
              )}
            </NavLink>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(navLinkCls({ isActive: false }), "gap-1")} data-testid="nav-link-more">
                Découvrir <ChevronDown size={12} aria-hidden="true" />
                <span aria-hidden="true" className={navUnderline(false)} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="panel clip-blade-sm rounded-none p-1.5 text-foreground min-w-[230px]" data-testid="nav-more-menu">
              <p className="eyebrow px-3 py-2 text-[0.62rem]">Découvrir</p>
              {discoverLinks.map((l) => (
                <DropdownMenuItem key={l.to} asChild className="rounded-none focus:bg-primary/10 focus:text-primary cursor-pointer">
                  <NavLink to={l.to} className="text-xs uppercase tracking-[0.18em] px-3 py-2.5 font-label" data-testid={`nav-more-link-${l.to.slice(1)}`}>
                    {l.label}
                  </NavLink>
                </DropdownMenuItem>
              ))}
              <div className="gold-line my-1 opacity-40" />
              <p className="eyebrow px-3 py-2 text-[0.62rem]">Communauté</p>
              {secondaryLinks.map((l) => (
                <DropdownMenuItem key={l.to} asChild className="rounded-none focus:bg-primary/10 focus:text-primary cursor-pointer">
                  <NavLink to={l.to} className="text-xs uppercase tracking-[0.18em] px-3 py-2.5 font-label" data-testid={`nav-more-link-${l.to.slice(1)}`}>
                    {l.label}
                  </NavLink>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {hasPlayerAccess && (
            <NavLink to="/espace-joueur" className={navLinkCls} data-testid="nav-link-player-space">
              {({ isActive }) => (
                <span className="inline-flex items-center gap-1.5">
                  <Gamepad2 size={14} aria-hidden="true" />{t("nav.playerSpace")}
                  <span aria-hidden="true" className={cn("absolute -bottom-0.5 left-0 h-px bg-primary transition-all duration-300", isActive ? "w-full" : "w-0")} />
                </span>
              )}
            </NavLink>
          )}
          {isOfficial && (
            <NavLink to="/admin" className={navLinkCls} data-testid="nav-link-admin">
              {({ isActive }) => (
                <span className="inline-flex items-center gap-1.5">
                  <Shield size={14} aria-hidden="true" />{t("nav.admin")}
                  <span aria-hidden="true" className={cn("absolute -bottom-0.5 left-0 h-px bg-primary transition-all duration-300", isActive ? "w-full" : "w-0")} />
                </span>
              )}
            </NavLink>
          )}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* CTAs visibles : Rejoindre + Soutenir — D-05 */}
          <Link
            to="/recrutement"
            data-testid="nav-cta-join"
            onClick={() => trackEvent(ANALYTICS_EVENTS.RECRUIT_CLICK, { source: "navbar" })}
            className={cn(goldBtnCls, "hidden sm:inline-flex")}
          >
            Rejoindre
          </Link>
          <Link
            to="/soutenir"
            data-testid="nav-donate-btn"
            title={t("donate.cta")}
            className={cn(frameBtnCls, "hidden sm:inline-flex")}
          >
            <Heart size={13} aria-hidden="true" />
            <span className="hidden lg:inline">{t("nav.donate")}</span>
          </Link>
          {/* Actions compactes : recherche / notif / langue / compte */}
          <button
            onClick={openSearch}
            data-testid="nav-search-btn"
            aria-label={`${t("search.title")} (${t("search.shortcut")})`}
            className={cn(iconBtnCls, "hidden sm:flex")}
            title={`${t("search.title")} (${t("search.shortcut")})`}
          >
            <Search size={16} aria-hidden="true" />
          </button>
          {canSeeInbox && (
            <Link
              to="/admin?tab=inbox"
              data-testid="nav-inbox-btn"
              aria-label={`${t("nav.admin")} — ${inbox.attention}`}
              title={`${t("nav.admin")} — ${inbox.attention}`}
              className={cn(iconBtnCls, "relative hidden sm:flex")}
            >
              <Inbox size={16} aria-hidden="true" />
              {inbox.attention > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-gold text-primary-foreground text-xs font-bold min-w-[15px] h-[15px] flex items-center justify-center px-0.5" data-testid="nav-inbox-badge">
                  {inbox.attention > 99 ? "99+" : inbox.attention}
                </span>
              )}
            </Link>
          )}
          {user && <NotificationsBell />}
          <button
            onClick={toggle}
            data-testid="lang-toggle-btn"
            aria-label={lang === "fr" ? "Switch to English" : "Passer en français"}
            className={cn(iconBtnCls, "font-label tracking-widest")}
          >
            <span aria-hidden="true">{lang === "fr" ? "EN" : "FR"}</span>
          </button>

          {/* User Avatar + Dropdown Menu */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-testid="nav-username"
                  className="flex items-center gap-2 clip-blade-sm border border-border/40 bg-secondary/60 hover:border-primary/60 px-2 py-1.5 transition-colors focus:outline-none min-h-[44px]"
                  aria-label={`${displayName} — ${t("nav.profile")}`}
                >
                  <UserAvatar src={photoUrl} name={displayName} className="h-7 w-7" />
                  <span className="hidden sm:inline text-xs font-semibold text-foreground max-w-[110px] truncate">
                    {displayName}
                  </span>
                  <ChevronDown size={12} className="text-muted-foreground" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="panel clip-blade-sm rounded-none p-2 text-foreground min-w-[230px]" data-testid="nav-user-dropdown">
                <div className="px-3 py-2 border-b border-border/20 mb-1">
                  <p className="text-xs font-display font-bold text-primary truncate">{displayName}</p>
                  {user.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
                  <span className="mt-1 inline-block eyebrow text-[0.6rem] px-1.5 py-0.5 border border-primary/30 clip-blade-sm">
                    {isOfficial ? "Officiel" : t(`admin.role.${role}`)}
                  </span>
                </div>
                <DropdownMenuItem asChild className="rounded-none focus:bg-primary/10 focus:text-primary cursor-pointer">
                  <Link to="/profil" className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] px-3 py-2 font-label" data-testid="nav-menu-profile">
                    <User size={13} aria-hidden="true" /> {t("nav.profile")}
                  </Link>
                </DropdownMenuItem>
                {hasPlayerAccess && (
                  <DropdownMenuItem asChild className="rounded-none focus:bg-primary/10 focus:text-primary cursor-pointer">
                    <Link to="/espace-joueur" className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] px-3 py-2 font-label" data-testid="nav-menu-player-space">
                      <Gamepad2 size={13} aria-hidden="true" /> {t("nav.playerSpace")}
                    </Link>
                  </DropdownMenuItem>
                )}
                {isOfficial && (
                  <DropdownMenuItem asChild className="rounded-none focus:bg-primary/10 focus:text-primary cursor-pointer">
                    <Link to="/admin" className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] px-3 py-2 font-label" data-testid="nav-menu-admin">
                      <Shield size={13} aria-hidden="true" /> {t("nav.admin")}
                    </Link>
                  </DropdownMenuItem>
                )}
                <div className="gold-line my-1 opacity-40" />
                <DropdownMenuItem asChild className="rounded-none focus:bg-red-500/10 focus:text-red-300 text-red-300/80 cursor-pointer">
                  <button
                    onClick={() => { logout(); navigate("/"); }}
                    data-testid="nav-logout-btn"
                    className="w-full flex items-center gap-2 text-xs uppercase tracking-[0.15em] px-3 py-2 text-left text-red-300/80 hover:text-red-300 font-label"
                  >
                    <LogOut size={13} aria-hidden="true" /> {t("nav.logout")}
                  </button>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/connexion" data-testid="nav-login-btn" className={goldBtnCls}>
              {t("nav.login")}
            </Link>
          )}

          <button
            id="nav-mobile-toggle-btn"
            aria-expanded={open}
            aria-controls="nav-mobile-menu"
            aria-label={open ? t("nav.menu.close") : t("nav.menu.open")}
            className={cn(iconBtnCls, "lg:hidden")}
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
          className="lg:hidden fixed inset-0 top-16 z-40 bg-background/95 backdrop-blur-xl overflow-y-auto border-t border-border/20 px-5 py-6 flex flex-col"
          data-testid="nav-mobile-menu"
        >
          {user && (
            <div className="flex items-center gap-3 pb-4 mb-5 border-b border-border/20">
              <UserAvatar src={photoUrl} name={displayName} className="h-10 w-10" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                <p className="eyebrow text-[0.6rem] mt-0.5">{isOfficial ? "Officiel" : t(`admin.role.${role}`)}</p>
              </div>
            </div>
          )}

          <div className="flex flex-col">
            {allMobileLinks.map((l, i) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={mobileLinkCls}
                onClick={() => setOpen(false)}
                data-testid={`nav-mobile-link-${l.to === "/" ? "home" : l.to.slice(1)}`}
              >
                <span className="font-label text-xs text-primary/70">{String(i + 1).padStart(2, "0")}</span>
                {l.label}
              </NavLink>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <NavLink
              to="/recrutement"
              className={cn(goldBtnCls, "w-full")}
              onClick={() => { setOpen(false); trackEvent(ANALYTICS_EVENTS.RECRUIT_CLICK, { source: "mobile_navbar" }); }}
              data-testid="nav-mobile-link-recrutement"
            >
              Rejoindre
            </NavLink>
            <NavLink
              to="/soutenir"
              className={cn(frameBtnCls, "w-full")}
              onClick={() => setOpen(false)}
              data-testid="nav-mobile-donate-link"
            >
              <Heart size={14} aria-hidden="true" />{t("nav.donate")}
            </NavLink>
            <button
              onClick={(e) => { setOpen(false); openSearch(e); }}
              className={cn(frameBtnCls, "w-full")}
            >
              <Search size={14} aria-hidden="true" /> {t("search.title")}
            </button>
            {user && (
              <NavLink to="/profil" className={cn(frameBtnCls, "w-full")} onClick={() => setOpen(false)} data-testid="nav-mobile-profile">
                <User size={14} aria-hidden="true" />{t("nav.profile")}
              </NavLink>
            )}
            {hasPlayerAccess && (
              <NavLink to="/espace-joueur" className={cn(frameBtnCls, "w-full")} onClick={() => setOpen(false)}>
                <Gamepad2 size={14} aria-hidden="true" />{t("nav.playerSpace")}
              </NavLink>
            )}
            {isOfficial && (
              <NavLink to="/admin" className={cn(frameBtnCls, "w-full")} onClick={() => setOpen(false)}>
                <Shield size={14} aria-hidden="true" />{t("nav.admin")}
              </NavLink>
            )}
            {user && (
              <button
                onClick={() => { setOpen(false); logout(); navigate("/"); }}
                className="clip-blade-sm border border-red-400/40 text-red-300/90 hover:bg-red-500/10 flex items-center justify-center gap-2 min-h-[44px] font-display text-xs font-bold uppercase tracking-widest"
              >
                <LogOut size={14} aria-hidden="true" /> {t("nav.logout")}
              </button>
            )}
          </div>
        </nav>
      )}
    </header>
  );
};
