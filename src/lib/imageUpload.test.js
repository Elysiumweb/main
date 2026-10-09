import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

/* ---------------------------------------------------------------------------
 * Le bug qui faisait tourner « Envoi en cours » indéfiniment :
 * uploadBytesResumable ne signale rien quand la requête reste suspendue.
 * Ces tests verrouillent la garantie inverse — la promesse se termine
 * TOUJOURS (succès, erreur ou délai dépassé + annulation).
 * ------------------------------------------------------------------------- */

jest.mock("./firebase", () => ({ storage: { __storage: true } }));
jest.mock("firebase/storage", () => ({
  ref: (storage, path) => ({ __path: path }),
  uploadBytesResumable: jest.fn(),
  getDownloadURL: jest.fn(),
}));

const { uploadBlob, isStorageReady, uploadErrorKey, buildUploadPath, UPLOAD_STALL_MS } = require("./imageUpload");

/* Tâche factice : les observateurs ne répondent que si le test le décide,
   ce qui reproduit exactement le silence du SDK quand le réseau bloque. */
let observers = {};
let cancelled = false;
let controlledTask = null;

const makeTask = () => {
  observers = { progress: null, error: null, complete: null };
  cancelled = false;
  const task = {
    snapshot: { ref: { __path: "x" } },
    then: undefined, // une vraie UploadTask est alorsable : son rejet doit rester absorbé
    // Signature réelle du SDK : on(event, next, error, complete).
    on: (event, progress, error, complete) => {
      observers = { progress, error, complete };
      return task;
    },
    cancel: () => { cancelled = true; },
  };
  return task;
};

const emitProgress = (bytesTransferred, totalBytes) => observers.progress?.({ bytesTransferred, totalBytes });

/* Le gestionnaire doit être attaché AU MÊME TICK que la promesse, sinon Node
   traite le rejet comme non géré et tue le process de test. */
const capture = (promise) => promise.then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }));

beforeEach(() => {
  controlledTask = makeTask();
  getDownloadURL.mockReset().mockResolvedValue("https://firebasestorage.googleapis.com/v0/b/demo/o/image.jpg");
  uploadBytesResumable.mockReset().mockReturnValue(controlledTask);
  process.env.REACT_APP_FIREBASE_API_KEY = "demo-key";
  process.env.REACT_APP_FIREBASE_STORAGE_BUCKET = "demo-bucket";
});

afterEach(() => {
  delete process.env.REACT_APP_FIREBASE_API_KEY;
  delete process.env.REACT_APP_FIREBASE_STORAGE_BUCKET;
  jest.useRealTimers();
});

describe("uploadBlob", () => {
  it("renvoie l'URL publique quand l'envoi aboutit", async () => {
    jest.useFakeTimers();
    const settled = capture(uploadBlob({ type: "image/jpeg", size: 10 }, "media/a.jpg"));
    emitProgress(5, 10);
    emitProgress(10, 10);
    await observers.complete();
    const result = await settled;
    expect(result).toEqual({ ok: true, value: "https://firebasestorage.googleapis.com/v0/b/demo/o/image.jpg" });
    expect(getDownloadURL).toHaveBeenCalled();
  });

  it("n'émet plus de minuteries une fois l'envoi terminé", async () => {
    jest.useFakeTimers();
    const settled = capture(uploadBlob({ type: "image/jpeg", size: 10 }, "media/a.jpg"));
    await observers.complete();
    await settled;
    // Une minuterie résiduelle annulerait plus tard une tâche déjà finie.
    expect(jest.getTimerCount()).toBe(0);
  });

  it("abandonne et annule la tâche quand aucun octet n'arrive (le bug de la boucle)", async () => {
    jest.useFakeTimers();
    const settled = capture(uploadBlob({ type: "image/jpeg", size: 10 }, "media/a.jpg"));
    expect(cancelled).toBe(false);
    jest.advanceTimersByTime(UPLOAD_STALL_MS + 1);
    const result = await settled;
    expect(result.ok).toBe(false);
    expect(result.error).toMatchObject({ code: "stalled" });
    expect(cancelled).toBe(true);
    expect(uploadErrorKey({ code: "stalled" })).toBe("upload.timeout");
  });

  it("relance le délai à chaque progression puis plafonne la durée totale", async () => {
    jest.useFakeTimers();
    const settled = capture(uploadBlob({ type: "image/jpeg", size: 100 }, "media/a.jpg", { stallMs: 20000, maxMs: 60000 }));
    // Un envoi lent mais vivant ne doit pas être coupé au premier silence :
    // la progression arrive toutes les 10 s, le délai de relance est réarmé.
    for (let i = 0; i < 5; i++) {
      jest.advanceTimersByTime(10000);
      emitProgress((i + 1) * 20, 100);
      expect(cancelled).toBe(false);
    }
    // Le plafond global tranche malgré des octets qui continuent d'arriver.
    jest.advanceTimersByTime(10000);
    const result = await settled;
    expect(result.error).toMatchObject({ code: "timeout" });
    expect(cancelled).toBe(true);
  });

  it("remonte l'erreur du SDK sans laisser l'état occupé", async () => {
    jest.useFakeTimers();
    const settled = capture(uploadBlob({ type: "image/jpeg", size: 10 }, "media/a.jpg"));
    observers.error(new Error("storage/unauthorized"));
    const result = await settled;
    expect(result.error).toMatchObject({ code: "failed" });
    expect(uploadErrorKey({ code: "failed" })).toBe("upload.error");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("absorbe le rejet interne du SDK pour ne pas polluer la console", async () => {
    jest.useFakeTimers();
    const rejecting = makeTask();
    rejecting.then = (resolve, reject) => Promise.reject(new Error("unhandled")).catch(() => {});
    uploadBytesResumable.mockReturnValue(rejecting);
    const settled = capture(uploadBlob({ type: "image/jpeg", size: 10 }, "media/a.jpg"));
    observers.error(new Error("boom"));
    const result = await settled;
    expect(result.ok).toBe(false);
  });

  it("refuse d'envoyer si le stockage n'est pas configuré", async () => {
    delete process.env.REACT_APP_FIREBASE_STORAGE_BUCKET;
    expect(isStorageReady()).toBe(false);
    const result = await capture(uploadBlob({ type: "image/jpeg" }, "media/a.jpg"));
    expect(result.error).toMatchObject({ code: "not-configured" });
    expect(uploadBytesResumable).not.toHaveBeenCalled();
    expect(uploadErrorKey({ code: "not-configured" })).toBe("upload.notConfigured");
  });

  it("refuse d'envoyer sans contenu", async () => {
    const result = await capture(uploadBlob(null, "media/a.jpg"));
    expect(result.error).toMatchObject({ code: "empty" });
  });
});

describe("buildUploadPath", () => {
  it("range le fichier dans son dossier avec un nom unique", () => {
    expect(buildUploadPath("players", { name: "Photo Joueur.PNG" })).toMatch(/^players\/\d+_[a-z0-9]{6}\.png$/);
  });
});