import { MessageFlags, SlashCommandBuilder } from "discord.js";
import {
  ELYSIUM_ERROR,
  ELYSIUM_SUCCESS,
  MATCH_GUILD_ID,
  SITE_URL,
} from "../config.js";
import { respondElysium } from "../lib/embeds.js";
import {
  getSitePlayers,
  isFirebaseConnected,
  linkDiscordToPlayer,
} from "../lib/firebase.js";
import { ensureAllowedCommandUser, isCommandAllowedUser } from "../lib/permissions.js";

export const linkDiscordCommandDefinition = new SlashCommandBuilder()
  .setName("link-discord")
  .setDescription("Relie un compte Discord à la fiche d'un joueur sur le site Elysium")
  .addUserOption((opt) =>
    opt
      .setName("utilisateur")
      .setDescription("Compte Discord du joueur à lier")
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("joueur")
      .setDescription("Fiche joueur correspondante sur le site Elysium")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addBooleanOption((opt) =>
    opt
      .setName("retirer")
      .setDescription("Mettre sur Vrai uniquement pour délier le compte Discord de cette fiche joueur")
      .setRequired(false)
  );

export const handleLinkDiscordAutocomplete = async (interaction) => {
  if (!isCommandAllowedUser(interaction.user?.id)) {
    await interaction.respond([]);
    return;
  }
  if (!isFirebaseConnected()) {
    await interaction.respond([
      {
        name: "⚠️ Configurez Firebase (serviceAccountKey.json) pour charger les joueurs",
        value: "__firebase_missing__",
      },
    ]);
    return;
  }

  try {
    const focused = String(interaction.options.getFocused() || "").trim().toLowerCase();
    const players = await getSitePlayers();
    const filtered = players.filter((p) => {
      if (!focused) return true;
      const haystack = [
        p.pseudo,
        p.game,
        p.roster,
        p.discordUsername,
        p.discordId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(focused);
    });

    const choices = filtered.slice(0, 25).map((p) => {
      const details = [p.game, p.roster].filter(Boolean).join(" · ");
      const discordSuffix = p.discordId
        ? ` (🔗 ${p.discordUsername ? `@${p.discordUsername}` : p.discordId})`
        : "";
      const label = `${p.pseudo}${details ? ` — ${details}` : ""}${discordSuffix}`.slice(0, 100);
      return { name: label, value: p.id };
    });

    await interaction.respond(choices);
  } catch (err) {
    console.error("[/link-discord autocomplete]", err);
    await interaction.respond([]);
  }
};

export const handleLinkDiscordCommand = async (interaction) => {
  if (interaction.guildId !== MATCH_GUILD_ID) {
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "⛔ Serveur non autorisé",
      description: "Cette commande n'est utilisable que sur le serveur esport Elysium.",
    });
    return;
  }
  if (!(await ensureAllowedCommandUser(interaction))) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const targetDiscordUser = interaction.options.getUser("utilisateur", true);
  const selectedPlayer = interaction.options.getString("joueur", true).trim();
  const remove = interaction.options.getBoolean("retirer") || false;

  if (!isFirebaseConnected() || selectedPlayer === "__firebase_missing__") {
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "⚠️ Connexion au site requise",
      description:
        "Le bot n'est pas encore relié à Firebase Firestore. Ajoutez `bot/serviceAccountKey.json` ou `FIREBASE_SERVICE_ACCOUNT_JSON` dans `bot/.env`.",
    });
    return;
  }

  if (targetDiscordUser.bot && !remove) {
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "❌ Compte invalide",
      description: "Impossible de lier un bot Discord à une fiche joueur du site.",
    });
    return;
  }

  try {
    const players = await getSitePlayers();
    const targetPlayer =
      players.find((p) => p.id === selectedPlayer) ||
      players.find((p) => p.pseudo.toLowerCase() === selectedPlayer.toLowerCase());

    if (!targetPlayer) {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "❌ Joueur introuvable",
        description:
          "Veuillez sélectionner un joueur dans la liste proposée par le bot (issue des fiches joueurs du site).",
      });
      return;
    }

    const discordLabel =
      targetDiscordUser.username ||
      targetDiscordUser.globalName ||
      targetDiscordUser.tag ||
      "";

    const result = await linkDiscordToPlayer({
      discordId: targetDiscordUser.id,
      discordUsername: discordLabel,
      playerId: targetPlayer.id,
      remove,
    });

    const profileUrl = `${SITE_URL}/equipe/${targetPlayer.id}`;
    const rosterDetails = [result.player.game, result.player.roster].filter(Boolean).join(" · ");

    const fields = [
      {
        name: "👤 Fiche joueur du site",
        value: `[**${result.player.pseudo}**](${profileUrl})${rosterDetails ? `\n*${rosterDetails}*` : ""}`,
        inline: true,
      },
      {
        name: remove ? "🔓 Compte Discord délié" : "💬 Compte Discord lié",
        value: remove
          ? result.previousDiscordId
            ? `<@${result.previousDiscordId}> (\`${result.previousDiscordId}\`)`
            : "Aucun compte lié"
          : `<@${targetDiscordUser.id}> (\`${targetDiscordUser.id}\`)`,
        inline: true,
      },
    ];

    if (result.movedFrom) {
      fields.push({
        name: "ℹ️ Réattribution automatique",
        value: `Ce compte Discord était précédemment relié à la fiche **${result.movedFrom}** et a été transféré vers **${result.player.pseudo}**.`,
        inline: false,
      });
    }

    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_SUCCESS,
      title: remove
        ? "✅ Compte Discord délié de la fiche joueur"
        : "✅ Compte Discord relié au joueur du site",
      description: remove
        ? `La fiche joueur de **${result.player.pseudo}** n'est plus reliée à un compte Discord.`
        : `<@${targetDiscordUser.id}> est désormais rattaché à la fiche joueur **${result.player.pseudo}**${result.player.roster ? ` (**Elysium ${result.player.roster}**)` : ""} sur le site !\nCe joueur peut maintenant utiliser \`/scrim\` et \`/cancel\` pour son roster.`,
      fields,
    });
  } catch (err) {
    console.error("[/link-discord]", err);
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "❌ Erreur lors de la liaison Discord",
      description: err.message || "Une erreur inattendue est survenue.",
    });
  }
};
