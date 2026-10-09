/* ---------------------------------------------------------------------------
 * L'envoi part directement chez imgbb depuis le navigateur : la clé vient de
 * la variable d'environnement Vercel `REACT_APP_IMGBB_KEY`. On verrouille la
 * garantie qui compte — l'appel se termine TOUJOURS — et le fait qu'aucune clé
 * ne soit écrite en dur dans le dépôt.
 * ------------------------------------------------------------------------- */

/* XHR factice : on pilote la réponse à la main, comme un réseau qui traîne. */
class FakeXHR {
  static last = null;
  constructor() {
    this.upload = {};
    this.status = 0;
    this.responseText = "";
    this.aborted = false;
    FakeXHR.last = this;
  }
  open(method, url) { this.method = method; this.url = url; }
  send(body) { this.body = body; }
  abort() { this.aborted = true; this.onabort?.(); }
  /* Déclencheurs de test */
  progress(loaded, total) { this.upload.onprogress?.({ lengthComputable: true, loaded, total }); }
  respond(status, payload) {
    this.status = status;
    this.response = payload;
    this.responseText = JSON.stringify(payload);
    this.onload?.();
  }
}

const { uploadBlob, uploadErrorKey, isUploadReady, UPLOAD_TIMEOUT_MS, COMPRESS_TIMEOUT_MS } = require("./imageUpload");

const IMG = new Blob([new Uint8Array(2048)], { type: "image/jpeg" });

beforeEach(() => {
  global.XMLHttpRequest = FakeXHR;
  FakeXHR.last = null;
  process.env.REACT_APP_IMGBB_KEY = "cle-de-test";
});

afterEach(() => {
  delete process.env.REACT_APP_IMGBB_KEY;
  jest.useRealTimers();
});

/* La promesse doit être capturée AVANT d'émettre la réponse, sinon le rejet
   est traité comme non géré par Node. */
const capture = (promise) => promise.then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }));

describe("uploadBlob", () => {
  it("poste l'image chez imgbb avec la clé de l'environnement", async () => {
    const settled = capture(uploadBlob(IMG, "matches"));
    const xhr = FakeXHR.last;
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toContain("https://api.imgbb.com/1/upload?key=");
    expect(xhr.url).toContain("cle-de-test");
    expect(xhr.body.get("image")).toBeInstanceOf(Blob);
    expect(xhr.body.get("name")).toBe("matches");

    xhr.respond(200, { success: true, data: { url: "https://i.ibb.co/abc/logo.jpg" } });
    await expect(settled).resolves.toEqual({ ok: true, value: "https://i.ibb.co/abc/logo.jpg" });
  });

  it("remonte la progression d'envoi au composant", async () => {
    const steps = [];
    const settled = capture(uploadBlob(IMG, "matches", { onProgress: (p) => steps.push(p) }));
    FakeXHR.last.progress(50, 100);
    FakeXHR.last.progress(100, 100);
    FakeXHR.last.respond(200, { success: true, data: { url: "https://i.ibb.co/abc/logo.jpg" } });
    await settled;
    expect(steps).toEqual([50, 100]);
  });

  it("remonte le refus de l'hébergeur sans rester en attente", async () => {
    const settled = capture(uploadBlob(IMG, "matches"));
    FakeXHR.last.respond(400, { success: false, error: { message: "Invalid image" } });
    const result = await settled;
    expect(result.ok).toBe(false);
    expect(result.error).toMatchObject({ code: "rejected" });
  });

  it("abandonne l'envoi si l'hébergeur ne répond pas (le bug de la boucle)", async () => {
    jest.useFakeTimers();
    const settled = capture(uploadBlob(IMG, "matches"));
    jest.advanceTimersByTime(UPLOAD_TIMEOUT_MS + 6000);
    const result = await settled;
    expect(result.error).toMatchObject({ code: "stalled" });
    expect(FakeXHR.last.aborted).toBe(true);
    expect(uploadErrorKey({ code: "stalled" })).toBe("upload.timeout");
  });

  it("n'émet plus de minuterie une fois l'envoi terminé", async () => {
    jest.useFakeTimers();
    const settled = capture(uploadBlob(IMG, "matches"));
    FakeXHR.last.respond(200, { success: true, data: { url: "https://i.ibb.co/abc/logo.jpg" } });
    await settled;
    expect(jest.getTimerCount()).toBe(0);
  });

  it("ignore une réponse tardive après abandon", async () => {
    jest.useFakeTimers();
    const settled = capture(uploadBlob(IMG, "matches"));
    jest.advanceTimersByTime(UPLOAD_TIMEOUT_MS + 6000);
    expect((await settled).error).toMatchObject({ code: "stalled" });
    // L'hébergeur répond après coup : plus rien ne doit se déclencher.
    FakeXHR.last.respond(200, { success: true, data: { url: "https://i.ibb.co/tardif.jpg" } });
    expect((await settled).error).toMatchObject({ code: "stalled" });
  });

  it("refuse d'envoyer sans clé injectée au build", async () => {
    delete process.env.REACT_APP_IMGBB_KEY;
    expect(isUploadReady()).toBe(false);
    const result = await capture(uploadBlob(IMG, "matches"));
    expect(result.error).toMatchObject({ code: "not-configured" });
    expect(FakeXHR.last).toBeNull();
    expect(uploadErrorKey({ code: "not-configured" })).toBe("upload.notConfigured");
  });

  it("refuse d'envoyer sans image, sans dossier ou au-delà de 5 Mo", async () => {
    expect((await capture(uploadBlob(null, "matches"))).error).toMatchObject({ code: "empty" });
    expect((await capture(uploadBlob(IMG, ""))).error).toMatchObject({ code: "no-folder" });
    const heavy = await capture(uploadBlob({ type: "image/jpeg", size: 6 * 1024 * 1024 }, "matches"));
    expect(heavy.error).toMatchObject({ code: "too-large" });
    expect(uploadErrorKey({ code: "too-large" })).toBe("upload.invalidImage");
    expect(FakeXHR.last).toBeNull();
  });

  it("traduit les pannes réseau en message lisible", () => {
    expect(uploadErrorKey({ code: "network" })).toBe("upload.timeout");
    expect(uploadErrorKey({ code: "rejected" })).toBe("upload.error");
  });
});

describe("délais exposés", () => {
  it("borne aussi la compression", () => {
    expect(COMPRESS_TIMEOUT_MS).toBeGreaterThan(0);
    expect(UPLOAD_TIMEOUT_MS).toBeGreaterThan(0);
  });
});