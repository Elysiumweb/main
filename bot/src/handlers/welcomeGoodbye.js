import {
  COMMUNITY_AUTO_ROLE_ID,
  COMMUNITY_GUILD_ID,
  ELYSIUM_GOLD,
  GOODBYE_CHANNEL_ID,
  WELCOME_CHANNEL_ID,
} from "../config.js";
import { buildElysiumPayload } from "../lib/embeds.js";

/** Attribution du rôle automatique (1566204651521450104) + message de bienvenue sur le serveur 1565264995078508554. */
export const handleGuildMemberAdd = async (member) => {
  try {
    const resolvedMember =
      member?.partial && typeof member.fetch === "function"
        ? await member.fetch().catch(() => member)
        : member;

    if (!resolvedMember?.guild || resolvedMember.guild.id !== COMMUNITY_GUILD_ID) return;

    // 1) Attribution automatique du rôle dès l'arrivée sur le serveur 1565264995078508554
    if (COMMUNITY_AUTO_ROLE_ID && typeof resolvedMember.roles?.add === "function") {
      try {
        await resolvedMember.roles.add(
          COMMUNITY_AUTO_ROLE_ID,
          "Attribution automatique à l'arrivée sur le serveur Elysium"
        );
      } catch (roleErr) {
        console.error(
          `[Welcome] Impossible d'attribuer le rôle ${COMMUNITY_AUTO_ROLE_ID} à ${resolvedMember.id} (vérifiez la permission "Gérer les rôles" et placez le rôle du bot au-dessus du rôle cible) :`,
          roleErr
        );
      }
    }

    // 2) Message de bienvenue dans le salon 1565265445752152125
    const channel =
      resolvedMember.guild.channels.cache.get(WELCOME_CHANNEL_ID) ||
      (await resolvedMember.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null));
    if (!channel || !channel.isTextBased()) return;

    const avatarUrl =
      resolvedMember.user?.displayAvatarURL?.({ extension: "png", size: 256 }) || "";
    const memberCount = resolvedMember.guild.memberCount || "";

    const payload = buildElysiumPayload({
      content: `Bienvenue <@${resolvedMember.id}> !`,
      color: ELYSIUM_GOLD,
      title: "✨ Bienvenue chez Elysium !",
      description: [
        `Salut <@${resolvedMember.id}>, toute l'équipe te souhaite la bienvenue sur le serveur **${resolvedMember.guild.name}** !`,
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
    console.error("[Welcome] Erreur lors du traitement d'arrivée d'un membre :", err);
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
