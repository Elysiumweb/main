import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { ELYSIUM_ERROR, ELYSIUM_SUCCESS, MATCH_GUILD_ID, SITE_URL } from "../config.js";
import { respondElysium } from "../lib/embeds.js";
import {
  getSitePlayers,
  isFirebaseConnected,
  linkPseudoToPlayer,
} from "../lib/firebase.js";
import { ensureAllowedCommandUser, isCommandAllowedUser } from "../lib/permissions.js";

export const linkCommandDefinition = new SlashCommandBuilder()
  .setName("link")
  .setDescription("Relie un pseudo en jeu (replay) à la fiche d'un joueur du site Elysium")
  .addStringOption((opt) =>
    opt
      .setName("pseudo")
      .setDescription("Pseudo en jeu / présent dans les replays (saisie manuelle)")
      .setRequired(true)
      .setMaxLength(80)
  )
  .addStringOption((opt) =>
    opt
      .setName("joueur")
      .setDescription("Joueur présent sur le site Elysium")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addBooleanOption((opt) =>
    opt
      .setName("retirer")
      .setDescription("Mettre sur Vrai uniquement pour supprimer ce pseudo de la fiche du joueur")
      .setRequired(false)
  );

export const handleLinkAutocomplete = async (interaction) => {
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
      const haystack = [p.pseudo, p.game, p.roster, ...(p.aliases || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(focused);
    });

    const choices = filtered.slice(0, 25).map((p) => {
      const details = [p.game, p.roster].filter(Boolean).join(" · ");
      const aliasCount = p.aliases?.length ? ` (${p.aliases.length} pseudo${p.aliases.length > 1 ? "s" : ""})` : "";
      const label = `${p.pseudo}${details ? ` — ${details}` : ""}${aliasCount}`.slice(0, 100);
      return { name: label, value: p.id };
    });

    await interaction.respond(choices);
  } catch (err) {
    console.error("[/link autocomplete]", err);
    await interaction.respond([]);
  }
};

export const handleLinkCommand = async (interaction) => {
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

  const pseudo = interaction.options.getString("pseudo", true).trim();
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

  try {
    const players = await getSitePlayers();
    const target =
      players.find((p) => p.id === selectedPlayer) ||
      players.find((p) => p.pseudo.toLowerCase() === selectedPlayer.toLowerCase());

    if (!target) {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "❌ Joueur introuvable",
        description:
          "Veuillez choisir un joueur dans la liste proposée par le bot (issue des fiches joueurs du site).",
      });
      return;
    }

    const result = await linkPseudoToPlayer({
      pseudo,
      playerId: target.id,
      remove,
    });

    const allPseudos = [result.player.pseudo, ...(result.aliases || [])];
    const uniqueDisplay = [...new Set(allPseudos.filter(Boolean))];
    const profileUrl = `${SITE_URL}/equipe/${target.id}`;

    const fields = [
      {
        name: "👤 Fiche joueur du site",
        value: `[**${result.player.pseudo}**](${profileUrl})${result.player.game ? ` (${result.player.game}${result.player.roster ? ` · ${result.player.roster}` : ""})` : ""}`,
        inline: true,
      },
      {
        name: remove ? "🗑️ Pseudo retiré" : "🏷️ Pseudo relié",
        value: `\`${pseudo}\``,
        inline: true,
      },
      {
        name: `🔗 Tous les pseudos reconnus dans les replays (${uniqueDisplay.length})`,
        value: uniqueDisplay.map((n) => `\`${n}\``).join(", ") || "—",
        inline: false,
      },
    ];

    if (result.movedFrom) {
      fields.push({
        name: "ℹ️ Réattribution automatique",
        value: `Ce pseudo était précédemment rattaché à **${result.movedFrom}** et a été transféré vers **${result.player.pseudo}**.`,
        inline: false,
      });
    }

    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_SUCCESS,
      title: remove
        ? "✅ Pseudo retiré de la fiche joueur"
        : "✅ Pseudo relié au joueur du site",
      description: remove
        ? `Le pseudo \`${pseudo}\` a bien été dissocié de **${result.player.pseudo}**.`
        : `Lors de l'import des prochains replays, le pseudo \`${pseudo}\` sera automatiquement relié à la fiche de **${result.player.pseudo}** sur le site !`,
      fields,
    });
  } catch (err) {
    console.error("[/link]", err);
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "❌ Erreur lors de la liaison",
      description: err.message || "Une erreur inattendue est survenue.",
    });
  }
};
