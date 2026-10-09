/* ---------------------------------------------------------------------------
 * Les images sont compressées puis stockées dans Firestore en base64 :
 * Cloud Storage exige le plan Blaze, et aucun hébergeur tiers n'accepte
 * les appels sortants de Vercel. Ces tests verrouillent le budget Firestore
 * (plafond de 1 Mio par document) et la garantie qui compte depuis le début :
 * l'appel se termine TOUJOURS.
 * ------------------------------------------------------------------------- */

const mockAddDoc = jest.fn();
jest.mock("firebase/firestore", () => ({
  addDoc: (...args) => mockAddDoc(...args),
  collection: jest.fn(() => ({ __collection: true })),
  serverTimestamp: jest.fn(() => "ts"),
}));
jest.mock("./firebase", () => ({ db: { __db: true }, auth: { currentUser: { uid: "uid-test" } } }));

const {
  uploadBlob, prepareImage, uploadErrorKey, isUploadReady,
  MAX_IMAGE_BYTES, UPLOAD_TIMEOUT_MS, COMPRESS_TIMEOUT_MS,
} = require("./imageUpload");

/* FileReader minimal : jsdom ne décode pas les images, on teste le stockage. */
class FakeReader {
  constructor() { this.result = null; this.onload = null; this.onerror = null; }
  readAsDataURL() { this.onload?.(); }
}

const makeBlob = (size) => {
  const blob = new Blob([new Uint8Array(1)], { type: "image/jpeg" });
  Object.defineProperty(blob, "size", { value: size });
  return blob;
};

const blob = makeBlob(120 * 1024);
const IMG_DATA = "data:image/jpeg;base64,QUJD";

/* La promesse doit être capturée AVANT l'écriture, sinon Node traite le
   rejet comme non géré. */
const capture = (promise) => promise.then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }));
/* Vidage des microtâches : fonctionne aussi avec des minuteries factices,
   contrairement à setTimeout. */
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

beforeEach(() => {
  global.FileReader = class extends FakeReader {
    readAsDataURL() {
      this.result = IMG_DATA;
      this.onload?.();
    }
  };
  mockAddDoc.mockReset().mockResolvedValue({ id: "img-1" });
  process.env.REACT_APP_FIREBASE_API_KEY = "demo-key";
  process.env.REACT_APP_FIREBASE_PROJECT_ID = "demo-project";
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
  delete process.env.REACT_APP_FIREBASE_API_KEY;
  delete process.env.REACT_APP_FIREBASE_PROJECT_ID;
  jest.useRealTimers();
});

describe("uploadBlob — images dans Firestore", () => {
  it("enregistre l'image et renvoie la data URL utilisable partout", async () => {
    await expect(uploadBlob(blob, "matches")).resolves.toBe(IMG_DATA);
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
    const doc = mockAddDoc.mock.calls[0][1];
    expect(doc).toMatchObject({ data: IMG_DATA, mime: "image/jpeg", bytes: blob.size, folder: "matches", ownerUid: "uid-test" });
  });

  it("refuse une image au-delà du budget Firestore", async () => {
    const result = await capture(uploadBlob(makeBlob(MAX_IMAGE_BYTES + 1), "matches"));
    expect(result.error).toMatchObject({ code: "too-large" });
    expect(mockAddDoc).not.toHaveBeenCalled();
    expect(uploadErrorKey({ code: "too-large" })).toBe("upload.invalidImage");
  });

  it("refuse d'écrire si Firebase n'est pas configuré", async () => {
    delete process.env.REACT_APP_FIREBASE_PROJECT_ID;
    expect(isUploadReady()).toBe(false);
    const result = await capture(uploadBlob(blob, "matches"));
    expect(result.error).toMatchObject({ code: "not-configured" });
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it("refuse une image absente ou un dossier vide", async () => {
    expect((await capture(uploadBlob(null, "matches"))).error).toMatchObject({ code: "empty" });
    expect((await capture(uploadBlob(blob, ""))).error).toMatchObject({ code: "no-folder" });
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it("traduit un refus des règles en message lisible", async () => {
    const denied = Object.assign(new Error("Missing or insufficient permissions"), { code: "permission-denied" });
    mockAddDoc.mockRejectedValue(denied);
    const result = await capture(uploadBlob(blob, "matches"));
    expect(result.error).toBe(denied);
    expect(uploadErrorKey(result.error)).toBe("upload.forbidden");

    mockAddDoc.mockRejectedValue(Object.assign(new Error("unavailable"), { code: "unavailable" }));
    expect(uploadErrorKey(await (await capture(uploadBlob(blob, "matches"))).error)).toBe("upload.timeout");

    mockAddDoc.mockRejectedValue(Object.assign(new Error("quota"), { code: "resource-exhausted" }));
    expect(uploadErrorKey(await (await capture(uploadBlob(blob, "matches"))).error)).toBe("upload.rateLimited");
  });
});

describe("uploadBlob — plus jamais d'écran figé", () => {
  it("abandonne une écriture qui ne répond pas (le bug de la boucle)", async () => {
    jest.useFakeTimers();
    mockAddDoc.mockImplementation(() => new Promise(() => {}));
    const settled = capture(uploadBlob(blob, "matches"));
    jest.advanceTimersByTime(UPLOAD_TIMEOUT_MS + 1);
    const result = await settled;
    expect(result.error).toMatchObject({ code: "stalled" });
    expect(uploadErrorKey(result.error)).toBe("upload.timeout");
  });

  it("ignore une réponse tardive après abandon", async () => {
    jest.useFakeTimers();
    let finish;
    mockAddDoc.mockImplementation(() => new Promise((r) => { finish = r; }));
    const settled = capture(uploadBlob(blob, "matches"));
    jest.advanceTimersByTime(UPLOAD_TIMEOUT_MS + 1);
    expect((await settled).error).toMatchObject({ code: "stalled" });
    finish({ id: "img-2" });
    await flush();
    expect((await settled).error).toMatchObject({ code: "stalled" });
  });

  it("n'émet plus de minuterie une fois l'écriture terminée", async () => {
    jest.useFakeTimers();
    const settled = capture(uploadBlob(blob, "matches"));
    await flush();
    expect(await settled).toEqual({ ok: true, value: IMG_DATA });
    // Aucune minuterie résiduelle : rien ne peut rouvrir l'écran d'envoi.
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("prepareImage", () => {
  it("baisse la qualité tant que l'image dépasse le budget", async () => {
    global.Image = class {
      set src(value) { this._src = value; setTimeout(() => this.onload?.(), 0); }
      get width() { return 4000; }
    };
    global.document.createElement = () => ({
      width: 0, height: 0,
      getContext: () => ({ drawImage() {} }),
      toBlob: (cb) => cb(makeBlob(MAX_IMAGE_BYTES + 500)), // toujours trop lourd
    });
    await expect(prepareImage({}, 1600)).rejects.toMatchObject({ code: "too-large" });
  });

  it("s'arrête dès que l'image rentre dans le budget", async () => {
    global.Image = class {
      set src(value) { this._src = value; setTimeout(() => this.onload?.(), 0); }
      get width() { return 800; }
    };
    let calls = 0;
    global.document.createElement = () => ({
      width: 0, height: 0,
      getContext: () => ({ drawImage() {} }),
      toBlob: (cb) => { calls += 1; cb(blob); },
    });
    await expect(prepareImage({}, 1600)).resolves.toBe(blob);
    expect(calls).toBe(1); // pas de recompression inutile
  });
});

describe("budget Firestore", () => {
  it("reste sous la limite de 1 Mio par document", () => {
    // 600 Ko décodés → ~800 Ko de base64, plus les noms de champs.
    expect(MAX_IMAGE_BYTES * (4 / 3)).toBeLessThan(1_000_000);
    expect(COMPRESS_TIMEOUT_MS).toBeGreaterThan(0);
    expect(UPLOAD_TIMEOUT_MS).toBeGreaterThan(0);
  });
});