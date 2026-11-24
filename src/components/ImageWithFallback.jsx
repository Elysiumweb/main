import { useState } from "react";
import { Image as ImageIcon, PlayCircle } from "lucide-react";

/**
 * Image avec fallback élégant pour la médiathèque et les visuels.
 * Remplace les tuiles vides (display: none) par un visuel propre aux couleurs d'Elysium.
 */
export const ImageWithFallback = ({
  src,
  alt = "",
  className = "",
  fallbackType = "brand", // "brand" | "initials" | "video"
  initials = "",
  aspectRatio = "aspect-video",
  ...props
}) => {
  const [error, setError] = useState(false);

  if (!src || error) {
    if (fallbackType === "initials") {
      const safeInitials = initials
        ? initials.slice(0, 2).toUpperCase()
        : alt
          ? alt.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "?"
          : "?";
      return (
        <div
          role="img"
          aria-label={alt || "Image indisponible"}
          className={`${className} bg-background/70 flex items-center justify-center border border-border/25 text-muted-foreground font-display tracking-widest text-xs uppercase select-none`}
        >
          <span aria-hidden="true">{safeInitials}</span>
        </div>
      );
    }

    if (fallbackType === "video") {
      return (
        <div
          className={`${className} relative bg-background/70 flex items-center justify-center overflow-hidden border border-border/25`}
        >
          <div className="absolute inset-0 canvas-dots opacity-40" />
          <PlayCircle size={40} className="text-primary drop-shadow-[0_0_8px_rgba(0,0,0,0.8)]" aria-hidden="true" />
        </div>
      );
    }

    return (
      <div
        className={`${className} relative bg-background/70 flex items-center justify-center overflow-hidden border border-border/25`}
      >
        <div className="absolute inset-0 canvas-dots opacity-30" />
        <img
          src="/brand/logo-icon-gold.png"
          alt=""
          aria-hidden="true"
          className="w-1/4 max-w-[48px] opacity-35 object-contain"
        />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setError(true)}
      loading="lazy"
      decoding="async"
      className={className}
      {...props}
    />
  );
};
