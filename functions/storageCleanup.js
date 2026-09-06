const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const STORAGE_PATH_FIELDS = [
  "storagePath",
  "coverStoragePath",
  "photoStoragePath",
  "imageStoragePath",
  "attachmentStoragePath",
  "thumbnailStoragePath",
];

const ALLOWED_PREFIXES = ["media/", "articles/", "players/", "chat/", "avatars/", "messages/"];

const isSafeStoragePath = (value) => {
  if (typeof value !== "string") return false;
  const path = value.trim();
  if (!path || path.startsWith("/") || path.includes("..") || /^https?:\/\//i.test(path)) return false;
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
};

const collectStoragePaths = (data = {}) => {
  const paths = new Set();
  STORAGE_PATH_FIELDS.forEach((field) => {
    const value = data[field];
    if (Array.isArray(value)) value.forEach((item) => isSafeStoragePath(item) && paths.add(item.trim()));
    else if (isSafeStoragePath(value)) paths.add(value.trim());
  });
  return [...paths];
};

const cleanupDeletedDocumentFiles = async (event) => {
  const data = event.data?.data() || {};
  const paths = collectStoragePaths(data);
  if (!paths.length) return null;

  await Promise.all(paths.map(async (path) => {
    try {
      await admin.storage().bucket().file(path).delete({ ignoreNotFound: true });
      logger.info("storageCleanup: fichier supprimé", { firestorePath: event.data.ref.path, storagePath: path });
    } catch (err) {
      logger.error("storageCleanup: suppression impossible", { firestorePath: event.data.ref.path, storagePath: path, error: err });
    }
  }));
  return { deleted: paths.length };
};

exports.cleanupDeletedMediaFile = onDocumentDeleted(
  { document: "media/{id}", memory: "128MiB", timeoutSeconds: 60 },
  cleanupDeletedDocumentFiles,
);

exports.cleanupDeletedArticleFile = onDocumentDeleted(
  { document: "articles/{id}", memory: "128MiB", timeoutSeconds: 60 },
  cleanupDeletedDocumentFiles,
);

exports.cleanupDeletedRosterFile = onDocumentDeleted(
  { document: "roster/{id}", memory: "128MiB", timeoutSeconds: 60 },
  cleanupDeletedDocumentFiles,
);

exports.cleanupDeletedChatMessageFile = onDocumentDeleted(
  { document: "chats/{channelId}/messages/{messageId}", memory: "128MiB", timeoutSeconds: 60 },
  cleanupDeletedDocumentFiles,
);

exports.cleanupDeletedSupportMessageFile = onDocumentDeleted(
  { document: "supportThreads/{threadId}/messages/{messageId}", memory: "128MiB", timeoutSeconds: 60 },
  cleanupDeletedDocumentFiles,
);

exports.cleanupDeletedRecruitMessageFile = onDocumentDeleted(
  { document: "recruitThreads/{threadId}/messages/{messageId}", memory: "128MiB", timeoutSeconds: 60 },
  cleanupDeletedDocumentFiles,
);
