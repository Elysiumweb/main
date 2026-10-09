const fs = require("fs");
const path = require("path");

/* ---------------------------------------------------------------------------
 * Le site est sur le plan gratuit : Cloud Storage y est inaccessible (bucket
 * = Blaze depuis février 2026). Les images téléversées passent donc par la
 * callable `uploadImage`, qui relaie imgbb avec une clé gardée en secret.
 *
 * Ces tests verrouillent trois choses qui casseraient l'envoi en silence :
 *  1. un retour du SDK Firebase Storage dans le code ;
 *  2. une clé imgbb versionnée dans le dépôt ;
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
const functionFiles = collectSources(path.join(ROOT, "functions"));
const trackedFiles = [
  ...appSources,
  ...functionFiles,
  ...["firebase.json", "package.json"].map((f) => ({ file: path.join(ROOT, f), content: read(f) })),
];

/** Clés imgbb : 32 caractères hexadécimaux, souvent à côté du mot « key ». */
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

  it("passe par la callable uploadImage, clé en secret", () => {
    const upload = read("functions/upload.js");
    expect(read("functions/index.js")).toContain('require("./upload")');
    expect(upload).toContain('secrets: ["IMGBB_KEY"]');
    expect(upload).toContain("IMGBB_ENDPOINT");
    // La clé ne doit être lue que depuis le secret injecté.
    const envReads = [...upload.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]);
    expect([...new Set(envReads)]).toEqual(["IMGBB_KEY"]);
  });

  it("ne versionne aucune clé imgbb", () => {
    const leaks = trackedFiles
      .filter(({ content }) => IMGBB_KEY_RE.test(content))
      .map(({ file }) => path.relative(ROOT, file));
    expect(leaks).toEqual([]);
  });

  it("contrôle qui peut envoyer une image, comme les règles Firestore", () => {
    const upload = read("functions/upload.js");
    expect(upload).toContain("permission-denied");
    expect(upload).toContain('require("crypto")'); // quota par compte
    expect(upload).toContain("rateLimits");
    expect(upload).toContain("5 * 1024 * 1024");
    expect(upload).toContain("data:(image\\/"); // data URL validée avant envoi
  });

  it("garde un garde-fou de délai côté client", () => {
    const client = read("src/lib/imageUpload.js");
    expect(client).toContain("UPLOAD_TIMEOUT_MS");
    expect(client).toContain('callProtected("uploadImage"');
    expect(client).not.toContain("firebase/storage");
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