/**
 * Invitations du staff
 * ============================================================================
 * Le rôle et les permissions fines d'un compte ne doivent pas être saisis à la
 * main, utilisateur par utilisateur. Un gestionnaire d'équipe génère une
 * invitation (lien + QR code) dont le jeton est l'identifiant Firestore.
 *
 * L'acceptation passe exclusivement par cette Function (Admin SDK) :
 *   - authentification obligatoire ;
 *   - email du destinataire vérifié quand il est renseigné ;
 *   - expiration et usage unique contrôlés dans une transaction ;
 *   - rôle + permissions validés par liste blanche avant écriture ;
 *   - journal d'audit.
 *
 * Aucune règle Firestore n'autorise un utilisateur à modifier lui-même son
 * rôle ou ses permissions : c'est le point de sécurité central.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const db = admin.firestore();

const REGION = process.env.FUNCTIONS_REGION || "us-central1";
const TOKEN_PATTERN = /^[0-9a-f]{24,96}$/;
const ALLOWED_ROLES = ["player", "manager", "bureau"];
const ALLOWED_PERMISSIONS = [
  "inbox.support", "inbox.recruit", "inbox.manage", "inbox.export", "inbox.canned",
  "articles.manage", "media.manage", "content.edit", "announcements.manage",
  "matches.manage", "rosters.manage", "positions.manage", "events.manage",
  "tryouts.manage", "competitions.manage", "opponents.manage",
  "partners.manage", "campaigns.manage", "newsletter.manage",
  "analytics.view", "team.manage", "redirects.manage", "flags.manage", "audit.view",
];

const normalizePermissions = (raw) =>
  [...new Set((Array.isArray(raw) ? raw : []).filter((p) => ALLOWED_PERMISSIONS.includes(p)))];

exports.redeemInvitation = onCall(
  { region: REGION, cors: true, enforceAppCheck: false },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Connectez-vous pour accepter l'invitation.");

    const token = String(request.data?.token || "");
    if (!TOKEN_PATTERN.test(token)) throw new HttpsError("invalid-argument", "Jeton d'invitation invalide.");

    const email = String(request.auth.token.email || "").toLowerCase();
    const tokenRef = db.collection("invitations").doc(token);
    const userRef = db.collection("users").doc(uid);

    try {
      const result = await db.runTransaction(async (tx) => {
        const [inviteSnap, userSnap] = await Promise.all([tx.get(tokenRef), tx.get(userRef)]);
        if (!inviteSnap.exists) throw new HttpsError("not-found", "Invitation introuvable.");
        if (!userSnap.exists) throw new HttpsError("failed-precondition", "Profil utilisateur introuvable.");

        const invite = inviteSnap.data() || {};
        if (invite.status !== "pending") {
          throw new HttpsError("failed-precondition", "Cette invitation n'est plus valable.");
        }
        const expiration = invite.expiresAt?.toDate ? invite.expiresAt.toDate() : null;
        if (expiration && expiration.getTime() < Date.now()) {
          throw new HttpsError("failed-precondition", "Cette invitation a expiré.");
        }
        const targetEmail = String(invite.email || "").toLowerCase();
        if (targetEmail && targetEmail !== email) {
          throw new HttpsError("permission-denied", "Cette invitation est réservée à une autre adresse email.");
        }

        const role = ALLOWED_ROLES.includes(invite.role) ? invite.role : "player";
        const permissions = normalizePermissions(invite.permissions);
        const previous = userSnap.data() || {};

        tx.set(userRef, {
          role,
          permissions,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          invitationToken: token,
        }, { merge: true });

        tx.update(tokenRef, {
          status: "accepted",
          usedBy: uid,
          usedByEmail: email || null,
          usedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        tx.set(db.collection("admin_audit").doc(), {
          action: "staff_invitation_redeemed",
          label: targetEmail || invite.note || token.slice(0, 8),
          actorUid: uid,
          actorName: previous.displayName || "",
          actorEmail: email,
          targetCollection: "users",
          targetId: uid,
          details: { role, permissions, invitationId: token },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return { role, permissions, alreadyOfficial: previous.official === true };
      });

      logger.info(`redeemInvitation: uid=${uid} role=${result.role} permissions=${result.permissions.length}`);
      return result;
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("redeemInvitation", err);
      throw new HttpsError("internal", "Impossible d'accepter l'invitation pour le moment.");
    }
  },
);
