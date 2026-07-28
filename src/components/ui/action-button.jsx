import * as React from "react";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/* =====================================================================
 * ActionButton — bouton standardisé Elysium
 * ---------------------------------------------------------------------
 * États couverts : normal · hover · focus · désactivé · chargement · succès
 *
 * Le style "désactivé" n'est PAS un simple opacity-50 : on change la
 * surface (gris plein), la bordure (pointillés), le curseur et on expose
 * aria-disabled + une raison lisible (disabledReason) pour l'utilisateur.
 * Le texte désactivé reste à un contraste AA (#9a9a9a sur #232323).
 * =================================================================== */

const BASE =
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none font-display font-bold uppercase " +
  "tracking-widest select-none border transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out " +
  "motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-[#D8CA82]";

const VARIANTS = {
  primary:
    "bg-[#D8CA82] text-[#111111] border-[#D8CA82] hover:bg-[#e4d896] hover:shadow-[0_0_18px_rgba(216,202,130,0.45)] " +
    "hover:-translate-y-[1px] active:translate-y-0 active:bg-[#c9bb73] motion-reduce:hover:translate-y-0",
  secondary:
    "bg-transparent text-[#f7f7f7] border-white/25 hover:border-[#D8CA82] hover:text-[#D8CA82] hover:bg-[#D8CA82]/[0.07] " +
    "active:bg-[#D8CA82]/15",
  ghost:
    "bg-transparent text-[#c8c8c8] border-transparent hover:text-[#D8CA82] hover:bg-[#D8CA82]/10 active:bg-[#D8CA82]/15",
  danger:
    "bg-[#8c1d18] text-[#ffffff] border-[#8c1d18] hover:bg-[#a52a24] hover:border-[#a52a24] " +
    "hover:shadow-[0_0_16px_rgba(140,29,24,0.5)] active:bg-[#7a1813]",
  dangerOutline:
    "bg-transparent text-[#ff9b95] border-[#ff9b95]/50 hover:bg-[#8c1d18]/25 hover:border-[#ff9b95] hover:text-[#ffd0cd] " +
    "active:bg-[#8c1d18]/40",
};

const SIZES = {
  sm: "text-[11px] px-3.5 py-2 min-h-[36px] [&_svg]:size-3.5",
  md: "text-xs px-6 py-3 min-h-[44px] [&_svg]:size-4",
  lg: "text-sm px-8 py-4 min-h-[52px] [&_svg]:size-[18px]",
  icon: "p-0 w-11 h-11 min-h-[44px] [&_svg]:size-[18px]",
};

/* Surface désactivée explicite : jamais un simple manque de contraste. */
const DISABLED =
  "bg-[#232323] text-[#9a9a9a] border-dashed border-white/25 cursor-not-allowed shadow-none " +
  "hover:bg-[#232323] hover:text-[#9a9a9a] hover:border-white/25 hover:shadow-none hover:translate-y-0";

const SUCCESS =
  "bg-emerald-400 text-[#0b1a12] border-emerald-400 hover:bg-emerald-400 hover:shadow-none hover:translate-y-0";

export const ActionButton = React.forwardRef(function ActionButton(
  {
    as: Comp = "button",
    variant = "primary",
    size = "md",
    loading = false,
    success = false,
    disabled = false,
    disabledReason,
    loadingLabel = "Chargement…",
    successLabel,
    icon: Icon,
    className,
    children,
    type,
    ...props
  },
  ref
) {
  const isButton = Comp === "button";
  const inert = disabled || loading;

  const classes = cn(
    BASE,
    SIZES[size] || SIZES.md,
    success ? SUCCESS : VARIANTS[variant] || VARIANTS.primary,
    disabled && DISABLED,
    loading && "cursor-progress",
    className
  );

  const content = (
    <>
      {loading ? (
        <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
      ) : success ? (
        <Check aria-hidden="true" />
      ) : Icon ? (
        <Icon aria-hidden="true" />
      ) : null}
      <span className={size === "icon" ? "sr-only" : undefined}>
        {loading ? loadingLabel : success && successLabel ? successLabel : children}
      </span>
      {/* Annonce vocale des transitions d'état */}
      <span className="sr-only" role="status" aria-live="polite">
        {loading ? loadingLabel : success ? successLabel || "Terminé" : ""}
      </span>
    </>
  );

  return (
    <Comp
      ref={ref}
      className={classes}
      aria-disabled={inert || undefined}
      aria-busy={loading || undefined}
      title={disabled && disabledReason ? disabledReason : props.title}
      {...(isButton
        ? { disabled: inert, type: type || "button" }
        : {
            tabIndex: inert ? -1 : props.tabIndex,
            onClick: inert
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }
              : props.onClick,
          })}
      {...props}
    >
      {content}
    </Comp>
  );
});

/* ---------------------------------------------------------------------
 * useAsyncAction — pilote proprement les états chargement → succès
 * ------------------------------------------------------------------- */
export const useAsyncAction = (fn, { successMs = 2200 } = {}) => {
  const [loading, setLoading] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const timer = React.useRef(null);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  const run = React.useCallback(
    async (...args) => {
      setLoading(true);
      setSuccess(false);
      try {
        const res = await fn(...args);
        setSuccess(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setSuccess(false), successMs);
        return res;
      } finally {
        setLoading(false);
      }
    },
    [fn, successMs]
  );

  return { run, loading, success };
};
