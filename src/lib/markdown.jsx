import React from "react";

/* ---------------------------------------------------------------------------
 * Mini moteur de rendu Markdown (sans dépendance).
 *
 * Supporte : titres, paragraphes, gras/italique/barré, code en ligne et
 * blocs de code, listes (ordonnées / non ordonnées), citations, tableaux,
 * règles horizontales, liens et images. Le HTML n'est jamais interprété :
 * tout est rendu sous forme de texte échappé par React (XSS-safe).
 * ------------------------------------------------------------------------- */

const isUrl = (u) => /^(https?:\/\/|mailto:|#|\/)/i.test(u) && !/javascript:/i.test(u);

const linkTarget = (href) => (href && href.startsWith("/") ? undefined : "_blank");

/* ---- inline ---- */
const INLINE_RE =
  /(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_|~~[^~]+~~|`[^`]+`|!\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\)|\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\))/g;

const renderInline = (text, keyPrefix = "i") => {
  const parts = String(text).split(INLINE_RE);
  return parts.map((part, idx) => {
    if (!part) return null;
    const key = `${keyPrefix}-${idx}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key}>{renderInline(part.slice(2, -2), key)}</strong>;
    }
    if (part.startsWith("__") && part.endsWith("__") && part.length > 4) {
      return <strong key={key}>{renderInline(part.slice(2, -2), key)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={key}>{renderInline(part.slice(1, -1), key)}</em>;
    }
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
      return <em key={key}>{renderInline(part.slice(1, -1), key)}</em>;
    }
    if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) {
      return <del key={key}>{renderInline(part.slice(2, -2), key)}</del>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={key} className="bg-white/10 border border-white/10 px-1.5 py-0.5 text-[0.9em] text-[#D8CA82]">
          {part.slice(1, -1)}
        </code>
      );
    }
    const img = part.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
    if (img) {
      const [, alt, src, title] = img;
      if (isUrl(src)) {
        return (
          <img
            key={key}
            src={src}
            alt={alt || ""}
            title={title}
            loading="lazy"
            decoding="async"
            className="max-w-full h-auto my-4 border border-white/10"
          />
        );
      }
    }
    const link = part.match(/^\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
    if (link) {
      const [, label, href, title] = link;
      if (isUrl(href)) {
        return (
          <a key={key} href={href} title={title} target={linkTarget(href)} rel={linkTarget(href) ? "noopener noreferrer" : undefined}
            className="text-[#D8CA82] underline underline-offset-2 hover:opacity-80">
            {renderInline(label || href, key)}
          </a>
        );
      }
    }
    // Texte brut : React échappe automatiquement (aucune injection HTML possible).
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
};

/* ---- blocs ---- */
const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line) && line.includes("|");
const isListBullet = (line) => /^\s*[-*+]\s+/.test(line);
const isListOrdered = (line) => /^\s*\d+[.)]\s+/.test(line);
const isHeading = (line) => /^#{1,6}\s+/.test(line);
const isQuote = (line) => /^\s*>\s?/.test(line);

const parseTable = (rows) => {
  const clean = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const header = clean(rows[0]);
  // Ligne de séparation --- ; on la saute si présente
  const bodyStart = rows.length > 1 && /^[\s|:-]+$/.test(rows[1].replace(/-/g, "").trim()) ? 2 : 1;
  const body = rows.slice(bodyStart).map(clean);
  return { header, body };
};

export const Markdown = ({ source, className = "" }) => {
  const lines = String(source || "").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Bloc de code
    if (line.trim().startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // fermeture ```
      blocks.push({ type: "code", text: codeLines.join("\n") });
      continue;
    }

    // Tableau
    if (isTableRow(line)) {
      const rows = [line];
      i++;
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(lines[i]);
        i++;
      }
      blocks.push({ type: "table", rows });
      continue;
    }

    // Citation
    if (isQuote(line)) {
      const quoteLines = [];
      while (i < lines.length && isQuote(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", lines: quoteLines });
      continue;
    }

    // Liste
    if (isListBullet(line) || isListOrdered(line)) {
      const ordered = isListOrdered(line);
      const items = [];
      while (i < lines.length && (isListBullet(lines[i]) || isListOrdered(lines[i]))) {
        const raw = lines[i];
        const itemText = raw.replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/, "");
        items.push(itemText);
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // Titre
    if (isHeading(line)) {
      const m = line.match(/^(#{1,6})\s+(.*)$/);
      blocks.push({ type: "heading", level: m[1].length, text: m[2] });
      i++;
      continue;
    }

    // Règle horizontale
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Paragraphe (jusqu'à ligne vide)
    if (line.trim() !== "") {
      const para = [line];
      i++;
      while (i < lines.length && lines[i].trim() !== "" &&
             !isHeading(lines[i]) && !isListBullet(lines[i]) && !isListOrdered(lines[i]) &&
             !isQuote(lines[i]) && !isTableRow(lines[i]) && !lines[i].trim().startsWith("```")) {
        para.push(lines[i]);
        i++;
      }
      blocks.push({ type: "paragraph", text: para.join(" ") });
      continue;
    }

    i++;
  }

  return (
    <div className={`markdown-body ${className}`} data-testid="markdown-body">
      {blocks.map((block, idx) => {
        const key = `b-${idx}`;
        switch (block.type) {
          case "heading": {
            const Tag = `h${block.level}`;
            const sizes = {
              1: "text-2xl sm:text-3xl", 2: "text-xl sm:text-2xl", 3: "text-lg sm:text-xl",
              4: "text-base sm:text-lg", 5: "text-base", 6: "text-sm",
            };
            return (
              <Tag key={key} className={`font-display font-bold text-[#f7f7f7] mt-8 mb-3 ${sizes[block.level] || "text-base"}`}>
                {renderInline(block.text, key)}
              </Tag>
            );
          }
          case "paragraph":
            return <p key={key} className="my-4">{renderInline(block.text, key)}</p>;
          case "quote":
            return (
              <blockquote key={key} className="border-l-4 border-[#D8CA82]/60 bg-white/5 px-5 py-3 my-4 text-[#c8c8c8] italic">
                {block.lines.map((l, li) => (
                  <p key={li} className="my-1">{renderInline(l, `${key}-${li}`)}</p>
                ))}
              </blockquote>
            );
          case "list":
            return block.ordered ? (
              <ol key={key} className="list-decimal list-inside my-4 space-y-1.5">
                {block.items.map((item, li) => <li key={li} className="pl-1">{renderInline(item, `${key}-${li}`)}</li>)}
              </ol>
            ) : (
              <ul key={key} className="list-disc list-inside my-4 space-y-1.5">
                {block.items.map((item, li) => <li key={li} className="pl-1">{renderInline(item, `${key}-${li}`)}</li>)}
              </ul>
            );
          case "code":
            return (
              <pre key={key} className="bg-[#0c0c0c] border border-white/10 p-4 my-4 overflow-x-auto text-sm text-[#f7f7f7]/90">
                <code>{block.text}</code>
              </pre>
            );
          case "table": {
            const { header, body } = parseTable(block.rows);
            return (
              <div key={key} className="overflow-x-auto my-5 border border-white/10">
                <table className="w-full text-sm">
                  {header.some(Boolean) && (
                    <thead>
                      <tr className="border-b border-white/15 bg-white/5">
                        {header.map((h, hi) => <th key={hi} className="px-3 py-2 text-left text-[#D8CA82] font-display uppercase tracking-wider text-xs">{renderInline(h, `${key}-th-${hi}`)}</th>)}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {body.map((row, ri) => (
                      <tr key={ri} className="border-b border-white/5 last:border-0">
                        {row.map((cell, ci) => <td key={ci} className="px-3 py-2 text-[#c8c8c8]">{renderInline(cell, `${key}-td-${ri}-${ci}`)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          case "hr":
            return <hr key={key} className="border-white/10 my-8" />;
          default:
            return null;
        }
      })}
    </div>
  );
};

/** Texte brut (sans markdown) pour extraits, meta-descriptions… */
export const markdownToText = (source) =>
  String(source || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]/g, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
