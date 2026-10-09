import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

/* ------------------------------------------------------------------ *
 * Téléversement d'images — source de vérité unique du site.
 *
 * Deux pièges corrigés ici, qui laissaient tous les écrans d'upload
 * bloqués indéfiniment sur « Envoi en cours » :
 *
 *  1. `uploadBytesResumable` ne signale RIEN quand la requête réseau
 *     reste en suspens (variables d'environnement Firebase absentes,
 *     domaine firebasestorage bloqué, hors ligne). Ni progression, ni
 *     erreur : la promesse ne se résout jamais. → minuterie de relance
 *     (`stallMs`) et durée maximale (`maxMs`), avec annulation du
 *     transfert dans les deux cas.
 *  2. La compression canvas pouvait ne jamais rendre la main si la
 *     décodification de l'image ne déclenchait aucun événement.
 *     → `COMPRESS_TIMEOUT_MS` + rejet explicite.
 *
 * Toute fonction exported ici se termine toujours : succès, erreur, ou
 * délai dépassé.
 * ------------------------------------------------------------------ */

export const UPLOAD_STALL_MS = 20000; // sans octet reçu pendant 20 s → échec
export const UPLOAD_MAX_MS = 120000; // plafond absolu d'un envoi
export const COMPRESS_TIMEOUT_MS = 30000;

export const uploadError = (code, cause) => {
  const err = new Error(code);
  err.code = code;
  if (cause) err.cause = cause;
  return err;
};

/** Clé de traduction associée à une erreur de téléversement. */
export const uploadErrorKey = (err) => {
  const code = err?.code;
  if (code === "not-configured") return "upload.notConfigured";
  if (code === "stalled" || code === "timeout") return "upload.timeout";
  return "upload.error";
};

/**
 * Le stockage n'est exploitable que si la configuration Firebase a été
 * figée au build (CRA). Sans elle, on refuse tout de suite plutôt que de
 * laisser tourner.
 */
export const isStorageReady = () =>
  Boolean(storage && process.env.REACT_APP_FIREBASE_API_KEY && process.env.REACT_APP_FIREBASE_STORAGE_BUCKET);

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
      reader.onerror = () => reject(uploadError("read-error", new Error("read-error")));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(uploadError("decode-error", new Error("decode-error")));
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject(uploadError("canvas-error", new Error("canvas-error"))); return; }
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(uploadError("encode-error", new Error("encode-error")))),
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

const extensionFor = (file) => {
  const name = (file?.name || "").toLowerCase();
  if (/\.png$/.test(name)) return "png";
  if (/\.webp$/.test(name)) return "webp";
  if (/\.gif$/.test(name)) return "gif";
  return "jpg";
};

/** Chemin unique et lisible dans le bucket : `dossier/1700000000_ab12cd.jpg`. */
export const buildUploadPath = (folder, file) =>
  `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extensionFor(file)}`;

/**
 * Envoie un blob vers Firebase Storage et renvoie son URL publique.
 * La promesse se résout toujours : le délai de relance et le plafond annulent
 * la tâche au lieu de laisser l'interface tourner indéfiniment.
 */
export const uploadBlob = (blob, path, { onProgress, stallMs = UPLOAD_STALL_MS, maxMs = UPLOAD_MAX_MS } = {}) =>
  new Promise((resolve, reject) => {
    if (!isStorageReady()) { reject(uploadError("not-configured")); return; }
    if (!blob) { reject(uploadError("empty")); return; }

    let task = null;
    let settled = false;
    let stallTimer = null;
    let maxTimer = null;

    const settle = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(stallTimer);
      clearTimeout(maxTimer);
      fn(arg);
    };
    const abort = (code) => {
      try { task?.cancel(); } catch { /* tâche déjà terminée */ }
      settle(reject, uploadError(code));
    };

    maxTimer = setTimeout(() => abort("timeout"), maxMs);

    try {
      task = uploadBytesResumable(ref(storage, path), blob, { contentType: blob.type || "image/jpeg" });
    } catch (err) {
      settle(reject, uploadError("failed", err));
      return;
    }
    // La promesse interne du SDK rejette aussi à l'échec : on l'absorbe pour
    // éviter un rejet non géré quand seul l'observateur nous intéresse.
    if (task && typeof task.then === "function") task.then(undefined, () => {});

    stallTimer = setTimeout(() => abort("stalled"), stallMs);

    task.on(
      "state_changed",
      (snap) => {
        clearTimeout(stallTimer);
        stallTimer = setTimeout(() => abort("stalled"), stallMs);
        if (snap.totalBytes) onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      (err) => settle(reject, uploadError("failed", err)),
      async () => {
        try {
          settle(resolve, await getDownloadURL(task.snapshot.ref));
        } catch (err) {
          settle(reject, uploadError("failed", err));
        }
      }
    );
  });