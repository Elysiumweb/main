const fs = require("fs");
const path = require("path");

/* ---------------------------------------------------------------------------
 * Les visuels du site sont versionnés dans public/ : aucune image ne doit
 * plus être tirée d'un hébergeur tiers (ibb.co, pexels…) depuis le code.
 * Les URL absolues qui restent — og:image, schema.org, liens de partage —
 * sont construites sur le domaine du site et ne sont pas des hotlinks.
 * ------------------------------------------------------------------------- */

const SRC_DIR = path.join(__dirname, "..");
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|svg)(\?|$|")/i;

/** Parcourt les .js/.jsx de src/ sans dépendance externe. */
const collectSources = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSources(full);
    // Les fichiers de test contiennent des URL d'exemple : on les ignore.
    if (!/\.(js|jsx)$/.test(entry.name) || /\.test\.(js|jsx)$/.test(entry.name)) return [];
    return [{ file: path.relative(SRC_DIR, full), content: fs.readFileSync(full, "utf8") }];
  });

const sources = collectSources(SRC_DIR);

const externalHotlinks = sources.flatMap(({ file, content }) =>
  [...content.matchAll(/https?:\/\/[^"'`)\s]+\.(jpe?g|png|webp|gif|avif|svg)/gi)]
    .map((m) => ({ file, url: m[0] }))
    // Les domaines d'images externes sont interdits ; le nôtre est canonique.
    .filter(({ url }) => !/^https:\/\/(www\.)?elysium-esport\.fr\//i.test(url))
);

describe("sources d'images", () => {
  it("parcourt bien les sources du site", () => {
    expect(sources.length).toBeGreaterThan(30);
  });

  it("ne contient aucune image hébergée ailleurs", () => {
    expect(externalHotlinks).toEqual([]);
  });

  it("pointe les visuels boutique vers des fichiers du dépôt", () => {
    const shop = fs.readFileSync(path.join(SRC_DIR, "pages", "Shop.jsx"), "utf8");
    expect(shop).toContain('"/shop/maillot-2026.jpg"');
    expect(shop).toContain('"/shop/manchettes-2026.jpg"');
  });
});