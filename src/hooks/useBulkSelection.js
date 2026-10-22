import { useCallback, useMemo, useState } from "react";

/**
 * Sélection multiple générique (actions en masse).
 * ----------------------------------------------------------------------------
 * `items` peut être une liste d'objets (avec `id`) ou d'identifiants.
 */
export const useBulkSelection = (items = []) => {
  const [selected, setSelected] = useState(() => new Set());

  const ids = useMemo(
    () => (Array.isArray(items) ? items.map((item) => (typeof item === "string" ? item : item?.id)).filter(Boolean) : []),
    [items],
  );

  const selectedIds = useMemo(() => ids.filter((id) => selected.has(id)), [ids, selected]);
  const allSelected = ids.length > 0 && selectedIds.length === ids.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggle = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (ids.length && ids.every((id) => prev.has(id))) return new Set();
      return new Set(ids);
    });
  }, [ids]);

  const clear = useCallback(() => setSelected(new Set()), []);

  const isSelected = useCallback((id) => selected.has(id), [selected]);

  return {
    selected: selectedIds,
    selectedSet: selected,
    count: selectedIds.length,
    allSelected,
    someSelected,
    toggle,
    toggleAll,
    clear,
    isSelected,
  };
};
