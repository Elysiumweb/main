import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { ActionButton } from "./ui/action-button";

/* =====================================================================
 * usePagination — pagination client simple, réinitialisée quand la
 * source ou les filtres changent (via la clé `resetKey`).
 * =================================================================== */
export const usePagination = (items = [], perPage = 12, resetKey = "") => {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [resetKey, perPage]);

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, pageCount);

  const slice = useMemo(
    () => items.slice((safePage - 1) * perPage, safePage * perPage),
    [items, safePage, perPage]
  );

  return {
    page: safePage,
    setPage,
    pageCount,
    total,
    items: slice,
    from: total === 0 ? 0 : (safePage - 1) * perPage + 1,
    to: Math.min(safePage * perPage, total),
  };
};

/* =====================================================================
 * useProgressiveList — "charger plus" pour les longues listes
 * =================================================================== */
export const useProgressiveList = (items = [], step = 9, resetKey = "") => {
  const [visible, setVisible] = useState(step);

  useEffect(() => {
    setVisible(step);
  }, [resetKey, step]);

  return {
    items: items.slice(0, visible),
    hasMore: items.length > visible,
    remaining: Math.max(0, items.length - visible),
    total: items.length,
    shown: Math.min(visible, items.length),
    loadMore: () => setVisible((v) => v + step),
  };
};

const pageNumbers = (page, pageCount) => {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const out = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i += 1) out.push(i);
  if (end < pageCount - 1) out.push("…");
  out.push(pageCount);
  return out;
};

/* =====================================================================
 * Pagination — contrôles accessibles (pages + compteur d'éléments)
 * =================================================================== */
export const Pagination = ({ page, pageCount, setPage, from, to, total, testId = "pagination", label = "éléments" }) => {
  if (pageCount <= 1) {
    return total > 0 ? (
      <p className="mt-8 text-xs uppercase tracking-widest text-[#c8c8c8]" data-testid={`${testId}-count`}>
        {total} {label}
      </p>
    ) : null;
  }

  return (
    <nav
      className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/10 pt-6"
      aria-label="Pagination"
      data-testid={testId}
    >
      <p className="text-xs uppercase tracking-widest text-[#c8c8c8]" data-testid={`${testId}-count`}>
        {from}–{to} sur {total} {label}
      </p>
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        <ActionButton
          variant="secondary"
          size="sm"
          icon={ChevronLeft}
          disabled={page === 1}
          disabledReason="Vous êtes sur la première page"
          onClick={() => setPage(page - 1)}
          data-testid={`${testId}-prev`}
        >
          <span className="hidden sm:inline">Précédent</span>
          <span className="sm:hidden sr-only">Page précédente</span>
        </ActionButton>

        <div className="hidden sm:flex items-center gap-1">
          {pageNumbers(page, pageCount).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-2 text-[#a0a0a0]" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
                data-testid={`${testId}-page-${p}`}
                className={`min-w-[40px] min-h-[40px] px-2 text-xs font-display tracking-widest border transition-colors motion-reduce:transition-none focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D8CA82] ${
                  p === page
                    ? "bg-[#D8CA82] text-[#111111] border-[#D8CA82] font-bold"
                    : "border-white/20 text-[#c8c8c8] hover:border-[#D8CA82] hover:text-[#D8CA82]"
                }`}
              >
                {p}
              </button>
            )
          )}
        </div>
        <span className="sm:hidden text-xs uppercase tracking-widest text-[#f7f7f7]">
          {page} / {pageCount}
        </span>

        <ActionButton
          variant="secondary"
          size="sm"
          disabled={page === pageCount}
          disabledReason="Vous êtes sur la dernière page"
          onClick={() => setPage(page + 1)}
          data-testid={`${testId}-next`}
        >
          <span className="hidden sm:inline">Suivant</span>
          <span className="sm:hidden sr-only">Page suivante</span>
          <ChevronRight aria-hidden="true" />
        </ActionButton>
      </div>
    </nav>
  );
};

/* =====================================================================
 * LoadMore — chargement progressif
 * =================================================================== */
export const LoadMore = ({ hasMore, remaining, shown, total, onLoadMore, testId = "load-more", label = "éléments" }) => (
  <div className="mt-10 flex flex-col items-center gap-3 border-t border-white/10 pt-6" data-testid={testId}>
    <p className="text-xs uppercase tracking-widest text-[#c8c8c8]" aria-live="polite">
      {shown} / {total} {label}
    </p>
    {hasMore && (
      <ActionButton variant="secondary" size="md" icon={Plus} onClick={onLoadMore} data-testid={`${testId}-btn`}>
        Charger plus ({remaining})
      </ActionButton>
    )}
  </div>
);
