/**
 * Tests des règles Firestore sur l'émulateur.
 *
 * Lancement :
 *   npx firebase emulators:exec --only firestore \
 *     "node tests/rules/firestore.rules.test.js"
 *
 * Couvre les constats de l'audit :
 *  - notifications : lecture/marquage réservés au destinataire réel, création
 *    réservée aux actions métier autorisées.
 *  - chats / canvases / activity : pôle/roster imposés par les règles (un
 *    joueur EVA ne lit pas un channel ou un tableau Valorant).
 *  - newsletter : jamais de lecture publique.
 *  - rappels de match : écriture réservée aux Cloud Functions.
 *  - MFA : une opération admin est refusée sans session MFA serveur récente.
 */

const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { readFileSync } = require("fs");

const RULES = readFileSync("firestore.rules", "utf8");
const PROJECT_ID = "demo-elysium-audit";

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

/** Écrit des docs via le SDK admin (contourne les règles). */
const seedAdmin = async (fn) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore());
  });

const OFFICIAL = "9IzGlpp6DHhrN9GW72haeb869Om1";

describe("Notifications — destinataire réel uniquement", () => {
  it("un joueur ne peut pas lire la notification d'un autre joueur", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("alice").set({ role: "player", game: "EVA", roster: null });
      await admin.collection("users").doc("bob").set({ role: "player", game: "Valorant", roster: "Vaillant" });
      await admin.collection("notifications").doc("n1").set({
        targetUid: "bob", type: "chat_mention", extra: "hello", link: "/", readBy: [],
        createdAt: new Date(),
      });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(alice.doc("notifications/n1").get());
  });

  it("un joueur lit sa propre notification et peut la marquer comme lue", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("alice").set({ role: "player", game: "EVA", roster: null });
      await admin.collection("notifications").doc("n1").set({
        targetUid: "alice", type: "chat_mention", extra: "hello", link: "/", readBy: [],
        createdAt: new Date(),
      });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(alice.doc("notifications/n1").get());
    await assertSucceeds(alice.doc("notifications/n1").update({ readBy: ["alice"] }));
  });

  it("un joueur ne peut pas créer une notification « système » (event_new)", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("alice").set({ role: "player", game: "EVA", roster: null });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(alice.collection("notifications").add({
      targetRoles: ["player", "manager", "bureau"], targetGame: "EVA", type: "event_new",
      extra: "Convocation", link: "/espace-joueur/planning", readBy: [], createdAt: new Date(),
    }));
  });

  it("un joueur peut créer une mention chat vers un autre membre (action métier)", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("alice").set({ role: "player", game: "EVA", roster: null });
      await admin.collection("users").doc("bob").set({ role: "player", game: "EVA", roster: null });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(alice.collection("notifications").add({
      targetUid: "bob", type: "chat_mention", extra: "coucou", link: "/espace-joueur/chat", readBy: [],
      createdAt: new Date(),
    }));
  });

  it("un joueur ne peut pas modifier la cible d'une notification", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("alice").set({ role: "player", game: "EVA", roster: null });
      await admin.collection("notifications").doc("n1").set({
        targetUid: "alice", type: "chat_mention", extra: "hello", link: "/", readBy: [],
        createdAt: new Date(),
      });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(alice.doc("notifications/n1").update({ targetUid: "bob", readBy: [] }));
  });
});

describe("Chats — pôle/roster imposés par les règles", () => {
  it("un joueur EVA ne peut pas lire le chat d'un roster Valorant", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("eva").set({ role: "player", game: "EVA", roster: null });
      await admin.collection("chats").doc("roster_Vaillant").collection("messages").doc("m1").set({
        uid: "bob", text: "secret valorant", createdAt: new Date(),
      });
    });
    const eva = testEnv.authenticatedContext("eva").firestore();
    await assertFails(eva.doc("chats/roster_Vaillant/messages/m1").get());
  });

  it("un joueur EVA lit son channel de jeu et le canal global", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("eva").set({ role: "player", game: "EVA", roster: null });
      await admin.collection("chats").doc("game_EVA").collection("messages").doc("m1").set({
        uid: "eva", text: "bonjour", createdAt: new Date(),
      });
      await admin.collection("chats").doc("global").collection("messages").doc("m2").set({
        uid: "staff", text: "annonce", createdAt: new Date(),
      });
    });
    const eva = testEnv.authenticatedContext("eva").firestore();
    await assertSucceeds(eva.doc("chats/game_EVA/messages/m1").get());
    await assertSucceeds(eva.doc("chats/global/messages/m2").get());
  });

  it("un joueur EVA ne peut pas écrire dans le chat d'un autre pôle", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("eva").set({ role: "player", game: "EVA", roster: null });
    });
    const eva = testEnv.authenticatedContext("eva").firestore();
    await assertFails(eva.collection("chats/game_Valorant/messages").add({
      uid: "eva", text: "intrusion", createdAt: new Date(),
    }));
  });

  it("un joueur Valorant (roster Vaillant) lit son channel de roster", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("valo").set({ role: "player", game: "Valorant", roster: "Vaillant" });
      await admin.collection("chats").doc("roster_Vaillant").collection("messages").doc("m1").set({
        uid: "coach", text: "strat", createdAt: new Date(),
      });
    });
    const valo = testEnv.authenticatedContext("valo").firestore();
    await assertSucceeds(valo.doc("chats/roster_Vaillant/messages/m1").get());
  });
});

describe("Canvas — tableaux par pôle", () => {
  it("un joueur EVA ne lit pas un tableau Valorant", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("eva").set({ role: "player", game: "EVA", roster: null });
      await admin.collection("canvases").doc("c1").set({
        game: "Valorant", title: "Strat Vaillant", status: "draft", items: [],
        createdBy: "valo", createdAt: new Date(),
      });
    });
    const eva = testEnv.authenticatedContext("eva").firestore();
    await assertFails(eva.doc("canvases/c1").get());
  });

  it("un joueur EVA lit un tableau EVA et ne peut pas en créer un Valorant", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("eva").set({ role: "player", game: "EVA", roster: null });
      await admin.collection("canvases").doc("c1").set({
        game: "EVA", title: "Bootcamp", status: "draft", items: [], createdBy: "eva",
      });
    });
    const eva = testEnv.authenticatedContext("eva").firestore();
    await assertSucceeds(eva.doc("canvases/c1").get());
    await assertFails(eva.collection("canvases").add({
      game: "Valorant", title: "Intrusion", status: "draft", items: [], createdBy: "eva",
    }));
  });
});

describe("Activity — journal par pôle", () => {
  it("un joueur EVA ne lit pas une entrée d'activité Valorant", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("eva").set({ role: "player", game: "EVA", roster: null });
      await admin.collection("activity").doc("a1").set({
        game: "Valorant", type: "event_created", label: "Scrim", byUid: "valo", createdAt: new Date(),
      });
    });
    const eva = testEnv.authenticatedContext("eva").firestore();
    await assertFails(eva.doc("activity/a1").get());
  });

  it("un joueur EVA lit son pôle et le canal global", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("eva").set({ role: "player", game: "EVA", roster: null });
      await admin.collection("activity").doc("a1").set({
        game: "EVA", type: "canvas_created", label: "Tableau", byUid: "eva", createdAt: new Date(),
      });
      await admin.collection("activity").doc("a2").set({
        game: "global", type: "event_created", label: "Annonce", byUid: "staff", createdAt: new Date(),
      });
    });
    const eva = testEnv.authenticatedContext("eva").firestore();
    await assertSucceeds(eva.doc("activity/a1").get());
    await assertSucceeds(eva.doc("activity/a2").get());
  });
});

describe("Newsletter — jamais de lecture publique", () => {
  it("un utilisateur authentifié ne peut pas lire la collection newsletter", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("alice").set({ role: "player", game: "EVA", roster: null });
      await admin.collection("newsletter").doc("s1").set({
        email: "bob@test.fr", confirmed: true, confirmToken: "tok", lang: "fr",
      });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(alice.doc("newsletter/s1").get());
  });

  it("l'inscription publique (double opt-in) reste possible", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(anon.collection("newsletter").add({
      email: "new@test.fr",
      confirmed: false,
      confirmToken: "secret-token-123",
      lang: "fr",
      subscribedAt: new Date(),
      consentGivenAt: new Date(),
    }));
  });
});

describe("Rappels de match — écriture réservée au serveur", () => {
  it("un utilisateur ne peut pas écrire dans matchReminders", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("alice").set({ role: "player", game: "EVA", roster: null });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(alice.collection("matchReminders").add({
      uid: "alice", matchId: "m1", fireAt: new Date(Date.now() + 3600000), status: "pending",
    }));
  });

  it("un utilisateur peut lire ses propres rappels", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("alice").set({ role: "player", game: "EVA", roster: null });
      await admin.collection("matchReminders").doc("r1").set({
        uid: "alice", matchId: "m1", status: "pending",
      });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(alice.doc("matchReminders/r1").get());
  });
});

describe("MFA — session serveur récente exigée pour les opérations sensibles", () => {
  const seedOfficial = () =>
    seedAdmin(async (admin) => {
      await admin.collection("users").doc(OFFICIAL).set({ role: "bureau", game: null, roster: null });
      await admin.collection("users").doc("bob").set({ role: "player", game: "EVA", roster: null });
    });

  it("le compte officiel ne peut pas changer un rôle sans session MFA récente", async () => {
    await seedOfficial();
    const official = testEnv.authenticatedContext(OFFICIAL).firestore();
    await assertFails(official.doc("users/bob").update({ role: "manager" }));
  });

  it("le compte officiel peut changer un rôle avec une session MFA récente", async () => {
    await seedOfficial();
    await seedAdmin(async (admin) => {
      await admin.collection("mfaSessions").doc(OFFICIAL).set({
        uid: OFFICIAL,
        verifiedAt: new Date(Date.now() - 60 * 1000), // < 6 h
      });
    });
    const official = testEnv.authenticatedContext(OFFICIAL).firestore();
    await assertSucceeds(official.doc("users/bob").update({ role: "manager", game: "EVA", roster: null }));
  });

  it("une session MFA expirée (> 6 h) est refusée", async () => {
    await seedOfficial();
    await seedAdmin(async (admin) => {
      await admin.collection("mfaSessions").doc(OFFICIAL).set({
        uid: OFFICIAL,
        verifiedAt: new Date(Date.now() - 7 * 3600 * 1000),
      });
    });
    const official = testEnv.authenticatedContext(OFFICIAL).firestore();
    await assertFails(official.doc("users/bob").update({ role: "manager", game: "EVA", roster: null }));
  });

  it("un joueur ne peut pas lire le journal d'audit (bureau + MFA requis)", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("alice").set({ role: "player", game: "EVA", roster: null });
      await admin.collection("admin_audit").doc("a1").set({ action: "test", createdAt: new Date() });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(alice.doc("admin_audit/a1").get());
  });
});

describe("Users — pas d'auto-promotion", () => {
  it("un joueur ne peut pas passer son rôle en manager", async () => {
    await seedAdmin(async (admin) => {
      await admin.collection("users").doc("alice").set({ role: "player", game: "EVA", roster: null });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(alice.doc("users/alice").update({ role: "manager" }));
  });
});
