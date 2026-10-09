/* ------------------------------------------------------------------ *
 * Téléversement d'images — source de vérité unique du site.
 *
 * Le plan gratuit Firebase n'a pas de Storage (un bucket exige Blaze
 * depuis février 2026). Les images partent donc chez imgbb, l'hébergeur
 * des visuels i.ibb.co, directement depuis le navigateur.
 *
 * La clé vient de la variable d'environnement Vercel `REACT_APP_IMGBB_KEY`
 * (Create React App ne lit que les variables `REACT_APP_*`). Elle est
 * donc visible dans le bundle du site : à toi de la régénérer si elle
 * fuit, c'est le compromis assumé pour éviter une commande de déploiement.
 *
 * Deux pièges corrigés ici, qui laissaient les écrans d'upload figés sur
 * « Envoi en cours » :
 *
 *  1. Une requête restée suspendue ne déclenche ni progression ni
 *     erreur. → `XHR.timeout` + minuterie d'abandon explicite.
 *  2. La compression canvas pouvait ne jamais rendre la main si la
 *     décodification de l'image ne déclenchait aucun événement.
 *     → `COMPRESS_TIMEOUT_MS` + rejet explicite.
 * ------------------------------------------------------------------ */

const IMGBB_ENDPOINT = "https://api.imgbb.com/1/upload";
export const UPLOAD_TIMEOUT_MS = 45000;
export const COMPRESS_TIMEOUT_MS = 30000;

/** Clé lue au moment de l'envoi : elle est figée par le build Vercel. */
const apiKey = () => (process.env.REACT_APP_IMGBB_KEY || "").trim();

export const uploadError = (code, cause) => {
  const err = new Error(code);
  err.code = code;
  if (cause) err.cause = cause;
  return err;
};

/** Clé de traduction associée à une erreur de téléversement. */
export const uploadErrorKey = (err) => {
  const code = String(err?.code || "");
  if (code === "not-configured") return "upload.notConfigured";
  if (code === "stalled" || code === "aborted" || code === "network") return "upload.timeout";
  if (code === "too-large") return "upload.invalidImage";
  return "upload.error";
};

/** Sans clé injectée au build, l'envoi est refusé au lieu de partir à l'aveugle. */
export const isUploadReady = () => Boolean(apiKey());

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

const safeJson = (text) => {
  try { return JSON.parse(text); } catch { return null; }
};

/** POST vers imgbb avec progression réelle, et abandon si rien n'arrive. */
const postToImgbb = (blob, folder, { onProgress, timeoutMs = UPLOAD_TIMEOUT_MS } = {}) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let timer = null;

    const settle = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    };
    const abort = (code) => {
      // On tranche AVANT d'abandonner la requête : `xhr.abort()` peut déclencher
      // onabort de façon synchrone selon l'implémentation, et le motif de l'échec
      // (« délai dépassé ») doit primer sur le générique (« interrompu »).
      settle(reject, uploadError(code));
      try { xhr.abort(); } catch { /* déjà arrêté */ }
    };

    xhr.open("POST", `${IMGBB_ENDPOINT}?key=${encodeURIComponent(apiKey())}`);
    xhr.timeout = timeoutMs;
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
    }
    xhr.onload = () => {
      const payload = xhr.response || safeJson(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300 && payload?.success && payload?.data?.url) {
        settle(resolve, payload.data.url);
        return;
      }
      console.error("[upload] imgbb", xhr.status, payload?.error);
      settle(reject, uploadError("rejected", payload?.error?.message));
    };
    xhr.onerror = () => abort("network");
    xhr.ontimeout = () => abort("stalled");
    xhr.onabort = () => settle(reject, uploadError("aborted"));

    const name = folder.replace(/[^a-zA-Z0-9-]/g, "-");
    const form = new FormData();
    form.append("image", blob, `${name}.jpg`);
    form.append("name", name);
    xhr.send(form);

    // `xhr.timeout` suffit en théorie ; ce garde-fou couvre le cas où la
    // connexion reste ouverte sans émettre le timeout (réseau instable).
    timer = setTimeout(() => abort("stalled"), timeoutMs + 5000);
  });

/**
 * Envoie une image et renvoie son URL publique. La promesse se résout ou se
 * rejette TOUJOURS : au-delà du délai elle abandonne, au lieu de laisser
 * l'interface tourner indéfiniment.
 */
export const uploadBlob = (blob, folder, { onProgress, timeoutMs = UPLOAD_TIMEOUT_MS } = {}) => {
  if (!isUploadReady()) return Promise.reject(uploadError("not-configured"));
  if (!blob) return Promise.reject(uploadError("empty"));
  if (!folder) return Promise.reject(uploadError("no-folder"));
  // 5 Mo : la limite d'imgbb sur le plan gratuit est bien plus haute, on
  // borne surtout pour ne pas figer un mobile sur une photo de 12 Mo.
  if (blob.size > 5 * 1024 * 1024) return Promise.reject(uploadError("too-large"));
  return postToImgbb(blob, folder, { onProgress, timeoutMs });
};