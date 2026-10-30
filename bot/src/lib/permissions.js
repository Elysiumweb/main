import { OWNER_USER_ID } from "../config.js";
import { respondElysium } from "./embeds.js";
import { getAllowedUsers } from "./store.js";

/** Vrai uniquement pour l'utilisateur principal 520496557146243072. */
export const isOwnerUser = (userId) => String(userId || "") === OWNER_USER_ID;

/** Vrai pour 520496557146243072 OU tout utilisateur ajouté via /command-allowed. */
export const isCommandAllowedUser = (userId) => {
  const id = String(userId || "");
  if (!id) return false;
  if (isOwnerUser(id)) return true;
  return getAllowedUsers().includes(id);
};

/** Vérifie l'accès propriétaire exclusif (pour /command-allowed) et répond en erreur sinon. */
export const ensureOwnerOnly = async (interaction) => {
  if (isOwnerUser(interaction.user?.id)) return true;
  await respondElysium(interaction, {
    ephemeral: true,
    color: 0xf87171,
    title: "⛔ Accès refusé",
    description:
      "Cette commande est strictement réservée à l'administrateur principal du bot.",
  });
  return false;
};

/** Vérifie l'accès aux commandes restreintes (/ask-result, /link, /send-message). */
export const ensureAllowedCommandUser = async (interaction) => {
  if (isCommandAllowedUser(interaction.user?.id)) return true;
  await respondElysium(interaction, {
    ephemeral: true,
    color: 0xf87171,
    title: "⛔ Permission requise",
    description:
      "Vous n'avez pas l'autorisation d'utiliser cette commande. Seul l'administrateur ou un membre autorisé via `/command-allowed` peut l'exécuter.",
  });
  return false;
};
