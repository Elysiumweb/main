/* =====================================================================
 * ResponsiveTable — tableau d'administration lisible sur mobile
 * ---------------------------------------------------------------------
 * Desktop (md+) : vraie <table> avec toutes les colonnes.
 * Mobile        : vue "carte" — colonnes prioritaires en tête, les
 *                 autres en paires libellé/valeur. Aucun défilement
 *                 horizontal requis.
 *
 * columns: [{ key, header, cell(row), priority?: "primary"|"secondary"|"meta", className? }]
 * =================================================================== */

export const ResponsiveTable = ({
  columns = [],
  rows = [],
  rowKey = (r) => r.id,
  caption,
  testId = "responsive-table",
  emptyLabel = "Aucune donnée.",
  rowTestId,
}) => {
  if (rows.length === 0) {
    return (
      <p className="text-[#c8c8c8] border border-white/10 bg-[#1A1A1A] px-4 py-8 text-center" data-testid={`${testId}-empty`}>
        {emptyLabel}
      </p>
    );
  }

  const primary = columns.filter((c) => c.priority === "primary");
  const rest = columns.filter((c) => c.priority !== "primary");

  return (
    <div data-testid={testId}>
      {/* ---------- Desktop ---------- */}
      <div className="hidden md:block border border-white/10 bg-[#1A1A1A]">
        <table className="w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-widest text-[#c8c8c8]">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`px-4 py-3 font-semibold ${c.className || ""}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-white/5 hover:bg-white/5 transition-colors motion-reduce:transition-none"
                data-testid={rowTestId ? rowTestId(row) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 align-middle ${c.className || ""}`}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- Mobile : cartes ---------- */}
      <ul className="md:hidden space-y-3" data-testid={`${testId}-cards`}>
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            className="border border-white/10 bg-[#1A1A1A] p-4 space-y-3"
            data-testid={rowTestId ? `${rowTestId(row)}-card` : undefined}
          >
            {primary.map((c) => (
              <div key={c.key} className="font-display text-[#f7f7f7] text-sm">
                {c.cell(row)}
              </div>
            ))}
            <dl className="space-y-2.5">
              {rest.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-3 flex-wrap">
                  <dt className="text-[10px] uppercase tracking-[0.2em] text-[#a0a0a0] shrink-0">
                    {c.header}
                  </dt>
                  <dd className="text-sm text-[#f7f7f7] min-w-0 text-right">{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
};
