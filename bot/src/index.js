import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
} from "discord.js";
import {
  ALLOWED_GUILD_IDS,
  DISCORD_TOKEN,
  ELYSIUM_ERROR,
} from "./config.js";
import {
  handleAskResultAutocomplete,
  handleAskResultCommand,
  handleMatchReplayAttachments,
  handleMatchResultInteraction,
} from "./handlers/askResult.js";
import { handleCommandAllowed } from "./handlers/commandAllowed.js";
import {
  handleLinkAutocomplete,
  handleLinkCommand,
} from "./handlers/linkPlayer.js";
import {
  handleSendMessageCommand,
  handleTicketAndDmMessage,
  handleTicketInteraction,
} from "./handlers/tickets.js";
import {
  handleGuildMemberAdd,
  handleGuildMemberRemove,
} from "./handlers/welcomeGoodbye.js";
import { respondElysium } from "./lib/embeds.js";
import { getFirebaseStatusMessage, getFirestoreDb } from "./lib/firebase.js";
import { isOwnerUser } from "./lib/permissions.js";
import { startMatchScheduler, stopMatchScheduler } from "./lib/scheduler.js";
import { ensureDirectories, syncPermissionsWithFirestore } from "./lib/store.js";
import { syncAllGuildCommands } from "./register-commands.js";

export const createBotClient = () => {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [
      Partials.Channel,
      Partials.Message,
      Partials.GuildMember,
      Partials.User,
    ],
  });

  // --- Démarrage & restriction stricte aux 2 serveurs autorisés ---
  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`[Bot] Connecté en tant que ${readyClient.user.tag} (${readyClient.user.id})`);
    ensureDirectories();
    getFirestoreDb();
    console.log(`[Firebase] Statut : ${getFirebaseStatusMessage()}`);

    await syncPermissionsWithFirestore();

    // Quitte immédiatement tout serveur non autorisé
    for (const [guildId, guild] of readyClient.guilds.cache) {
      if (!ALLOWED_GUILD_IDS.includes(guildId)) {
        console.warn(`[Security] Serveur non autorisé détecté (${guild.name} / ${guildId}) — départ automatique.`);
        await guild.leave().catch(() => null);
      }
    }

    await syncAllGuildCommands({
      token: DISCORD_TOKEN,
      clientId: readyClient.user.id,
    });

    startMatchScheduler(readyClient);
  });

  client.on(Events.GuildCreate, async (guild) => {
    if (!ALLOWED_GUILD_IDS.includes(guild.id)) {
      console.warn(`[Security] Invitation sur un serveur non autorisé (${guild.name} / ${guild.id}) — départ immédiat.`);
      await guild.leave().catch(() => null);
    }
  });

  // --- Bienvenue & Au revoir (serveur 1565264995078508554) ---
  client.on(Events.GuildMemberAdd, handleGuildMemberAdd);
  client.on(Events.GuildMemberRemove, handleGuildMemberRemove);

  // --- Messages (collecte illimitée de replays + images/fichiers tickets & MP) ---
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author?.bot) return;
      if (message.inGuild() && !ALLOWED_GUILD_IDS.includes(message.guildId)) return;

      const handledReplay = await handleMatchReplayAttachments(message);
      if (handledReplay) return;

      await handleTicketAndDmMessage(message);
    } catch (err) {
      console.error("[MessageCreate] Erreur :", err);
    }
  });

  // --- Interactions (Commandes Slash, Autocomplétion, Boutons, Modales) ---
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // Garde-fou serveurs : seules les 2 guildes autorisées + les MP de l'admin principal sont acceptés
      if (interaction.inGuild()) {
        if (!ALLOWED_GUILD_IDS.includes(interaction.guildId)) {
          if (interaction.isRepliable()) {
            await respondElysium(interaction, {
              ephemeral: true,
              color: ELYSIUM_ERROR,
              title: "⛔ Serveur non autorisé",
              description: "Ce bot fonctionne exclusivement sur les serveurs officiels Elysium.",
            });
          }
          return;
        }
      } else if (!isOwnerUser(interaction.user?.id)) {
        return;
      }

      // 1) Autocomplétion dynamique (jeux, rosters, joueurs, adversaires, salons)
      if (interaction.isAutocomplete()) {
        if (interaction.commandName === "ask-result") {
          await handleAskResultAutocomplete(interaction);
          return;
        }
        if (interaction.commandName === "link") {
          await handleLinkAutocomplete(interaction);
          return;
        }
        await interaction.respond([]);
        return;
      }

      // 2) Commandes Slash
      if (interaction.isChatInputCommand()) {
        switch (interaction.commandName) {
          case "command-allowed":
            await handleCommandAllowed(interaction);
            return;
          case "link":
            await handleLinkCommand(interaction);
            return;
          case "ask-result":
            await handleAskResultCommand(interaction);
            return;
          case "send-message":
            await handleSendMessageCommand(interaction);
            return;
          default:
            return;
        }
      }

      // 3) Boutons et Modales (Matchs & Tickets)
      if (interaction.isButton() || interaction.isModalSubmit()) {
        const handledMatch = await handleMatchResultInteraction(interaction);
        if (handledMatch) return;

        await handleTicketInteraction(interaction);
      }
    } catch (err) {
      console.error("[InteractionCreate] Erreur :", err);
      if (interaction.isRepliable()) {
        await respondElysium(interaction, {
          ephemeral: true,
          color: ELYSIUM_ERROR,
          title: "❌ Une erreur est survenue",
          description: err.message || "Erreur interne du bot.",
        }).catch(() => null);
      }
    }
  });

  return client;
};

// Démarrage principal
const isMain =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  if (!DISCORD_TOKEN) {
    console.error(
      "[Bot] ❌ DISCORD_TOKEN manquant ! Renseignez-le dans `bot/.env` (voir `bot/.env.example`)."
    );
    process.exit(1);
  }

  const client = createBotClient();

  const shutdown = () => {
    console.log("[Bot] Arrêt propre en cours...");
    stopMatchScheduler();
    client.destroy();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  client.login(DISCORD_TOKEN).catch((err) => {
    console.error("[Bot] ❌ Échec de connexion à Discord :", err.message);
    process.exit(1);
  });
}
