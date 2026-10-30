import fs from "node:fs";
import { AttachmentBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import {
  BANNER_PATH,
  ELYSIUM_GOLD,
  LOGO_PATH,
} from "../config.js";

export const LOGO_ATTACHMENT_NAME = "elysium-logo.png";
export const BANNER_ATTACHMENT_NAME = "elysium-banner.jpg";

/** Crée les pièces jointes de marque (logo + bannière). */
export const createBrandAttachments = ({ includeLogo = true, includeBanner = true } = {}) => {
  const files = [];
  if (includeLogo && fs.existsSync(LOGO_PATH)) {
    files.push(new AttachmentBuilder(LOGO_PATH, { name: LOGO_ATTACHMENT_NAME }));
  }
  if (includeBanner && fs.existsSync(BANNER_PATH)) {
    files.push(new AttachmentBuilder(BANNER_PATH, { name: BANNER_ATTACHMENT_NAME }));
  }
  return files;
};

/**
 * Construit un payload Discord complet stylisé aux couleurs d'Elysium, avec
 * le logo en en-tête/pied de page et TOUJOURS la bannière Elysium tout en bas du message.
 *
 * Si `extraImages` contient des images additionnelles (ex. previews d'un design ou
 * exemples joints à un ticket), celles-ci s'affichent dans des embeds dédiés au-dessus,
 * et la bannière Elysium ferme visuellement le bas du message dans le dernier embed.
 */
export const buildElysiumPayload = ({
  title = "",
  description = "",
  fields = [],
  color = ELYSIUM_GOLD,
  thumbnailUrl = "",
  url = "",
  footerText = "Elysium Esport",
  extraImages = [],
  extraFiles = [],
  components = [],
  content = undefined,
  ephemeral = false,
} = {}) => {
  const hasLogo = fs.existsSync(LOGO_PATH);
  const hasBanner = fs.existsSync(BANNER_PATH);

  const mainEmbed = new EmbedBuilder().setColor(color);

  if (hasLogo) {
    mainEmbed.setAuthor({
      name: "ELYSIUM ESPORT",
      iconURL: `attachment://${LOGO_ATTACHMENT_NAME}`,
    });
  } else {
    mainEmbed.setAuthor({ name: "ELYSIUM ESPORT" });
  }

  if (title) mainEmbed.setTitle(String(title).slice(0, 256));
  if (description) mainEmbed.setDescription(String(description).slice(0, 4096));
  if (url) mainEmbed.setURL(url);
  if (thumbnailUrl) mainEmbed.setThumbnail(thumbnailUrl);
  if (Array.isArray(fields) && fields.length > 0) {
    mainEmbed.addFields(
      fields.slice(0, 25).map((f) => ({
        name: String(f.name || "\u200b").slice(0, 256),
        value: String(f.value || "—").slice(0, 1024),
        inline: Boolean(f.inline),
      }))
    );
  }

  const embeds = [mainEmbed];
  const files = [...createBrandAttachments({ includeLogo: hasLogo, includeBanner: hasBanner }), ...extraFiles];

  // Images intermédiaires (ex: previews de commande graphique ou exemples client)
  const validExtraImages = (Array.isArray(extraImages) ? extraImages : []).filter(Boolean).slice(0, 8);
  if (validExtraImages.length === 0) {
    if (hasBanner) {
      mainEmbed.setImage(`attachment://${BANNER_ATTACHMENT_NAME}`);
    }
    mainEmbed.setFooter(
      hasLogo
        ? { text: footerText, iconURL: `attachment://${LOGO_ATTACHMENT_NAME}` }
        : { text: footerText }
    );
    mainEmbed.setTimestamp();
  } else {
    for (const img of validExtraImages) {
      if (typeof img === "string") {
        embeds.push(new EmbedBuilder().setColor(color).setImage(img));
      } else if (img.attachment && img.name) {
        files.push(new AttachmentBuilder(img.attachment, { name: img.name }));
        embeds.push(new EmbedBuilder().setColor(color).setImage(`attachment://${img.name}`));
      } else if (img.url) {
        embeds.push(new EmbedBuilder().setColor(color).setImage(img.url));
      }
    }

    const bannerEmbed = new EmbedBuilder().setColor(color);
    if (hasBanner) {
      bannerEmbed.setImage(`attachment://${BANNER_ATTACHMENT_NAME}`);
    }
    bannerEmbed.setFooter(
      hasLogo
        ? { text: footerText, iconURL: `attachment://${LOGO_ATTACHMENT_NAME}` }
        : { text: footerText }
    );
    bannerEmbed.setTimestamp();
    embeds.push(bannerEmbed);
  }

  const payload = {
    embeds,
    files,
    components,
  };
  if (content !== undefined) payload.content = content;
  if (ephemeral) payload.flags = MessageFlags.Ephemeral;
  return payload;
};

/** Répond ou édite proprement une interaction Discord avec un message stylisé Elysium. */
export const respondElysium = async (interaction, options = {}) => {
  const { ephemeral = false, ...rest } = options;
  if (interaction.deferred || interaction.replied) {
    const payload = buildElysiumPayload({ ...rest, ephemeral: false });
    return interaction.editReply(payload);
  }
  const payload = buildElysiumPayload({ ...rest, ephemeral });
  return interaction.reply(payload);
};

/** Envoie un message follow-up stylisé Elysium sur une interaction déjà répondue. */
export const followUpElysium = async (interaction, options = {}) => {
  const payload = buildElysiumPayload(options);
  return interaction.followUp(payload);
};
