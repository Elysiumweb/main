const fs = require("fs");
const path = require("path");

/* ---------------------------------------------------------------------------
 * Le site est sur le plan gratuit : Cloud Storage y est inaccessible (bucket
 * = Blaze depuis février 2026). Les images téléversées sont donc compressées
 * côté navigateur puis stockées en base64 dans la collection Firestore
 * `images`, ce qui ne demande ni clé, ni service tiers, ni fonction à déployer.
 *
 * Ces tests verrouillent ce qui casserait l'envoi en silence :
 *  1. un retour du SDK Firebase Storage ou d'un hébergeur tiers dans le code ;
 *  2. un document qui dépasserait le plafond de 1 Mio de Firestore ;
 *  3. un champ d'image de l'admin redevenu une saisie d'URL ;
 *  4. un <ImageUpload> branché sur un gestionnaire d'événement (plantage).
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
const functionSources = exists(path.join(ROOT, "functions")) ? collectSources(path.join(ROOT, "functions")) : [];
const trackedFiles = [
  ...appSources,
  ...functionSources,
  ...["firestore.rules", "firebase.json", "package.json"].map((f) => ({ file: path.join(ROOT, f), content: read(f) })),
];

/** Clé de service imgbb : 32 caractères hexadécimaux. */
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

  it("n'expose aucune clé de service dans le dépôt", () => {
    const leaks = trackedFiles
      .filter(({ content }) => IMGBB_KEY_RE.test(content))
      .map(({ file }) => path.relative(ROOT, file));
    expect(leaks).toEqual([]);
  });

  it("stocke les images dans Firestore, sans service tiers", () => {
    const client = read("src/lib/imageUpload.js");
    expect(client).toContain('collection(db, "images")');
    expect(client).toContain("addDoc");
    // Ni imgbb, ni Cloud Storage, ni fonction Vercel : rien à configurer.
    expect(client).not.toContain("imgbb");
    expect(client).not.toContain("/api/upload");
    expect(exists("api/upload.js")).toBe(false);
  });

  it("reste sous le plafond de 1 Mio par document Firestore", () => {
    const client = read("src/lib/imageUpload.js");
    expect(client).toContain("MAX_IMAGE_BYTES = 600 * 1024");
    expect(client).toContain("prepareImage");
    const rules = read("firestore.rules");
    expect(rules).toContain("match /images/{id}");
    expect(rules).toContain("request.resource.data.bytes <= 600000");
    expect(rules).toContain("request.resource.data.data.size() <= 820000");
  });

  it("garde un garde-fou de délai côté client", () => {
    const client = read("src/lib/imageUpload.js");
    expect(client).toContain("UPLOAD_TIMEOUT_MS");
    expect(client).toMatch(/settled/);
  });

  it("n'a laissé de fonction d'envoi ni côté Firebase ni côté Vercel", () => {
    expect(exists("functions/upload.js")).toBe(false);
    expect(exists("api")).toBe(false);
    expect(exists("functions/index.js")).not.toContain('require("./upload")');
    // Plus aucune dépendance d'hébergement d'images dans le manifeste.
    const deps = Object.keys(JSON.parse(read("package.json")).dependencies || {});
    expect(deps.filter((d) => /imgbb|vercel|firebase-storage/.test(d))).toEqual([]);
  });

  it("documente la manipulation dans le guide de déploiement", () => {
    const doc = read("docs/deploiement-firebase.md");
    expect(doc).toContain("images");
    expect(doc).toContain("base64");
    expect(doc).not.toContain("IMGBB_KEY");
    expect(doc).not.toContain("/api/upload");
  });

  it("ne branche aucun ImageUpload sur un gestionnaire d'événement", () => {
    // ImageUpload appelle onChange(url) ; les helpers `set("champ")` de
    // l'admin attendent un event et plantent sur e.target.value.
    const offenders = appSources
      .flatMap(({ file, content }) => [...content.matchAll(/<ImageUpload[\s\S]{0,400}?\/>/g)].map((m) => ({ file, snippet: m[0] })))
      .filter(({ snippet }) => /onChange=\{set\(/.test(snippet))
      .map(({ file }) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
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