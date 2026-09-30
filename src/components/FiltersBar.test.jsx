import { renderToStaticMarkup } from "react-dom/server";
import { FiltersBar } from "./FiltersBar";

describe("FiltersBar (barre de filtres commune D-08)", () => {
  const base = {
    search: { value: "", onChange: () => {}, placeholder: "Rechercher…" },
    selects: [
      {
        testId: "test-game",
        label: "Jeu",
        value: "all",
        onChange: () => {},
        options: [
          { value: "all", label: "Tous" },
          { value: "EVA", label: "EVA" },
        ],
      },
    ],
    tags: { items: ["lan", "finale"], active: "lan", onChange: () => {}, label: "Tags" },
    resultLabel: "3 article(s)",
    hasActiveFilters: true,
    onReset: () => {},
    resetLabel: "Réinitialiser",
    testId: "filters",
  };

  test("rend recherche, select, tags, compteur et reset", () => {
    const html = renderToStaticMarkup(<FiltersBar {...base} />);
    expect(html).toContain('data-testid="filters-search"');
    expect(html).toContain('data-testid="filters"');
    expect(html).toContain('data-testid="test-game"');
    expect(html).toContain("#lan");
    expect(html).toContain("#finale");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("3 article(s)");
    expect(html).toContain('data-testid="filters-reset"');
    // Le tag actif est stylé différemment (état sélectionné).
    expect(html).toMatch(/bg-\[#D8CA82\]\/10/);
  });

  test("sans tags ni filtres actifs : ni puces ni bouton reset", () => {
    const html = renderToStaticMarkup(
      <FiltersBar search={base.search} selects={base.selects} hasActiveFilters={false} />
    );
    expect(html).not.toContain("data-testid=\"filters-tags\"");
    expect(html).not.toContain("data-testid=\"filters-reset\"");
  });

  test("les options du select sont rendues", () => {
    const html = renderToStaticMarkup(<FiltersBar selects={base.selects} />);
    expect(html).toContain("<option value=\"all\"");
    expect(html).toContain(">Tous</option>");
    expect(html).toContain("<option value=\"EVA\">EVA</option>");
  });
});
