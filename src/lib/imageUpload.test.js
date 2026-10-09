/* ---------------------------------------------------------------------------
 * Deux transports, tous deux sans commande de déploiement :
 *  1. la passerelle Vercel `/api/upload` (clé secrète côté serveur) ;
 *  2. l'envoi direct chez imgbb si `REACT_APP_IMBB_KEY` est injectée au build.
 *
 * On verrouille l'ordre, le repli, et la garantie qui compte depuis le début :
 * l'appel se termine TOUJOURS.
 * ------------------------------------------------------------------------- */

/* XHR factice : on pilote la réponse à la main, comme un réseau qui traîne.
   Chaque requête est conservée pour pouvoir en inspecter l'ordre. */
const requests = [];
class FakeXHR {
  constructor() {
    this.upload = {};
    this.status = 0;
    this.responseText = "";
    this.aborted = false;
    requests.push(this);
  }
  static get last() { return requests[requests.length - 1]; }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(name, value) { (this.headers ||= {})[name] = value; }
  send(body) { this.body = body; }
  abort() { this.aborted = true; this.onabort?.(); }
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
const SERVER_URL = "/api/upload?folder=matches";

/* La promesse doit être capturée AVANT d'émettre la réponse, sinon Node
   traite le rejet comme non géré. */
const capture = (promise) => promise.then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }));

/* Le repli direct est enclenché dans une micro-tâche après le 404. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  global.XMLHttpRequest = FakeXHR;
  requests.length = 0;
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
  console.warn.mockRestore();
  delete process.env.REACT_APP_IMGBB_KEY;
  jest.useRealTimers();
});

describe("uploadBlob — passerelle serveur (clé secrète)", () => {
  it("poste le binaire sur /api/upload et renvoie l'URL", async () => {
    const settled = capture(uploadBlob(IMG, "matches"));
    expect(requests).toHaveLength(1);
    expect(FakeXHR.last.method).toBe("POST");
    expect(FakeXHR.last.url).toBe(SERVER_URL);
    expect(FakeXHR.last.headers["Content-Type"]).toBe("image/jpeg");
    expect(FakeXHR.last.body).toBe(IMG);

    FakeXHR.last.respond(200, { url: "https://i.ibb.co/abc/logo.jpg" });
    await expect(settled).resolves.toEqual({ ok: true, value: "https://i.ibb.co/abc/logo.jpg" });
  });

  it("remonte la progression d'envoi au composant", async () => {
    const steps = [];
    const settled = capture(uploadBlob(IMG, "matches", { onProgress: (p) => steps.push(p) }));
    FakeXHR.last.progress(50, 100);
    FakeXHR.last.progress(100, 100);
    FakeXHR.last.respond(200, { url: "https://i.ibb.co/abc/logo.jpg" });
    await settled;
    expect(steps).toEqual([50, 100]);
  });

  it("ne tente pas le repli si la passerelle existe mais n'a pas de clé", async () => {
    const settled = capture(uploadBlob(IMG, "matches"));
    FakeXHR.last.respond(503, { error: "Envoi d'images non configuré (IMGBB_KEY manquante)." });
    const result = await settled;
    expect(result.error).toMatchObject({ code: "rejected" });
    expect(requests).toHaveLength(1);
    expect(uploadErrorKey(result.error)).toBe("upload.error");
  });

  it("refuse de repartir en direct quand aucune clé n'est injectée", async () => {
    const settled = capture(uploadBlob(IMG, "matches"));
    FakeXHR.last.respond(404, {});
    const result = await settled;
    expect(result.error).toMatchObject({ code: "not-configured" });
    expect(uploadErrorKey({ code: "not-configured" })).toBe("upload.notConfigured");
  });
});

describe("uploadBlob — repli direct chez imgbb", () => {
  beforeEach(() => { process.env.REACT_APP_IMGBB_KEY = "cle-de-test"; });

  it("bascule sur imgbb quand le projet n'a pas de passerelle", async () => {
    const settled = capture(uploadBlob(IMG, "matches"));
    FakeXHR.last.respond(404, {}); // pas de /api sur ce déploiement
    await flush();
    expect(requests).toHaveLength(2);
    expect(FakeXHR.last.url).toContain("https://api.imgbb.com/1/upload?key=cle-de-test");

    FakeXHR.last.respond(200, { success: true, data: { url: "https://i.ibb.co/direct.jpg" } });
    await expect(settled).resolves.toEqual({ ok: true, value: "https://i.ibb.co/direct.jpg" });
  });

  it("envoie un multipart et non du binaire en direct", async () => {
    const settled = capture(uploadBlob(IMG, "matches"));
    FakeXHR.last.respond(404, {});
    await flush();
    const direct = FakeXHR.last;
    expect(direct.body).toBeInstanceOf(FormData);
    expect(direct.body.get("image")).toBeInstanceOf(Blob);
    expect(direct.body.get("name")).toBe("matches");
    direct.respond(200, { success: true, data: { url: "https://i.ibb.co/direct.jpg" } });
    await settled;
  });

  it("signale un refus de l'hébergeur sans rester en attente", async () => {
    const settled = capture(uploadBlob(IMG, "matches"));
    FakeXHR.last.respond(404, {});
    await flush();
    FakeXHR.last.respond(400, { success: false, error: { message: "Invalid image" } });
    const result = await settled;
    expect(result.error).toMatchObject({ code: "rejected", cause: { message: "Invalid image" } });
  });
});

describe("uploadBlob — plus jamais d'écran figé", () => {
  it("abandonne l'envoi si rien ne revient (le bug de la boucle)", async () => {
    jest.useFakeTimers();
    const settled = capture(uploadBlob(IMG, "matches"));
    jest.advanceTimersByTime(UPLOAD_TIMEOUT_MS + 6000);
    const result = await settled;
    expect(result.error).toMatchObject({ code: "stalled" });
    expect(FakeXHR.last.aborted).toBe(true);
    expect(uploadErrorKey({ code: "stalled" })).toBe("upload.timeout");
  });

  it("ignore une réponse tardive après abandon", async () => {
    jest.useFakeTimers();
    const settled = capture(uploadBlob(IMG, "matches"));
    jest.advanceTimersByTime(UPLOAD_TIMEOUT_MS + 6000);
    expect((await settled).error).toMatchObject({ code: "stalled" });
    FakeXHR.last.respond(200, { url: "https://i.ibb.co/tardif.jpg" });
    expect((await settled).error).toMatchObject({ code: "stalled" });
  });

  it("n'émet plus de minuterie une fois l'envoi terminé", async () => {
    jest.useFakeTimers();
    const settled = capture(uploadBlob(IMG, "matches"));
    FakeXHR.last.respond(200, { url: "https://i.ibb.co/abc/logo.jpg" });
    await settled;
    expect(jest.getTimerCount()).toBe(0);
  });

  it("traduit les pannes réseau en message lisible", () => {
    expect(uploadErrorKey({ code: "network" })).toBe("upload.timeout");
    expect(uploadErrorKey({ code: "aborted" })).toBe("upload.timeout");
    expect(uploadErrorKey({ code: "rejected" })).toBe("upload.error");
    expect(uploadErrorKey({ code: "too-large" })).toBe("upload.invalidImage");
  });

  it("refuse une image absente, un dossier vide ou un fichier trop lourd", async () => {
    expect((await capture(uploadBlob(null, "matches"))).error).toMatchObject({ code: "empty" });
    expect((await capture(uploadBlob(IMG, ""))).error).toMatchObject({ code: "no-folder" });
    const heavy = { type: "image/jpeg", size: 6 * 1024 * 1024 };
    expect((await capture(uploadBlob(heavy, "matches"))).error).toMatchObject({ code: "too-large" });
    expect(requests).toHaveLength(0);
  });
});

describe("contrat de configuration", () => {
  it("un envoi est toujours tentable dans un navigateur", () => {
    expect(isUploadReady()).toBe(true);
  });

  it("borne la compression et l'envoi", () => {
    expect(COMPRESS_TIMEOUT_MS).toBeGreaterThan(0);
    expect(UPLOAD_TIMEOUT_MS).toBeGreaterThan(0);
  });
});