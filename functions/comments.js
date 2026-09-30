/**
 * Réactions / commentaires modérés sur les articles.
 * ----------------------------------------------------------------------------
 * - submitArticleComment : callable publique (compte requis). La collection
 *   `articleComments` est en écriture directe interdite côté client
 *   (firestore.rules) : tout passe par ici — validation serveur, quotas
 *   IP/compte, CAPTCHA adaptatif (lib/abuse.js, comme les autres formulaires).
 * - Pré-modération : le commentaire naît `status: "pending"` et n'apparaît
 *   publiquement qu'après approbation par le bureau (panel Admin → Modération).
 * - Le bureau est notifié (notifications/{id} → email + push via index.js).
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { enforceFormPolicy } = require("./lib/abuse");
const { cleanString, rejectHoneypot } = require("./lib/validate");

const db = () => admin.firestore();
const now = () => admin.firestore.FieldValue.serverTimestamp();

const MAX_TEXT = 1000;
const MAX_AUTHOR = 60;

const notify = async ({ targetRoles, type, extra = "", link = "/" }) => {
  try {
    await db().collection("notifications").add({
      targetUid: null,
      targetRoles,
      targetGame: null,
      type,
      extra,
      link,
      readBy: [],
      createdAt: now(),
    });
  } catch (err) {
    logger.error("comments notify", err);
  }
};

exports.submitArticleComment = onCall(
  { memory: "256MiB", timeoutSeconds: 30, secrets: ["RECAPTCHA_SECRET"] },
  async (request) => {
    rejectHoneypot(request.data?.website);

    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Connexion requise pour réagir.");
    }

    const articleId = cleanString(request.data?.articleId, { name: "article", min: 1, max: 120 });
    const text = cleanString(request.data?.text, { name: "commentaire", min: 2, max: MAX_TEXT });
    const authorName = cleanString(request.data?.authorName, {
      name: "auteur", min: 1, max: MAX_AUTHOR, required: false,
    }) || request.auth.token?.name || "";

    // Validation avant quotas : une erreur de saisie ne consomme pas la limite.
    await enforceFormPolicy(request, { scope: "comment", soft: 3, max: 8, windowMs: 60 * 60 * 1000 });

    const articleSnap = await db().collection("articles").doc(articleId).get();
    const article = articleSnap.exists ? articleSnap.data() : null;
    if (!article || article.status !== "published") {
      throw new HttpsError("not-found", "Article introuvable.");
    }

    const doc = await db().collection("articleComments").add({
      articleId,
      uid: request.auth.uid,
      authorName,
      text,
      status: "pending",
      createdAt: now(),
      source: "function",
    });

    await notify({
      targetRoles: ["bureau"],
      type: "comment_new",
      extra: article.title || articleId,
      link: `/actus/${articleId}`,
    });

    return { ok: true, id: doc.id, status: "pending" };
  }
);
