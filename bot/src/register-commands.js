import { fileURLToPath } from "node:url";
import { REST, Routes } from "discord.js";
import {
  COMMUNITY_GUILD_ID,
  DISCORD_CLIENT_ID,
  DISCORD_TOKEN,
  MATCH_GUILD_ID,
} from "./config.js";
import { askResultDefinition } from "./handlers/askResult.js";
import { commandAllowedDefinition } from "./handlers/commandAllowed.js";
import { linkDiscordCommandDefinition } from "./handlers/linkDiscord.js";
import { linkCommandDefinition } from "./handlers/linkPlayer.js";
import {
  cancelCommandDefinition,
  scrimCommandDefinition,
} from "./handlers/scrim.js";
import { sendMessageDefinition } from "./handlers/tickets.js";

/** Commandes déployées sur le serveur esport / matchs (1526866278462001202). */
export const getMatchGuildCommandsJson = () => [
  askResultDefinition.toJSON(),
  linkCommandDefinition.toJSON(),
  linkDiscordCommandDefinition.toJSON(),
  scrimCommandDefinition.toJSON(),
  cancelCommandDefinition.toJSON(),
  commandAllowedDefinition.toJSON(),
];

/** Commandes déployées sur le serveur communautaire / tickets (1565264995078508554). */
export const getCommunityGuildCommandsJson = () => [
  sendMessageDefinition.toJSON(),
  commandAllowedDefinition.toJSON(),
];

/**
 * Enregistre les commandes slash uniquement sur les deux serveurs autorisés
 * et vide les éventuelles commandes globales.
 */
export const syncAllGuildCommands = async ({
  token = DISCORD_TOKEN,
  clientId = DISCORD_CLIENT_ID,
} = {}) => {
  if (!token || !clientId) {
    throw new Error("DISCORD_TOKEN (et/ou DISCORD_CLIENT_ID) manquant pour enregistrer les commandes.");
  }

  const rest = new REST({ version: "10" }).setToken(token);

  // Nettoie d'éventuelles commandes globales pour garantir un fonctionnement exclusif sur les 2 serveurs
  try {
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
  } catch (err) {
    console.warn("[Commands] Nettoyage commandes globales ignoré :", err.message);
  }

  const targets = [
    {
      guildId: MATCH_GUILD_ID,
      label: "Serveur Matchs (1526866278462001202)",
      commands: getMatchGuildCommandsJson(),
    },
    {
      guildId: COMMUNITY_GUILD_ID,
      label: "Serveur Communauté / Tickets (1565264995078508554)",
      commands: getCommunityGuildCommandsJson(),
    },
  ];

  const results = [];
  for (const target of targets) {
    try {
      await rest.put(Routes.applicationGuildCommands(clientId, target.guildId), {
        body: target.commands,
      });
      console.log(
        `[Commands] ✅ ${target.commands.length} commande(s) synchronisée(s) sur ${target.label}`
      );
      results.push({ guildId: target.guildId, ok: true, count: target.commands.length });
    } catch (err) {
      console.warn(
        `[Commands] ⚠️ Impossible de synchroniser sur ${target.label} (vérifiez que le bot est invité sur ce serveur avec le scope applications.commands) : ${err.message}`
      );
      results.push({ guildId: target.guildId, ok: false, error: err.message });
    }
  }

  return results;
};

// Exécution directe : `npm run register`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  syncAllGuildCommands()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[Commands] Erreur fatale :", err);
      process.exit(1);
    });
}
