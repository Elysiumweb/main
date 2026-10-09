const fs = require("fs");
const path = require("path");

/* ---------------------------------------------------------------------------
 * Le site est sur le plan gratuit : Cloud Storage y est inaccessible (bucket
 * = Blaze depuis février 2026). Les images téléversées vont donc chez imgbb,
 * avec la clé fournie par la variable d'environnement Vercel
 * `REACT_APP_IMGBB_KEY`.
 *
 * Ces tests verrouillent ce qui casserait l'envoi en silence :
 *  1. un retour du SDK Firebase Storage dans le code ;
 *  2. une clé imgbb écrite en dur dans le dépôt au lieu de l'environnement ;
 *  3. un champ d'image de l'admin redevenu une saisie d'URL.
 * ------------------------------------------------------------------------- */

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const collectSources = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSources(full);
    if (!/\.(js|jsx)$/.test(entry.name) || /\.test\.(js|jsx)$/.test(entry.name)) return [];
    return [{ file: full, content: fs.readFileSync(full, "utf8") }];
  });

const appSources = collectSources(path.join(ROOT, "src"));
const functionSources = collectSources(path.join(ROOT, "functions"));
const trackedFiles = [
  ...appSources,
  ...functionSources,
  ...["firebase.json", "package.json"].map((f) => ({ file: path.join(ROOT, f), content: read(f) })),
];

/** Clé imgbb : 32 caractères hexadécimaux. */
const IMGBB_KEY_RE = /\b[0-9a-f]{32}\b/;

describe("téléversement d'images", () => {
  it("n'utilise plus le SDK Firebase Storage", () => {
    const used = appSources.filter(({ content }) =>
      /from "firebase\/storage"|getStorage\(|uploadBytesResumable|getDownloadURL/.test(content)
    );
    expect(used.map((f) => path.relative(ROOT, f.file))).toEqual([]);
  });

  it("ne déploie pas de règles de stockage (pas de bucket sur le plan gratuit)", () => {
    expect(exists("storage.rules")).toBe(false);
    expect(JSON.parse(read("firebase.json")).storage).toBeUndefined();
  });

  it("n'expose aucune clé imgbb dans le dépôt", () => {
    const leaks = trackedFiles
      .filter(({ content }) => IMGBB_KEY_RE.test(content))
      .map(({ file }) => path.relative(ROOT, file));
    expect(leaks).toEqual([]);
  });

  it("lit la clé dans l'environnement Vercel, jamais en dur", () => {
    const client = read("src/lib/imageUpload.js");
    expect(client).toContain("process.env.REACT_APP_IMGBB_KEY");
    expect(client).toContain("https://api.imgbb.com/1/upload");
    // Aucune clé en dur : le seul accès à la variable passe par apiKey().
    expect(client).not.toMatch(/key=[a-f0-9]{8,}/i);
  });

  it("garde un garde-fou de délai et une limite de taille", () => {
    const client = read("src/lib/imageUpload.js");
    expect(client).toContain("xhr.timeout");
    expect(client).toContain("onprogress");
    expect(client).toContain("5 * 1024 * 1024");
    expect(client).toMatch(/settled/);
  });

  it("n'a laissé aucune fonction d'envoi orpheline", () => {
    expect(exists("functions/upload.js")).toBe(false);
    expect(read("functions/index.js")).not.toContain('require("./upload")');
  });
});

describe("champs d'image de l'admin", () => {
  it.each([
    ["src/pages/Admin.jsx", 'data-testid="admin-match-logo"'],
    ["src/components/admin/AdminOpponents.jsx", 'placeholder="Logo URL'],
    ["src/components/admin/AdminMedia.jsx", 'data-testid="admin-media-thumbnail"'],
  ])("%s n'impose plus de saisir une URL", (file, marker) => {
    expect(read(file)).not.toContain(marker);
  });

  it.each([
    ["src/pages/Admin.jsx", "admin-match-logo-upload"],
    ["src/components/admin/AdminOpponents.jsx", "admin-opponent-logo-upload"],
    ["src/components/admin/AdminMedia.jsx", "admin-media-thumbnail-upload"],
  ])("%s propose un téléversement", (file, testId) => {
    expect(read(file)).toContain("<ImageUpload");
    expect(read(file)).toContain(testId);
  });

  it("conserve les champs qui sont réellement des liens", () => {
    const admin = read("src/pages/Admin.jsx");
    expect(admin).toContain('data-testid="admin-match-watch"');
    expect(admin).toContain('data-testid="admin-match-vod"');
    expect(read("src/components/admin/AdminMedia.jsx")).toContain('data-testid="admin-media-url"');
  });
});