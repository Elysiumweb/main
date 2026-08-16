/**
 * RSVP du calendrier communautaire — transactionnel et limité à sa propre
 * participation.
 * ----------------------------------------------------------------------------
 * Avant : la règle Firestore autorisait tout visiteur à REMPLACER l'intégralité
 * du tableau `participants` d'un communityEvent. N'importe qui pouvait donc
 * vider la liste ou usurper les inscriptions des autres.
 *
 * Désormais : l'écriture directe est fermée (firestore.rules) et le RSVP passe
 * par cette callable :
 *  - visiteur connecté  → identifié par son uid ;
 *  - visiteur anonyme   → le serveur émet un jeton secret dont seul le hash
 *    est stocké (`communityEvents/{id}/rsvps/{participantId}`) ; se désinscrire
 *    exige ce jeton.
 * La transaction ne touche qu'UNE entrée du tableau `participants` (affichage
 * public), jamais celles des autres.
 */

const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const { enforceFormPolicy, hashKey } = require("./lib/abuse");
const { cleanString } = require("./lib/validate");

const db = () => admin.firestore();
const MAX_PARTICIPANTS = 500;

exports.rsvpCommunityEvent = onCall(
  { memory: "256MiB", timeoutSeconds: 30, secrets: ["RECAPTCHA_SECRET"] },
  async (request) => {
    await enforceFormPolicy(request, { scope: "rsvp", soft: 10, max: 30, windowMs: 60 * 60 * 1000 });

    const eventId = cleanString(request.data?.eventId, { name: "événement", max: 128 });
    const action = request.data?.action === "leave" ? "leave" : "join";
    const uid = request.auth?.uid || null;
    const displayName = cleanString(request.data?.name, { name: "nom", max: 60, required: false }) || "Anonyme";

    const eventRef = db().collection("communityEvents").doc(eventId);

    if (action === "join") {
      const participantId = uid || `anon_${crypto.randomBytes(9).toString("hex")}`;
      const token = uid ? null : crypto.randomBytes(24).toString("hex");
      const rsvpRef = eventRef.collection("rsvps").doc(participantId);

      await db().runTransaction(async (tx) => {
        const [evSnap, rsvpSnap] = await Promise.all([tx.get(eventRef), tx.get(rsvpRef)]);
        if (!evSnap.exists) throw new HttpsError("not-found", "Événement introuvable.");
        if (rsvpSnap.exists) return; // déjà inscrit → idempotent

        const participants = Array.isArray(evSnap.data().participants) ? evSnap.data().participants : [];
        if (participants.length >= MAX_PARTICIPANTS) {
          throw new HttpsError("resource-exhausted", "Événement complet.");
        }
        const next = participants.filter((p) => p && p.id !== participantId);
        next.push({ id: participantId, name: displayName });

        tx.set(rsvpRef, {
          uid,
          name: displayName,
          tokenHash: token ? hashKey(token) : null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.update(eventRef, { participants: next });
      });
      return { ok: true, participantId, token };
    }

    // action === "leave"
    const participantId = uid || cleanString(request.data?.participantId, { name: "participant", max: 128 });
    const token = typeof request.data?.token === "string" ? request.data.token : "";
    const rsvpRef = eventRef.collection("rsvps").doc(participantId);

    await db().runTransaction(async (tx) => {
      const [evSnap, rsvpSnap] = await Promise.all([tx.get(eventRef), tx.get(rsvpRef)]);
      if (!evSnap.exists) throw new HttpsError("not-found", "Événement introuvable.");
      if (!rsvpSnap.exists) return; // rien à faire → idempotent

      const rsvp = rsvpSnap.data();
      const authorized = (uid && rsvp.uid === uid)
        || (!rsvp.uid && rsvp.tokenHash && token && rsvp.tokenHash === hashKey(token));
      if (!authorized) {
        throw new HttpsError("permission-denied", "Vous ne pouvez retirer que votre propre participation.");
      }

      const participants = Array.isArray(evSnap.data().participants) ? evSnap.data().participants : [];
      tx.delete(rsvpRef);
      tx.update(eventRef, { participants: participants.filter((p) => p && p.id !== participantId) });
    });
    return { ok: true, participantId };
  }
);
