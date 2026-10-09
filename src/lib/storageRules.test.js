const fs = require("fs");
const path = require("path");

/* ---------------------------------------------------------------------------
 * Deux pièges ont rendu les envois d'images inutilisables :
 *  1. aucun `storage.rules` dans le dépôt → le bucket refuse toute écriture ;
 *  2. certains champs d'image se saisissaient encore en URL dans l'admin.
 * Ces tests lient le code aux règles : un nouveau dossier d'envoi sans règle
 * correspondant fait échouer la suite.
 * ------------------------------------------------------------------------- */

const ROOT = path.join(__dirname, "..", "..");
const RULES = fs.readFileSync(path.join(ROOT, "storage.rules"), "utf8");
const FIREBASE_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, "firebase.json"), "utf8"));

const collectSources = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSources(full);
    if (!/\.(js|jsx)$/.test(entry.name) || /\.test\.(js|jsx)$/.test(entry.name)) return [];
    return [{ file: full, content: fs.readFileSync(full, "utf8") }];
  });

const sources = collectSources(path.join(ROOT, "src"));

/** Dossiers réellement utilisés par l'envoi d'images. */
const uploadFolders = sources.flatMap(({ file, content }) => [
  ...[...content.matchAll(/folder="([a-z]+)(?:\/\$\{[^}]+\})?"/g)].map((m) => ({ file, folder: m[1] })),
  ...[...content.matchAll(/folder=\{`([a-z]+)\//g)].map((m) => ({ file, folder: m[1] })),
  ...[...content.matchAll(/buildUploadPath\("([a-z]+)"/g)].map((m) => ({ file, folder: m[1] })),
]);

/** Fichiers de l'admin où une image se saisissait en URL. */
const ADMIN_IMAGE_URL_FIELDS = [
  { file: "src/pages/Admin.jsx", marker: 'data-testid="admin-match-logo"' },
  { file: "src/components/admin/AdminOpponents.jsx", marker: 'placeholder="Logo URL' },
  { file: "src/components/admin/AdminMedia.jsx", marker: 'data-testid="admin-media-thumbnail"' },
];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("règles Firebase Storage", () => {
  it("le projet déploie bien les règles de stockage", () => {
    expect(FIREBASE_JSON.storage).toEqual({ rules: "storage.rules" });
    expect(RULES).toContain("service firebase.storage");
  });

  it("ouvre la lecture des images et ferme l'écriture par défaut", () => {
    expect(RULES).toMatch(/match \/\{allPaths=\*\*\}\s*\{\s*allow read: if true;/);
    // Aucun dossier ne doit être laissé accessible en écriture à tout le monde.
    expect(RULES).not.toMatch(/allow write: if true/);
  });

  it("couvre chaque dossier utilisé par un envoi d'image", () => {
    expect(uploadFolders.length).toBeGreaterThan(4);
    const missing = uploadFolders
      .map(({ folder }) => folder)
      .filter((folder) => !new RegExp(`match /${folder}/`).test(RULES));
    expect([...new Set(missing)]).toEqual([]);
  });

  it("borne la nature et la taille des fichiers envoyés", () => {
    expect(RULES).toMatch(/contentType\.matches\('image\/\.\*'\)/);
    expect(RULES).toMatch(/size < 5 \* 1024 \* 1024/);
  });

  it("aligne les rôles sur firestore.rules", () => {
    const firestoreRules = read("firestore.rules");
    const OFFICIAL_UID = "9IzGlpp6DHhrN9GW72haeb869Om1";
    expect(RULES).toContain(OFFICIAL_UID);
    expect(firestoreRules).toContain(OFFICIAL_UID);
    for (const role of ["'manager'", "'bureau'"]) {
      expect(RULES).toContain(role);
      expect(firestoreRules).toContain(role);
    }
  });
});

describe("champs d'image de l'admin", () => {
  it.each(ADMIN_IMAGE_URL_FIELDS)("$file n'impose plus de saisir une URL", ({ file, marker }) => {
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
    // Vidéo, diffusion, VOD, site officiel : ce ne sont pas des images.
    const admin = read("src/pages/Admin.jsx");
    expect(admin).toContain('data-testid="admin-match-watch"');
    expect(admin).toContain('data-testid="admin-match-vod"');
    expect(read("src/components/admin/AdminMedia.jsx")).toContain('data-testid="admin-media-url"');
  });
});