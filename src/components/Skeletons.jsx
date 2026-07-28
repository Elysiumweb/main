/* =====================================================================
 * Skeletons — placeholders structurés (remplacent le texte "Chargement…")
 * Sharp edges, surfaces #1A1A1A, pulsation discrète, respect motion-reduce.
 * =================================================================== */

const Bar = ({ className = "" }) => (
  <span className={`block bg-white/[0.07] animate-pulse motion-reduce:animate-none ${className}`} aria-hidden="true" />
);

const Wrapper = ({ children, testId, label = "Chargement du contenu" }) => (
  <div data-testid={testId} role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}</span>
    {children}
  </div>
);

export const SkeletonMatchCard = () => (
  <div className="border border-white/10 bg-[#1A1A1A] p-6">
    <div className="flex items-center justify-between mb-5">
      <Bar className="h-4 w-16" />
      <Bar className="h-4 w-20" />
    </div>
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-col items-center gap-2 w-1/3">
        <Bar className="h-12 w-12" />
        <Bar className="h-3 w-16" />
      </div>
      <Bar className="h-8 w-16" />
      <div className="flex flex-col items-center gap-2 w-1/3">
        <Bar className="h-12 w-12" />
        <Bar className="h-3 w-16" />
      </div>
    </div>
    <div className="mt-5 pt-3 border-t border-white/10 flex justify-between">
      <Bar className="h-3 w-24" />
      <Bar className="h-3 w-20" />
    </div>
  </div>
);

export const SkeletonMediaCard = () => (
  <div className="border border-white/10 bg-[#1A1A1A] overflow-hidden">
    <Bar className="w-full aspect-video" />
    <div className="p-5 space-y-3">
      <Bar className="h-4 w-3/4" />
      <Bar className="h-3 w-1/2" />
    </div>
  </div>
);

export const SkeletonArticleCard = () => (
  <div className="border border-white/10 bg-[#1A1A1A] overflow-hidden">
    <Bar className="w-full aspect-[16/9]" />
    <div className="p-5 space-y-3">
      <Bar className="h-3 w-20" />
      <Bar className="h-4 w-5/6" />
      <Bar className="h-3 w-full" />
      <Bar className="h-3 w-2/3" />
    </div>
  </div>
);

export const SkeletonPlayerCard = () => (
  <div className="border border-white/10 bg-[#1A1A1A] overflow-hidden">
    <Bar className="w-full aspect-[3/4]" />
    <div className="p-5 space-y-3">
      <Bar className="h-5 w-2/3" />
      <Bar className="h-3 w-1/3" />
      <Bar className="h-3 w-full" />
    </div>
  </div>
);

export const SkeletonListRow = () => (
  <div className="flex items-center gap-4 border border-white/10 bg-[#1A1A1A] px-4 py-4">
    <Bar className="h-4 w-16 shrink-0" />
    <div className="flex-1 space-y-2">
      <Bar className="h-4 w-1/2" />
      <Bar className="h-3 w-1/3" />
    </div>
    <Bar className="h-9 w-9 shrink-0" />
  </div>
);

/* --- Grilles prêtes à l'emploi --- */

export const SkeletonGrid = ({
  count = 6,
  Card = SkeletonMatchCard,
  className = "grid sm:grid-cols-2 lg:grid-cols-3 gap-6",
  testId = "skeleton-grid",
  label,
}) => (
  <Wrapper testId={testId} label={label}>
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} />
      ))}
    </div>
  </Wrapper>
);

export const SkeletonList = ({ count = 5, testId = "skeleton-list", label }) => (
  <Wrapper testId={testId} label={label}>
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonListRow key={i} />
      ))}
    </div>
  </Wrapper>
);

export const SkeletonTable = ({ rows = 6, cols = 5, testId = "skeleton-table", label }) => (
  <Wrapper testId={testId} label={label}>
    {/* Desktop : lignes de tableau */}
    <div className="hidden md:block border border-white/10 bg-[#1A1A1A]">
      <div className="border-b border-white/10 px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Bar key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="border-b border-white/5 px-4 py-4 flex gap-4 items-center">
          {Array.from({ length: cols }).map((_, c) => (
            <Bar key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
    {/* Mobile : cartes */}
    <div className="md:hidden space-y-2">
      {Array.from({ length: Math.min(rows, 4) }).map((_, i) => (
        <SkeletonListRow key={i} />
      ))}
    </div>
  </Wrapper>
);

export const SkeletonStatCards = ({ count = 4, testId = "skeleton-stats" }) => (
  <Wrapper testId={testId}>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-white/10 bg-[#1A1A1A] p-6 space-y-3">
          <Bar className="h-3 w-20" />
          <Bar className="h-8 w-16" />
        </div>
      ))}
    </div>
  </Wrapper>
);
