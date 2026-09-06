const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
} = require("firebase/firestore");
const {
  ref: storageRef,
  uploadBytes,
} = require("firebase/storage");

const PROJECT_ID = "elysium-rules-test";
const OFFICIAL_UID = "9IzGlpp6DHhrN9GW72haeb869Om1";

const splitHostPort = (value, fallbackHost, fallbackPort) => {
  const [host = fallbackHost, port = String(fallbackPort)] = String(value || "").split(":");
  return { host, port: Number(port) };
};

const imageBytes = () => new Uint8Array([255, 216, 255, 217]);
const uploadJpeg = (storage, path) => uploadBytes(storageRef(storage, path), imageBytes(), { contentType: "image/jpeg" });

async function main() {
  const firestoreEmulator = splitHostPort(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1", 8080);
  const storageEmulator = splitHostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1", 9199);
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
      host: firestoreEmulator.host,
      port: firestoreEmulator.port,
    },
    storage: {
      rules: fs.readFileSync("storage.rules", "utf8"),
      host: storageEmulator.host,
      port: storageEmulator.port,
    },
  });

  try {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "users/player1"), { role: "player", game: "EVA", roster: "Espoir" });
      await setDoc(doc(db, "users/manager1"), { role: "manager", game: "EVA", roster: "Espoir" });
      await setDoc(doc(db, "users/bureau1"), { role: "bureau" });
      await setDoc(doc(db, "roster/public-player"), { pseudo: "Public", status: "player", game: "EVA" });
      await setDoc(doc(db, "newsletter/subscriber"), { email: "test@example.org", confirmed: true });
      await setDoc(doc(db, "media/existing"), { title: "Photo", type: "photo" });
    });

    const anon = testEnv.unauthenticatedContext().firestore();
    const player = testEnv.authenticatedContext("player1").firestore();
    const manager = testEnv.authenticatedContext("manager1").firestore();
    const bureau = testEnv.authenticatedContext("bureau1").firestore();
    const official = testEnv.authenticatedContext(OFFICIAL_UID).firestore();

    await assertSucceeds(getDoc(doc(anon, "roster/public-player")));
    await assertFails(getDoc(doc(anon, "newsletter/subscriber")));

    await assertSucceeds(addDoc(collection(player, "chats/global/messages"), {
      uid: "player1",
      text: "Bonjour team",
      createdAt: new Date(),
    }));
    await assertFails(addDoc(collection(player, "media"), { title: "forbidden", type: "photo" }));

    await assertSucceeds(addDoc(collection(manager, "positions"), { title: "Coach EVA", game: "EVA" }));
    await assertFails(addDoc(collection(manager, "matches"), { opponentName: "Forbidden", status: "upcoming" }));

    await assertSucceeds(getDoc(doc(bureau, "newsletter/subscriber")));
    await assertSucceeds(addDoc(collection(bureau, "media"), { title: "Bureau upload", type: "photo" }));
    await assertSucceeds(addDoc(collection(official, "matches"), { opponentName: "Official", status: "upcoming" }));
    await assertSucceeds(deleteDoc(doc(official, "media/existing")));

    const anonStorage = testEnv.unauthenticatedContext().storage();
    const playerStorage = testEnv.authenticatedContext("player1").storage();
    const bureauStorage = testEnv.authenticatedContext("bureau1").storage();

    await assertSucceeds(uploadJpeg(playerStorage, "avatars/player1/avatar.jpg"));
    await assertFails(uploadJpeg(playerStorage, "avatars/manager1/avatar.jpg"));
    await assertSucceeds(uploadJpeg(playerStorage, "chat/player1/message.jpg"));
    await assertFails(uploadJpeg(anonStorage, "chat/player1/anon.jpg"));
    await assertFails(uploadJpeg(playerStorage, "media/player-upload.jpg"));
    await assertSucceeds(uploadJpeg(bureauStorage, "media/bureau-upload.jpg"));

    console.log("[rules] OK — permissions Firestore et Storage vérifiées avec les Emulators.");
  } finally {
    await testEnv.cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  assert.fail(err.message || String(err));
});
