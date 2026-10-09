import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

/* ------------------------------------------------------------------ *
 * Téléversement d'images — source de vérité unique du site.
 *
 * Cloud Storage n'existe pas sur le plan gratuit Firebase (un bucket
 * exige Blaze depuis février 2026) et les hôbergeurs d'images tiers
 * n'acceptent pas les appels sortants de Vercel. Les images sont donc
 * **compressées puis stockées dans Firestore**, en base64, dans une
 * collection `images` dédiée.
 *
 * Choix assumés :
 *  - Firestore est déjà en place, gratuit, et lu par le site public ;
 *  - la valeur stockée est une data URL : aucun changement dans les
 *    composants qui font déjà `<img src={logo}>` ;
 *  - Firestore plafonne un document à 1 Mio : l'image est donc
 *    recompressée tant qu'elle dépasse le budget (600 Ko décodés).
 *
 * Deux pièges corrigés ici, qui laissaient les écrans d'upload figés sur
 * « Envoi en cours » :
 *
 *  1. Une écriture restée suspendue ne produit ni succès ni erreur.
 *     → délai maximal + abandon, avec `settled` pour qu'une réponse
 *     tardive ne remette pas l'interface en état occupé.
 *  2. La compression canvas pouvait ne jamais rendre la main si la
 *     décodification de l'image ne déclenchait aucun événement.
 *     → `COMPRESS_TIMEOUT_MS` + rejet explicite.
 * ------------------------------------------------------------------ */

/** 600 Ko décodés ≈ 800 Ko de base64, sous le plafond de 1 Mio de Firestore. */
export const MAX_IMAGE_BYTES = 600 * 1024;
export const UPLOAD_TIMEOUT_MS = 30000;
export const COMPRESS_TIMEOUT_MS = 30000;

/** Paliers de compression : on descend tant que l'image dépasse le budget. */
const QUALITY_STEPS = [0.82, 0.7, 0.55];

export const uploadError = (code, cause) => {
  const err = new Error(code);
  err.code = code;
  if (cause) err.cause = cause;
  return err;
};

/** Clé de traduction associée à une erreur de téléversement. */
export const uploadErrorKey = (err) => {
  const code = String(err?.code || "");
  if (code.endsWith("unavailable") || code.endsWith("deadline-exceeded") || code === "stalled") {
    return "upload.timeout";
  }
  if (code.endsWith("permission-denied")) return "upload.forbidden";
  if (code.endsWith("resource-exhausted")) return "upload.rateLimited";
  if (code === "too-large" || code === "not-configured") return "upload.invalidImage";
  if (code.endsWith("failed-precondition")) return "upload.notConfigured";
  return "upload.error";
};

const isFirebaseReady = () =>
  Boolean(db && process.env.REACT_APP_FIREBASE_API_KEY && process.env.REACT_APP_FIREBASE_PROJECT_ID);

/**
 * On peut tenter un envoi dès que Firebase est configuré : les images
 * partent dans Firestore, aucun service tiers à installer. Une configuration
 * absente se signale sur l'appel, avec un message explicite.
 */
export const isUploadReady = () => isFirebaseReady();

const withTimeout = (promise, ms, code) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(uploadError(code)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });

/** Réduit et convertit une image en JPEG. */
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
            (b) => (b ? resolve(b) : reject(uploadError("encode-error"))),
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

/** Compression adaptative : on baisse la qualité jusqu'à tenir dans le budget. */
export const prepareImage = async (file, maxWidth = 1600) => {
  let blob = null;
  for (const quality of QUALITY_STEPS) {
    blob = await compressImage(file, maxWidth, quality);
    if (blob.size <= MAX_IMAGE_BYTES) return blob;
  }
  throw uploadError("too-large");
};

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(uploadError("read-error"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

/**
 * Enregistre l'image dans `images/{id}` et renvoie la data URL à utiliser
 * partout où le site attendait une URL. La promesse se résout ou se rejette
 * TOUJOURS : au-delà du délai elle abandonne, au lieu de laisser l'interface
 * tourner indéfiniment.
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
      if (!isFirebaseReady()) throw uploadError("not-configured");
      if (!blob) throw uploadError("empty");
      if (!folder) throw uploadError("no-folder");
      if (blob.size > MAX_IMAGE_BYTES) throw uploadError("too-large");

      const data = await blobToDataUrl(blob);
      await addDoc(collection(db, "images"), {
        data,
        mime: blob.type || "image/jpeg",
        bytes: blob.size,
        folder: String(folder).slice(0, 40),
        ownerUid: auth?.currentUser?.uid || null,
        createdAt: serverTimestamp(),
      });
      return data;
    })();

    // Le garde-fou : au-delà du délai on abandonne, et une réponse tardive ne
    // peut plus rien réafficher (c'est ce qui figeait l'écran avant).
    work.then(
      (url) => settle(resolve, url),
      (err) => settle(reject, err)
    );
    timer = setTimeout(() => settle(reject, uploadError("stalled")), timeoutMs);
  });
