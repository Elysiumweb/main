import {
  COMMUNITY_GUILD_ID,
  ELYSIUM_GOLD,
  GOODBYE_CHANNEL_ID,
  WELCOME_CHANNEL_ID,
} from "../config.js";
import { buildElysiumPayload } from "../lib/embeds.js";

/** Message de bienvenue automatique sur le serveur 1565264995078508554 dans le salon 1565265445752152125. */
export const handleGuildMemberAdd = async (member) => {
  try {
    if (!member?.guild || member.guild.id !== COMMUNITY_GUILD_ID) return;

    const channel =
      member.guild.channels.cache.get(WELCOME_CHANNEL_ID) ||
      (await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null));
    if (!channel || !channel.isTextBased()) return;

    const avatarUrl = member.user?.displayAvatarURL?.({ extension: "png", size: 256 }) || "";
    const memberCount = member.guild.memberCount || "";

    const payload = buildElysiumPayload({
      content: `Bienvenue <@${member.id}> !`,
      color: ELYSIUM_GOLD,
      title: "✨ Bienvenue chez Elysium !",
      description: [
        `Salut <@${member.id}>, toute l'équipe te souhaite la bienvenue sur le serveur **${member.guild.name}** !`,
        "",
        "N'hésite pas à parcourir les salons et à profiter pleinement de la communauté **Elysium**.",
      ].join("\n"),
      thumbnailUrl: avatarUrl,
      fields: memberCount
        ? [
            {
              name: "👥 Membres sur le serveur",
              value: `Tu es notre **${memberCount}e** membre !`,
              inline: true,
            },
          ]
        : [],
    });

    await channel.send(payload);
  } catch (err) {
    console.error("[Welcome] Erreur lors de l'envoi du message de bienvenue :", err);
  }
};

/** Message d'au revoir automatique sur le serveur 1565264995078508554 dans le salon 1565265516992401489. */
export const handleGuildMemberRemove = async (member) => {
  try {
    if (!member?.guild || member.guild.id !== COMMUNITY_GUILD_ID) return;

    const channel =
      member.guild.channels.cache.get(GOODBYE_CHANNEL_ID) ||
      (await member.guild.channels.fetch(GOODBYE_CHANNEL_ID).catch(() => null));
    if (!channel || !channel.isTextBased()) return;

    const displayName =
      member.displayName || member.user?.globalName || member.user?.username || "Un membre";
    const userTag = member.user?.tag || displayName;
    const avatarUrl = member.user?.displayAvatarURL?.({ extension: "png", size: 256 }) || "";

    const payload = buildElysiumPayload({
      color: 0x27272a,
      title: "👋 Au revoir !",
      description: [
        `**${displayName}** (\`${userTag}\`) vient de quitter le serveur.`,
        "",
        "Bonne continuation et peut-être à bientôt chez **Elysium** !",
      ].join("\n"),
      thumbnailUrl: avatarUrl,
    });

    await channel.send(payload);
  } catch (err) {
    console.error("[Goodbye] Erreur lors de l'envoi du message d'au revoir :", err);
  }
};
