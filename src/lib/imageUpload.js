/* ------------------------------------------------------------------ *
 * Téléversement d'images — source de vérité unique du site.
 *
 * Le plan gratuit Firebase n'a pas de Storage (un bucket exige Blaze
 * depuis février 2026). Les images partent donc chez imgbb, l'hébergeur
 * des visuels i.ibb.co, directement depuis le navigateur.
 *
 * Deux transports, sans commande de déploiement dans aucun cas :
 *
 *  1. **Passerelle serveur** (recommandé) — `POST /api/upload`, une fonction
 *     Vercel qui relaie l'envoi avec la variable `IMGBB_KEY`. Sans préfixe
 *     `REACT_APP_`, elle n'est PAS publique : Vercel accepte de la marquer
 *     « secret » et elle n'arrive jamais dans le navigateur.
 *  2. **Envoi direct** — si `REACT_APP_IMGBB_KEY` est définie, le navigateur
 *     poste lui-même chez imgbb. Cette variable-ci est forcément publique
 *     (Create React App l'inline dans le JS), donc Vercel refuse de la
 *     marquer secrète. C'est le repli quand le projet n'a pas de fonctions.
 *
 * Le repli est tenté seulement quand la passerelle n'existe pas, afin qu'un
 * projet sans /api ne reste pas bloqué.
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
const SERVER_ENDPOINT = "/api/upload";
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

/**
 * On peut toujours tenter un envoi : soit via la clé injectée au build, soit
 * via la passerelle serveur. La configuration manquante se signale alors sur
 * l'appel lui-même, avec un message explicite.
 */
export const isUploadReady = () => Boolean(apiKey()) || typeof window !== "undefined";

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

/**
 * POST binaire avec progression réelle, et abandon si rien n'arrive.
 * `endpoint` decide si l'on vise imgbb directement ou la passerelle.
 */
const post = ({ endpoint, blob, folder, onProgress, timeoutMs, readUrl }) =>
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

    xhr.open("POST", endpoint);
    xhr.timeout = timeoutMs;
    if (readUrl) xhr.responseType = "json";
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
    }
    xhr.onload = () => {
      const payload = xhr.response || safeJson(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) {
        const url = readUrl ? payload?.url : payload?.success && payload?.data?.url;
        if (url) { settle(resolve, url); return; }
      }
      // 503 = la passerelle existe mais n'a pas de clé : on ne tente pas le repli.
      console.error("[upload]", xhr.status, payload);
      // 404 = pas de fonction /api sur ce déploiement : le repli direct peut
      // prendre le relais si une clé publique est présente.
      if (xhr.status === 404) { settle(reject, uploadError("not-found")); return; }
      settle(reject, uploadError("rejected", payload?.error));
    };
    xhr.onerror = () => abort("network");
    xhr.ontimeout = () => abort("stalled");
    xhr.onabort = () => settle(reject, uploadError("aborted"));

    if (readUrl) {
      // Passerelle : le binaire brut, le dossier dans l'URL — pas de base64.
      xhr.setRequestHeader("Content-Type", blob.type || "image/jpeg");
      xhr.send(blob);
    } else {
      const name = folder.replace(/[^a-zA-Z0-9-]/g, "-");
      const form = new FormData();
      form.append("image", blob, `${name}.jpg`);
      form.append("name", name);
      xhr.send(form);
    }

    // `xhr.timeout` suffit en théorie ; ce garde-fou couvre le cas où la
    // connexion reste ouverte sans émettre le timeout (réseau instable).
    timer = setTimeout(() => abort("stalled"), timeoutMs + 5000);
  });

/**
 * Envoie une image et renvoie son URL publique. La promesse se résout ou se
 * rejette TOUJOURS : au-delà du délai elle abandonne, au lieu de laisser
 * l'interface tourner indéfiniment.
 */
export const uploadBlob = async (blob, folder, { onProgress, timeoutMs = UPLOAD_TIMEOUT_MS } = {}) => {
  if (!blob) throw uploadError("empty");
  if (!folder) throw uploadError("no-folder");
  // 4 Mo : sous la limite de corps de requête de Vercel et au-delà de tout ce
  // que la compression client produit pour une photo normale.
  if (blob.size > 4 * 1024 * 1024) throw uploadError("too-large");

  const key = apiKey();

  // 1. Passerelle serveur (clé secrète) — le chemin par défaut.
  try {
    return await post({
      endpoint: `${SERVER_ENDPOINT}?folder=${encodeURIComponent(folder)}`,
      blob, folder, onProgress, timeoutMs, readUrl: true,
    });
  } catch (err) {
    // Autre panne qu'une passerelle absente : remontée telle quelle.
    if (err.code !== "not-found") throw err;
    // 404 sans clé publique : aucune porte de sortie, et rien à corriger
    // côté variable d'environnement.
    if (!key) throw uploadError("not-configured");
    console.warn("[upload] passerelle absente, envoi direct chez imgbb");
  }

  // 2. Repli direct : la clé est alors dans le bundle, assumé et documenté.
  if (!key) throw uploadError("not-configured");
  return post({
    endpoint: `${IMGBB_ENDPOINT}?key=${encodeURIComponent(key)}`,
    blob, folder, onProgress, timeoutMs, readUrl: false,
  });
};