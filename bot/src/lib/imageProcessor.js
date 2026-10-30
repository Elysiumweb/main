import sharp from "sharp";

/** Limite identique à firestore.rules et src/lib/imageUpload.js (600 Ko décodés). */
export const MAX_FIRESTORE_IMAGE_BYTES = 600 * 1024;

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

export const isImageAttachment = (attachment) => {
  if (!attachment) return false;
  const ct = String(attachment.contentType || "").toLowerCase();
  if (ct.startsWith("image/")) return true;
  const name = String(attachment.name || "").toLowerCase();
  return [...IMAGE_EXTENSIONS].some((ext) => name.endsWith(ext));
};

/**
 * Compresse un buffer d'image en Data URL base64 compatible avec la collection
 * Firestore `images` et le validateur `isImageValue` du site (< 600 Ko décodés),
 * tout en préservant la transparence des logos PNG/WebP, et prépare une miniature PNG
 * pour l'affichage dans les embeds Discord.
 */
export const processOpponentLogoBuffer = async (inputBuffer) => {
  if (!inputBuffer || !inputBuffer.byteLength) {
    throw new Error("Fichier logo vide.");
  }

  const qualities = [84, 72, 58, 45];
  let webpBuffer = null;

  for (const quality of qualities) {
    const candidate = await sharp(inputBuffer)
      .rotate()
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .webp({ quality, alphaQuality: quality })
      .toBuffer();

    if (candidate.byteLength <= MAX_FIRESTORE_IMAGE_BYTES) {
      webpBuffer = candidate;
      break;
    }
  }

  // Ultime repli en réduction 256x256 si l'image source était exceptionnellement dense
  if (!webpBuffer) {
    const fallback = await sharp(inputBuffer)
      .rotate()
      .resize(256, 256, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 50 })
      .toBuffer();
    if (fallback.byteLength > MAX_FIRESTORE_IMAGE_BYTES) {
      throw new Error("Le logo adverse reste trop lourd après compression (> 600 Ko).");
    }
    webpBuffer = fallback;
  }

  const discordThumbnailBuffer = await sharp(inputBuffer)
    .rotate()
    .resize(256, 256, { fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const mime = "image/webp";
  const dataUrl = `data:${mime};base64,${webpBuffer.toString("base64")}`;

  return {
    dataUrl,
    mime,
    bytes: webpBuffer.byteLength,
    discordThumbnailBuffer,
  };
};

/** Télécharge une pièce jointe Discord en Buffer mémoire. */
export const downloadAttachmentBuffer = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Impossible de télécharger le fichier Discord (HTTP ${response.status}).`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};
