import { Search, RotateCcw } from "lucide-react";

/**
 * Barre de filtres commune (D-08) : recherche plein texte + selects + tags.
 * ----------------------------------------------------------------------------
 * Réutilisable sur /actus, /medias, /resultats… Chaque partie est optionnelle :
 *
 *   <FiltersBar
 *     search={{ value, onChange, placeholder }}          // champ de recherche
 *     selects={[{ value, onChange, options, label }]}    // menus déroulants
 *     tags={{ items, active, onChange }}                 // puces de tags
 *     resultLabel="12 article(s)"                        // compteur à droite
 *     hasActiveFilters={bool} onReset={fn}               // bouton réinitialiser
 *   />
 *
 * Les options sont des { value, label } — la valeur "all" signifie « sans filtre ».
 */

const selectCls =
  "bg-[#1A1A1A] border border-white/20 px-3 py-2 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]";

export const FiltersBar = ({
  search,
  selects = [],
  tags,
  resultLabel,
  hasActiveFilters = false,
  onReset,
  resetLabel = "Réinitialiser",
  testId = "filters-bar",
}) => (
  <div
    className="border border-white/10 bg-[#0c0c0c] p-4 mb-10 flex flex-col gap-4"
    data-testid={testId}
  >
    <div className="flex flex-wrap items-center gap-3">
      {search && (
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={15}
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#f7f7f7]/40 pointer-events-none"
          />
          <label htmlFor={`${testId}-search`} className="sr-only">
            {search.placeholder || "Rechercher"}
          </label>
          <input
            id={`${testId}-search`}
            type="search"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            data-testid={`${testId}-search`}
            className="w-full bg-[#1A1A1A] border border-white/20 pl-9 pr-3 py-2 text-sm text-[#f7f7f7] placeholder:text-[#a0a0a0] focus:outline-none focus:border-[#D8CA82]"
          />
        </div>
      )}
      {selects.map((select) => (
        <select
          key={select.testId}
          value={select.value}
          onChange={(e) => select.onChange(e.target.value)}
          aria-label={select.label}
          data-testid={select.testId}
          className={`${selectCls} ${select.className || ""}`}
        >
          {select.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {resultLabel && (
        <span
          className="ml-auto text-xs uppercase tracking-[0.2em] text-[#c8c8c8] whitespace-nowrap"
          data-testid={`${testId}-count`}
        >
          {resultLabel}
        </span>
      )}
    </div>

    {tags && tags.items.length > 0 && (
      <div
        className="flex flex-wrap gap-2 items-center"
        data-testid={`${testId}-tags`}
        role="group"
        aria-label={tags.label}
      >
        {tags.items.map((tag) => {
          const active = tags.active === tag;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => tags.onChange(active ? "all" : tag)}
              aria-pressed={active}
              data-testid={`${testId}-tag-${String(tag).replace(/\s+/g, "-").toLowerCase()}`}
              className={`text-xs uppercase tracking-[0.15em] border px-2.5 py-1 transition-colors ${
                active
                  ? "border-[#D8CA82] text-[#D8CA82] bg-[#D8CA82]/10"
                  : "border-white/15 text-[#f7f7f7]/50 hover:text-[#f7f7f7]"
              }`}
            >
              #{tag}
            </button>
          );
        })}
      </div>
    )}

    {hasActiveFilters && onReset && (
      <div>
        <button
          type="button"
          onClick={onReset}
          data-testid={`${testId}-reset`}
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-[#f7f7f7]/50 hover:text-[#D8CA82] transition-colors"
        >
          <RotateCcw size={12} aria-hidden="true" /> {tags?.resetLabel || onReset.label || "Réinitialiser"}
        </button>
      </div>
    )}
  </div>
);
