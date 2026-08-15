/**
 * Tests des règles Firebase Storage sur l'émulateur.
 *
 * Lancement :
 *   npx firebase emulators:exec --only firestore,storage \
 *     "node tests/rules/storage.rules.test.js && node tests/rules/firestore.rules.test.js"
 *
 * Couvre le constat « aucun storage.rules » : dossiers (avatars, players,
 * media, articles, chat), propriétaires, rôles, MIME autorisés (pas de SVG ni
 * d'exécutables) et tailles maximales.
 */

const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { readFileSync } = require("fs");

const FIRESTORE_RULES = readFileSync("firestore.rules", "utf8");
const STORAGE_RULES = readFileSync("storage.rules", "utf8");
const PROJECT_ID = "demo-elysium-storage";

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: FIRESTORE_RULES },
    storage: { rules: STORAGE_RULES },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearStorage();
  await testEnv.clearFirestore();
});

const seedAdmin = async (fn) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore());
  });

const pngBytes = (size = 1024) => Buffer.alloc(size, 1);
const svgBytes = () => Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
const exeBytes = () => Buffer.from("MZ\x90\x00binary");

describe("Avatars — propriétaire uniquement, images seulement", () => {
  it("le propriétaire téléverse un PNG dans son dossier avatars", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("alice").set({ role: "player", game: "EVA", roster: null });
    });
    const alice = testEnv.authenticatedContext("alice").storage();
    await assertSucceeds(alice.ref("avatars/alice/photo.png").put(pngBytes(), { contentType: "image/png" }));
  });

  it("un autre utilisateur ne peut pas téléverser dans le dossier avatars d'autrui", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("alice").set({ role: "player", game: "EVA", roster: null });
      await admin.collection("users").doc("bob").set({ role: "player", game: "EVA", roster: null });
    });
    const bob = testEnv.authenticatedContext("bob").storage();
    await assertFails(bob.ref("avatars/alice/photo.png").put(pngBytes(), { contentType: "image/png" }));
  });

  it("le SVG est refusé (script actif) même par le propriétaire", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("alice").set({ role: "player", game: "EVA", roster: null });
    });
    const alice = testEnv.authenticatedContext("alice").storage();
    await assertFails(alice.ref("avatars/alice/evil.svg").put(svgBytes(), { contentType: "image/svg+xml" }));
  });

  it("un fichier exécutable est refusé", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("alice").set({ role: "player", game: "EVA", roster: null });
    });
    const alice = testEnv.authenticatedContext("alice").storage();
    await assertFails(alice.ref("avatars/alice/run.exe").put(exeBytes(), { contentType: "application/x-msdownload" }));
  });

  it("un avatar de plus de 2 Mo est refusé", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("alice").set({ role: "player", game: "EVA", roster: null });
    });
    const alice = testEnv.authenticatedContext("alice").storage();
    await assertFails(alice.ref("avatars/alice/big.png").put(pngBytes(3 * 1024 * 1024), { contentType: "image/png" }));
  });

  it("un visiteur anonyme ne peut pas écrire, mais peut lire", async () => {
    const anon = testEnv.unauthenticatedContext().storage();
    await assertFails(anon.ref("avatars/alice/photo.png").put(pngBytes(), { contentType: "image/png" }));
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("alice").set({ role: "player", game: "EVA", roster: null });
    });
    const alice = testEnv.authenticatedContext("alice").storage();
    await assertSucceeds(alice.ref("avatars/alice/photo.png").put(pngBytes(), { contentType: "image/png" }));
    await assertSucceeds(anon.ref("avatars/alice/photo.png").getMetadata());
  });
});

describe("Dossiers bureau (players, media, articles)", () => {
  it("un joueur ne peut pas écrire dans players/", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("alice").set({ role: "player", game: "EVA", roster: null });
    });
    const alice = testEnv.authenticatedContext("alice").storage();
    await assertFails(alice.ref("players/photo1.png").put(pngBytes(), { contentType: "image/png" }));
  });

  it("le bureau peut écrire dans players/, media/ et articles/", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("boss").set({ role: "bureau", game: null, roster: null });
    });
    const boss = testEnv.authenticatedContext("boss").storage();
    await assertSucceeds(boss.ref("players/photo1.png").put(pngBytes(), { contentType: "image/png" }));
    await assertSucceeds(boss.ref("media/gallery.jpg").put(pngBytes(), { contentType: "image/jpeg" }));
    await assertSucceeds(boss.ref("articles/cover.webp").put(pngBytes(), { contentType: "image/webp" }));
  });

  it("le GIF est accepté (image raster) mais pas l'HTML", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("boss").set({ role: "bureau", game: null, roster: null });
    });
    const boss = testEnv.authenticatedContext("boss").storage();
    await assertSucceeds(boss.ref("media/anim.gif").put(pngBytes(), { contentType: "image/gif" }));
    await assertFails(boss.ref("media/page.html").put(Buffer.from("<html></html>"), { contentType: "text/html" }));
  });
});

describe("Chat — réservé aux membres de l'espace joueur", () => {
  it("un joueur écrit une image de chat ; un visiteur non", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("alice").set({ role: "player", game: "EVA", roster: null });
      await admin.collection("users").doc("visitor").set({ role: "visitor", game: null, roster: null });
    });
    const alice = testEnv.authenticatedContext("alice").storage();
    const visitor = testEnv.authenticatedContext("visitor").storage();
    await assertSucceeds(alice.ref("chat/2026_img.jpg").put(pngBytes(), { contentType: "image/jpeg" }));
    await assertFails(visitor.ref("chat/2026_img.jpg").put(pngBytes(), { contentType: "image/jpeg" }));
  });
});
