import { useEffect, useState } from "react";

/* =====================================================================
 * BrandImage — image à ratio fixe, recadrage uniforme et fallback marque
 * ---------------------------------------------------------------------
 * - `ratio` : classe Tailwind d'aspect-ratio (aspect-[16/9], aspect-[3/4]…)
 * - `fit`   : cover (recadrage uniforme, défaut) ou contain (logos)
 * - fallback : plaque sombre + icône Elysium, jamais un trou blanc
 * =================================================================== */

export const RATIOS = {
  card: "aspect-[16/9]",   // cartes d'articles / médias
  square: "aspect-square", // vignettes
  portrait: "aspect-[3/4]",// roster / joueurs
  wide: "aspect-[21/9]",   // bandeaux
};

export const BrandImage = ({
  src,
  alt = "",
  ratio = RATIOS.card,
  fit = "cover",
  className = "",
  imgClassName = "",
  fallbackSrc = "/brand/logo-icon-gold.png",
  fallbackLabel,
  loading = "lazy",
  testId,
  children,
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showFallback = !src || failed;

  return (
    <div
      className={`relative overflow-hidden bg-[#0d0d0d] ${ratio} ${className}`}
      data-testid={testId}
    >
      {showFallback ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0d0d0d]"
          role={fallbackLabel ? "img" : undefined}
          aria-label={fallbackLabel || undefined}
        >
          <div className="absolute inset-0 pattern-overlay" aria-hidden="true" />
          <img
            src={fallbackSrc}
            alt=""
            aria-hidden="true"
            className="w-1/4 max-w-[72px] min-w-[36px] opacity-30"
          />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          onError={() => setFailed(true)}
          className={`absolute inset-0 w-full h-full ${fit === "contain" ? "object-contain p-3" : "object-cover"} object-center ${imgClassName}`}
        />
      )}
      {children}
    </div>
  );
};
