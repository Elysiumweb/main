/* ---------------------------------------------------------------------------
 * Le transport n'est plus Firebase Storage (bucket = Blaze) mais la callable
 * `uploadImage`. On verrouille la garantie qui compte : l'appel se termine
 * TOUJOURS, et une réponse tardive ne peut pas réactiver un état occupé.
 * ------------------------------------------------------------------------- */

const mockCall = jest.fn();
jest.mock("./secureForms", () => ({ callProtected: (...args) => mockCall(...args) }));

const { uploadBlob, uploadErrorKey, isUploadReady, UPLOAD_TIMEOUT_MS, COMPRESS_TIMEOUT_MS } = require("./imageUpload");

/* FileReader minimal : jsdom ne décode pas les images, on teste le transport. */
const withDataUrl = (value) => {
  class FakeReader {
    onerror = null;
    onload = null;
    result = value;
    // Synchrone : sinon les minuteries factices figeraient le test.
    readAsDataURL() { this.onload?.(); }
  }
  global.FileReader = FakeReader;
};

beforeEach(() => {
  withDataUrl("data:image/jpeg;base64,AAAA");
  mockCall.mockReset();
  process.env.REACT_APP_FIREBASE_API_KEY = "demo-key";
  process.env.REACT_APP_FIREBASE_PROJECT_ID = "demo-project";
});

afterEach(() => {
  delete process.env.REACT_APP_FIREBASE_API_KEY;
  delete process.env.REACT_APP_FIREBASE_PROJECT_ID;
  jest.useRealTimers();
});

const blob = { type: "image/jpeg", size: 2048 };

describe("uploadBlob", () => {
  it("renvoie l'URL renvoyée par la fonction", async () => {
    mockCall.mockResolvedValue({ url: "https://i.ibb.co/abc/logo.jpg" });
    await expect(uploadBlob(blob, "matches")).resolves.toBe("https://i.ibb.co/abc/logo.jpg");
    expect(mockCall).toHaveBeenCalledWith("uploadImage", {
      image: "data:image/jpeg;base64,AAAA",
      folder: "matches",
    });
  });

  it("n'émet plus de minuterie une fois l'appel terminé", async () => {
    jest.useFakeTimers();
    mockCall.mockResolvedValue({ url: "https://i.ibb.co/abc/logo.jpg" });
    await uploadBlob(blob, "matches");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("abandonne l'appel au délai imparti au lieu de figer l'écran", async () => {
    jest.useFakeTimers();
    mockCall.mockImplementation(() => new Promise(() => {})); // jamais résolue
    const promise = uploadBlob(blob, "matches");
    const settled = promise.then(() => "ok", (err) => err);
    jest.advanceTimersByTime(UPLOAD_TIMEOUT_MS + 1);
    const result = await settled;
    expect(result).toMatchObject({ code: "stalled" });
    expect(uploadErrorKey({ code: "stalled" })).toBe("upload.timeout");
  });

  it("ignore une réponse tardive : l'état reste après l'abandon", async () => {
    jest.useFakeTimers();
    let resolveCall;
    mockCall.mockImplementation(() => new Promise((r) => { resolveCall = r; }));
    const settled = uploadBlob(blob, "matches").then(() => "ok", (err) => err);
    jest.advanceTimersByTime(UPLOAD_TIMEOUT_MS + 1);
    expect(await settled).toMatchObject({ code: "stalled" });
    // L'appel finit enfin, beaucoup plus tard : plus rien ne doit se déclencher.
    resolveCall({ url: "https://i.ibb.co/tardif.jpg" });
    expect(await settled).toMatchObject({ code: "stalled" });
  });

  it("remonte l'erreur du serveur sans laisser l'état occupé", async () => {
    jest.useFakeTimers();
    const denied = Object.assign(new Error("Réservé au bureau"), { code: "functions/permission-denied" });
    mockCall.mockRejectedValue(denied);
    const settled = uploadBlob(blob, "matches").then(() => null, (err) => err);
    await expect(settled).resolves.toBe(denied);
    // Aucune minuterie résiduelle : l'écran peut se Liberationner.
    expect(jest.getTimerCount()).toBe(0);
    expect(uploadErrorKey(denied)).toBe("upload.forbidden");
  });

  it("traduit chaque refus du serveur en message utile", () => {
    expect(uploadErrorKey({ code: "functions/resource-exhausted" })).toBe("upload.rateLimited");
    expect(uploadErrorKey({ code: "functions/invalid-argument" })).toBe("upload.invalidImage");
    expect(uploadErrorKey({ code: "functions/failed-precondition" })).toBe("upload.notConfigured");
    expect(uploadErrorKey({ code: "functions/unavailable" })).toBe("upload.timeout");
    expect(uploadErrorKey({ code: "functions/internal" })).toBe("upload.error");
  });

  it("refuse d'envoyer si l'application Firebase n'est pas configurée", async () => {
    delete process.env.REACT_APP_FIREBASE_PROJECT_ID;
    expect(isUploadReady()).toBe(false);
    await expect(uploadBlob(blob, "matches")).rejects.toMatchObject({ code: "not-configured" });
    expect(mockCall).not.toHaveBeenCalled();
    expect(uploadErrorKey({ code: "not-configured" })).toBe("upload.notConfigured");
  });

  it("refuse d'envoyer sans image ni dossier", async () => {
    await expect(uploadBlob(null, "matches")).rejects.toMatchObject({ code: "empty" });
    await expect(uploadBlob(blob, "")).rejects.toMatchObject({ code: "no-folder" });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("refuse une réponse sans URL", async () => {
    mockCall.mockResolvedValue({});
    await expect(uploadBlob(blob, "matches")).rejects.toMatchObject({ code: "no-url" });
  });
});

describe("délais exposés", () => {
  it(" borne aussi la compression", () => {
    expect(COMPRESS_TIMEOUT_MS).toBeGreaterThan(0);
    expect(UPLOAD_TIMEOUT_MS).toBeGreaterThan(COMPRESS_TIMEOUT_MS);
  });
});