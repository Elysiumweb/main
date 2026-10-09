import { callProtected } from "./secureForms";

/* ------------------------------------------------------------------ *
 * Téléversement d'images — source de vérité unique du site.
 *
 * Cloud Storage n'existe pas sur le plan gratuit (bucket = Blaze depuis
 * février 2026) : les images partent chez imgbb via la callable
 * `uploadImage`, qui garde la clé API en secret de fonction. Le navigateur
 * ne voit jamais la clé.
 *
 * Deux pièges corrigés ici, qui laissaient les écrans d'upload figés sur
 * « Envoi en cours » :
 *
 *  1. L'appel pouvait ne jamais se terminer (réseau coupé, fonction
 *     injoignable). → délai maximal + abandon, avec `settled` pour
 *     qu'une réponse tardive ne remette pas l'interface en état occupé.
 *  2. La compression canvas pouvait ne jamais rendre la main si la
 *     décodification de l'image ne déclenchait aucun événement.
 *     → `COMPRESS_TIMEOUT_MS` + rejet explicite.
 * ------------------------------------------------------------------ */

export const UPLOAD_TIMEOUT_MS = 90000;
export const COMPRESS_TIMEOUT_MS = 30000;

export const uploadError = (code, cause) => {
  const err = new Error(code);
  err.code = code;
  if (cause) err.cause = cause;
  return err;
};

/** Clé de traduction associée à une erreur de téléversement. */
export const uploadErrorKey = (err) => {
  const code = String(err?.code || "");
  if (code.endsWith("unavailable") || code === "stalled") return "upload.timeout";
  if (code === "not-configured" || code.endsWith("failed-precondition") || code.endsWith("unauthenticated")) {
    return "upload.notConfigured";
  }
  if (code.endsWith("resource-exhausted")) return "upload.rateLimited";
  if (code.endsWith("permission-denied")) return "upload.forbidden";
  if (code.endsWith("invalid-argument")) return "upload.invalidImage";
  return "upload.error";
};

/**
 * L'envoi passe par une callable Firebase : il faut la configuration de
 * l'application, mais surtout pas de bucket.
 */
export const isUploadReady = () =>
  Boolean(process.env.REACT_APP_FIREBASE_API_KEY && process.env.REACT_APP_FIREBASE_PROJECT_ID);

const withTimeout = (promise, ms, code) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(uploadError(code)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });

/** Réduit et convertit une image en JPEG avant envoi. */
export const compressImage = (file, maxWidth = 1600, quality = 0.82) =>
  withTimeout(
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(uploadError("read-error"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(uploadError("decode-error"));
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject(uploadError("canvas-error")); return; }
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(uploadError("encode-error"))),
            "image/jpeg",
            quality
          );
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    }),
    COMPRESS_TIMEOUT_MS,
    "compress-timeout"
  );

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(uploadError("read-error"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

/**
 * Envoie une image et renvoie son URL publique. La promesse se résout ou se
 * rejette TOUJOURS : au-delà de `timeoutMs` elle abandonne, au lieu de laisser
 * l'interface tourner indéfiniment.
 */
export const uploadBlob = (blob, folder, { timeoutMs = UPLOAD_TIMEOUT_MS } = {}) =>
  new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const settle = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    };

    const work = (async () => {
      if (!isUploadReady()) throw uploadError("not-configured");
      if (!blob) throw uploadError("empty");
      if (!folder) throw uploadError("no-folder");
      const image = await blobToDataUrl(blob);
      const result = await callProtected("uploadImage", { image, folder });
      if (!result?.url) throw uploadError("no-url");
      return result.url;
    })();

    // Le garde-fou : au-delà du délai on abandonne, et une réponse tardive ne
    // peut plus rien réafficher (c'est ce qui figeait l'écran avant).
    work.then(
      (url) => settle(resolve, url),
      (err) => settle(reject, err)
    );
    timer = setTimeout(() => settle(reject, uploadError("stalled")), timeoutMs);
  });
