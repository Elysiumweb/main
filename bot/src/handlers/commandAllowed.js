import { SlashCommandBuilder } from "discord.js";
import { ELYSIUM_INFO, ELYSIUM_SUCCESS, OWNER_USER_ID } from "../config.js";
import { respondElysium } from "../lib/embeds.js";
import { ensureOwnerOnly } from "../lib/permissions.js";
import { addAllowedUser, getAllowedUsers, removeAllowedUser } from "../lib/store.js";

export const commandAllowedDefinition = new SlashCommandBuilder()
  .setName("command-allowed")
  .setDescription("Gère les utilisateurs autorisés à utiliser les commandes du bot Elysium")
  .addUserOption((opt) =>
    opt
      .setName("utilisateur")
      .setDescription("Utilisateur Discord à autoriser (ou retirer)")
      .setRequired(false)
  )
  .addStringOption((opt) =>
    opt
      .setName("action")
      .setDescription("Action à effectuer (par défaut : ajouter)")
      .setRequired(false)
      .addChoices(
        { name: "Ajouter la permission", value: "add" },
        { name: "Retirer la permission", value: "remove" },
        { name: "Voir la liste des autorisés", value: "list" }
      )
  );

export const handleCommandAllowed = async (interaction) => {
  if (!(await ensureOwnerOnly(interaction))) return;

  const targetUser = interaction.options.getUser("utilisateur");
  const explicitAction = interaction.options.getString("action");
  const action = explicitAction || (targetUser ? "add" : "list");

  if (action === "list" || !targetUser) {
    const allowed = getAllowedUsers();
    const listText =
      allowed.length === 0
        ? "*Aucun utilisateur supplémentaire enregistré pour le moment.*"
        : allowed.map((id, idx) => `${idx + 1}. <@${id}> (\`${id}\`)`).join("\n");

    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_INFO,
      title: "🔐 Permissions du bot — Utilisateurs autorisés",
      description: [
        `**Administrateur principal :** <@${OWNER_USER_ID}> (\`${OWNER_USER_ID}\`)`,
        "",
        "**Membres autorisés via `/command-allowed` :**",
        listText,
      ].join("\n"),
    });
    return;
  }

  if (targetUser.id === OWNER_USER_ID) {
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_INFO,
      title: "ℹ️ Administrateur principal",
      description: `<@${OWNER_USER_ID}> dispose déjà de toutes les permissions de manière permanente.`,
    });
    return;
  }

  if (action === "remove") {
    const removed = await removeAllowedUser(targetUser.id);
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_INFO,
      title: removed ? "✅ Permission retirée" : "ℹ️ Aucune permission active",
      description: removed
        ? `<@${targetUser.id}> (\`${targetUser.id}\`) ne peut plus utiliser les commandes du bot.`
        : `<@${targetUser.id}> ne figurait pas dans la liste des utilisateurs autorisés.`,
    });
    return;
  }

  const added = await addAllowedUser(targetUser.id);
  await respondElysium(interaction, {
    ephemeral: true,
    color: ELYSIUM_SUCCESS,
    title: added ? "✅ Permission accordée" : "ℹ️ Déjà autorisé",
    description: added
      ? `<@${targetUser.id}> (\`${targetUser.id}\`) peut désormais utiliser les commandes \`/ask-result\`, \`/link\` et \`/send-message\`.`
      : `<@${targetUser.id}> dispose déjà de la permission d'utiliser les commandes du bot.`,
  });
};
