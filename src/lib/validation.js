/* ---------------------------------------------------------------------------
 * Validation des URLs et des images saisies dans les formulaires admin.
 *
 * Deux formats coexistent pour une image :
 *  - une URL externe classique : https://… (ou http://…)
 *  - une data URL base64 : data:image/jpeg;base64,… — c'est ce que produit
 *    ImageUpload (voir src/lib/imageUpload.js) : l'image est compressée puis
 *    stockée dans Firestore, et le champ reçoit la data URL résultante.
 *
 * Valider un champ image avec /^https?:\/\// seul rejetait systématiquement
 * les images téléversées : le formulaire match affichait « URL invalide »
 * dès qu'un logo était renseigné. Ces helpers acceptent donc les deux formats.
 * ------------------------------------------------------------------------- */

const HTTP_URL_RE = /^https?:\/\/.+/i;
const DATA_IMAGE_RE = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i;

const normalize = (s) => String(s ?? "").trim();

/** Vraie URL externe, obligatoire : https://example.com (trimée). */
export const isHttpUrl = (s) => HTTP_URL_RE.test(normalize(s));

/** URL externe facultative : vide accepté, sinon http(s) exigé. */
export const isOptionalHttpUrl = (s) => {
  const v = normalize(s);
  return v === "" || isHttpUrl(v);
};

/** Data URL d'image renvoyée par ImageUpload (base64 dans Firestore). */
export const isDataImageUrl = (s) => DATA_IMAGE_RE.test(normalize(s));

/**
 * Valeur d'un champ image : vide (facultatif), URL http(s), ou data URL
 * image produite par le téléversement intégré.
 */
export const isImageValue = (s) => isOptionalHttpUrl(s) || isDataImageUrl(s);
