import fs from "node:fs";
import path from "node:path";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  COMMUNITY_GUILD_ID,
  DONATION_URL,
  ELYSIUM_ERROR,
  ELYSIUM_GOLD,
  ELYSIUM_INFO,
  ELYSIUM_SUCCESS,
  OWNER_USER_ID,
  TICKET_FILES_DIR,
} from "../config.js";
import { buildElysiumPayload, respondElysium } from "../lib/embeds.js";
import { downloadAttachmentBuffer, isImageAttachment } from "../lib/imageProcessor.js";
import {
  ensureAllowedCommandUser,
  isCommandAllowedUser,
  isOwnerUser,
} from "../lib/permissions.js";
import {
  ensureDirectories,
  findTicketByIdentifier,
  getDmSession,
  getTicket,
  getTicketByChannelId,
  getTicketPanel,
  listTicketPanels,
  nextCounter,
  saveTicket,
  saveTicketPanel,
  setDmSession,
} from "../lib/store.js";

const NO_EXAMPLE_WORDS_RE =
  /^(aucun|aucune|non|rien|pas\s*d['’]?exemple[s]?|pas\s*d['’]?image[s]?|no|none|skip|nan|nope|ras|-|\.+)$/i;

const slugifyChannelPart = (raw, fallback = "ticket") => {
  const clean = String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  return clean || fallback;
};

const sanitizeFileName = (name, idx = 1) => {
  const base = String(name || `file_${idx}`)
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 90);
  return base || `file_${idx}`;
};

const extractUrls = (text = "") => {
  const matches = String(text || "").match(/https?:\/\/[^\s<>()]+/gi);
  return matches ? [...new Set(matches)] : [];
};

const stripUrls = (text = "") =>
  String(text || "")
    .replace(/https?:\/\/[^\s<>()]+/gi, "")
    .trim();

/** Génère un identifiant de ticket court, unique et facile à copier-coller en MP (ex: TKT-0001). */
const allocateUniqueTicketId = () => {
  let num = nextCounter("ticket");
  let id = `TKT-${String(num).padStart(4, "0")}`;
  while (getTicket(id)) {
    num = nextCounter("ticket");
    id = `TKT-${String(num).padStart(4, "0")}`;
  }
  return { id, globalNumber: num };
};

/** Construit un slug de panneau garanti unique pour ne jamais mélanger les tickets de 2 messages différents. */
const allocateUniquePanelSlug = (preferredRaw) => {
  const base = slugifyChannelPart(preferredRaw, "demande");
  const existingSlugs = new Set(listTicketPanels().map((p) => p.slug));
  if (!existingSlugs.has(base)) return base;
  let n = 2;
  while (existingSlugs.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
};

/**
 * Construit un payload Elysium pour un ticket en garantissant que CHAQUE message
 * envoyé par le bot pour ce ticket affiche clairement son identifiant (`ticket.id`).
 */
export const buildTicketPayload = (ticket, options = {}) => {
  const ticketId = String(ticket?.id || "").trim();
  const baseDesc = String(options.description || "").trim();
  const fieldsText = (options.fields || [])
    .map((f) => `${f.name || ""} ${f.value || ""}`)
    .join(" ");
  const titleText = String(options.title || "");

  const alreadyDisplaysId =
    !ticketId ||
    baseDesc.includes(ticketId) ||
    fieldsText.includes(ticketId) ||
    titleText.includes(ticketId);

  const idBannerLine = ticketId ? `🆔 **ID du ticket :** \`${ticketId}\`` : "";
  const description = alreadyDisplaysId
    ? baseDesc
    : [idBannerLine, baseDesc].filter(Boolean).join("\n\n");

  const footerText = ticketId
    ? `Elysium Esport • ID Ticket : ${ticketId}`
    : options.footerText || "Elysium Esport";

  return buildElysiumPayload({
    ...options,
    description,
    footerText,
  });
};

const respondTicketElysium = async (interaction, ticket, options = {}) => {
  const { ephemeral = false, ...rest } = options;
  if (interaction.deferred || interaction.replied) {
    const payload = buildTicketPayload(ticket, { ...rest, ephemeral: false });
    return interaction.editReply({ ...payload, attachments: [] });
  }
  const payload = buildTicketPayload(ticket, { ...rest, ephemeral });
  return interaction.reply(payload);
};

/** Télécharge et stocke localement toutes les pièces jointes d'un message Discord. */
const saveMessageAttachmentsToDir = async (message, targetDir, targetList = []) => {
  const attachments = [...(message.attachments?.values?.() || [])];
  if (attachments.length === 0) return 0;

  ensureDirectories();
  fs.mkdirSync(targetDir, { recursive: true });

  let savedCount = 0;
  for (const att of attachments) {
    const idx = targetList.length + 1;
    const safeName = sanitizeFileName(att.name, idx);
    const localPath = path.join(targetDir, `${Date.now()}_${idx}_${safeName}`);
    const sourceUrl = att.url || att.proxyURL;
    const buffer = await downloadAttachmentBuffer(sourceUrl);
    fs.writeFileSync(localPath, buffer);

    targetList.push({
      fileName: att.name || safeName,
      localPath,
      url: sourceUrl,
      contentType: att.contentType || "",
      size: att.size || buffer.byteLength,
      isImage: isImageAttachment(att),
      sourceChannelId: message.channelId || message.channel?.id || "",
      sourceMessageId: message.id || "",
      attachmentId: att.id || "",
    });
    savedCount += 1;
  }

  return savedCount;
};

/** Recharge un fichier stocké localement ou retélécharge depuis le message Discord d'origine en secours. */
const resolveStoredFileAttachment = async (client, fileMeta, index = 0) => {
  const safeName = sanitizeFileName(fileMeta.fileName, index + 1);
  if (fileMeta.localPath && fs.existsSync(fileMeta.localPath)) {
    return {
      attachment: fileMeta.localPath,
      name: safeName,
      isImage: Boolean(fileMeta.isImage),
    };
  }
  if (client?.channels && fileMeta.sourceChannelId && fileMeta.sourceMessageId) {
    const ch = await client.channels.fetch(fileMeta.sourceChannelId).catch(() => null);
    const msg = ch?.messages
      ? await ch.messages.fetch(fileMeta.sourceMessageId).catch(() => null)
      : null;
    const att =
      msg?.attachments?.get?.(fileMeta.attachmentId) ||
      [...(msg?.attachments?.values?.() || [])].find((a) => a.name === fileMeta.fileName);
    if (att?.url) {
      const buf = await downloadAttachmentBuffer(att.url);
      if (fileMeta.localPath) {
        fs.mkdirSync(path.dirname(fileMeta.localPath), { recursive: true });
        fs.writeFileSync(fileMeta.localPath, buf);
      }
      return {
        attachment: buf,
        name: safeName,
        isImage: Boolean(fileMeta.isImage),
      };
    }
  }
  if (fileMeta.url) {
    const buf = await downloadAttachmentBuffer(fileMeta.url);
    return {
      attachment: buf,
      name: safeName,
      isImage: Boolean(fileMeta.isImage),
    };
  }
  return null;
};

const sendDmResponse = async (message, payload) => {
  if (message.channel && typeof message.channel.send === "function") {
    return message.channel.send(payload);
  }
  if (typeof message.reply === "function") {
    return message.reply(payload);
  }
  if (message.author && typeof message.author.send === "function") {
    return message.author.send(payload);
  }
  const owner = await message.client?.users?.fetch?.(OWNER_USER_ID).catch(() => null);
  if (owner && typeof owner.send === "function") {
    return owner.send(payload);
  }
  return null;
};

// ============================================================================
// Commande /send-message
// ============================================================================

export const sendMessageDefinition = new SlashCommandBuilder()
  .setName("send-message")
  .setDescription("Envoie un message embed avec bouton de création de ticket dans un salon")
  .addChannelOption((opt) =>
    opt
      .setName("salon")
      .setDescription("Salon spécifique dans lequel envoyer le message embed")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("texte")
      .setDescription("Texte du message embed (laissez vide pour ouvrir un éditeur multi-lignes)")
      .setRequired(false)
      .setMaxLength(2000)
  )
  .addStringOption((opt) =>
    opt
      .setName("bouton")
      .setDescription("Texte affiché sur le bouton de création de ticket")
      .setRequired(false)
      .setMaxLength(80)
  )
  .addStringOption((opt) =>
    opt
      .setName("identifiant_ticket")
      .setDescription("Nom court identifiant les salons tickets issus de ce message (ex: logo, banniere)")
      .setRequired(false)
      .setMaxLength(30)
  )
  .addStringOption((opt) =>
    opt
      .setName("titre")
      .setDescription("Titre optionnel de l'embed")
      .setRequired(false)
      .setMaxLength(150)
  )
  .addChannelOption((opt) =>
    opt
      .setName("categorie")
      .setDescription("Catégorie où créer les tickets de ce message (par défaut : catégorie du salon)")
      .addChannelTypes(ChannelType.GuildCategory)
      .setRequired(false)
  );

const publishTicketPanel = async ({
  interaction,
  targetChannel,
  categoryId = "",
  title = "",
  messageText,
  buttonText,
  ticketPrefix = "",
}) => {
  const panelNum = nextCounter("panel");
  const panelId = `panel_${panelNum}_${Date.now()}`;
  const slug = allocateUniquePanelSlug(
    ticketPrefix || title || buttonText || targetChannel.name || `msg-${panelNum}`
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_open:${panelId}`)
      .setLabel(buttonText.slice(0, 80))
      .setEmoji("🎫")
      .setStyle(ButtonStyle.Primary)
  );

  const payload = buildElysiumPayload({
    color: ELYSIUM_GOLD,
    title: title || "",
    description: messageText,
    components: [row],
  });

  const sentMessage = await targetChannel.send(payload);

  const panel = {
    id: panelId,
    guildId: interaction.guildId,
    channelId: targetChannel.id,
    categoryId: categoryId || targetChannel.parentId || "",
    messageId: sentMessage.id,
    slug,
    title: title || buttonText,
    messageText,
    buttonText,
    ticketCount: 0,
    createdBy: interaction.user.id,
    createdAt: Date.now(),
  };

  saveTicketPanel(panel);

  await respondElysium(interaction, {
    ephemeral: true,
    color: ELYSIUM_SUCCESS,
    title: "✅ Message de ticket envoyé !",
    description: [
      `Le message embed a été publié dans <#${targetChannel.id}>.`,
      "",
      `🏷️ **Identifiant unique des tickets de ce message :** \`ticket-${slug}-...\``,
      "Tous les salons créés depuis ce bouton porteront automatiquement ce préfixe pour ne jamais les mélanger avec ceux des autres messages.",
    ].join("\n"),
  });
};

export const handleSendMessageCommand = async (interaction) => {
  if (interaction.guildId !== COMMUNITY_GUILD_ID) {
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "⛔ Serveur non autorisé",
      description: "La commande `/send-message` n'est utilisable que sur ce serveur.",
    });
    return;
  }
  if (!(await ensureAllowedCommandUser(interaction))) return;

  const targetChannel = interaction.options.getChannel("salon", true);
  const category = interaction.options.getChannel("categorie");
  const directText = interaction.options.getString("texte")?.trim() || "";
  const directButton = interaction.options.getString("bouton")?.trim() || "";
  const directPrefix = interaction.options.getString("identifiant_ticket")?.trim() || "";
  const directTitle = interaction.options.getString("titre")?.trim() || "";

  // Si texte + bouton sont déjà fournis en options directes, on publie tout de suite
  if (directText && directButton) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await publishTicketPanel({
        interaction,
        targetChannel,
        categoryId: category?.id || "",
        title: directTitle,
        messageText: directText,
        buttonText: directButton,
        ticketPrefix: directPrefix,
      });
    } catch (err) {
      console.error("[/send-message direct]", err);
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "❌ Échec de l'envoi",
        description: err.message || "Vérifiez que le bot a la permission d'écrire dans ce salon.",
      });
    }
    return;
  }

  // Sinon, on ouvre une fenêtre modale pratique permettant du texte multi-lignes
  const modal = new ModalBuilder()
    .setCustomId(`send_msg_modal:${targetChannel.id}:${category?.id || ""}`)
    .setTitle("Configurer le message de ticket");

  const titleInput = new TextInputBuilder()
    .setCustomId("embed_title")
    .setLabel("Titre du message (facultatif)")
    .setPlaceholder("Ex : Commandes Graphiques — Bannières")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(150);
  if (directTitle) titleInput.setValue(directTitle);

  const textInput = new TextInputBuilder()
    .setCustomId("embed_text")
    .setLabel("Texte du message")
    .setPlaceholder("Écrivez le contenu du message embed affiché aux membres...")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(3500);
  if (directText) textInput.setValue(directText);

  const btnInput = new TextInputBuilder()
    .setCustomId("button_label")
    .setLabel("Texte du bouton")
    .setPlaceholder("Ex : Commander une bannière")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(80);
  if (directButton) btnInput.setValue(directButton);

  const prefixInput = new TextInputBuilder()
    .setCustomId("ticket_prefix")
    .setLabel("Identifiant du salon ticket (facultatif)")
    .setPlaceholder("Ex : banniere (donnera #ticket-banniere-001-...)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(28);
  if (directPrefix) prefixInput.setValue(directPrefix);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(textInput),
    new ActionRowBuilder().addComponents(btnInput),
    new ActionRowBuilder().addComponents(prefixInput)
  );

  await interaction.showModal(modal);
};

// ============================================================================
// Messages d'étapes dans le salon ticket & envoi MP à 520496557146243072
// ============================================================================

const buildTicketWelcomePayload = (ticket) =>
  buildTicketPayload(ticket, {
    content: `<@${ticket.userId}>`,
    color: ELYSIUM_GOLD,
    title: `🎫 Ticket ouvert — ${ticket.panelTitle || ticket.panelSlug}`,
    description: [
      `🆔 **ID du ticket :** \`${ticket.id}\``,
      "",
      `Bienvenue <@${ticket.userId}> dans votre salon dédié (**#${ticket.channelName}**) !`,
      "Nous allons recueillir les informations de votre commande en **2 étapes rapides** juste en dessous afin de transmettre votre brief complet.",
    ].join("\n"),
  });

const buildStep1DescriptionPromptPayload = (ticket) =>
  buildTicketPayload(ticket, {
    color: ELYSIUM_GOLD,
    title: `1️⃣ Étape 1/2 — Description détaillée (${ticket.id})`,
    description: [
      `🆔 **ID du ticket :** \`${ticket.id}\``,
      "",
      "📝 **Décrivez-nous de manière très détaillée ce que vous désirez** *(style, couleurs, textes à afficher, ambiance, dimensions, usage...)*.",
      "",
      "⚠️ **Important : votre réponse doit être fournie en un seul message** directement dans ce salon.",
      "*(Les images ou liens d'exemple vous seront demandés juste après, à l'étape 2 !)*",
    ].join("\n"),
  });

const buildStep2ExamplesPromptPayload = (ticket) => {
  const skipRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_skip_examples:${ticket.id}`)
      .setLabel("Passer (aucun exemple)")
      .setEmoji("⏭️")
      .setStyle(ButtonStyle.Secondary)
  );

  return buildTicketPayload(ticket, {
    color: ELYSIUM_GOLD,
    title: `2️⃣ Étape 2/2 — Images ou liens d'exemple (${ticket.id})`,
    description: [
      `🆔 **ID du ticket :** \`${ticket.id}\``,
      "",
      "✅ **Votre description détaillée a bien été enregistrée !**",
      "",
      "🎨 **Avez-vous des images ou un lien d'exemple du design que vous désirez ?**",
      "• **Si oui :** envoyez vos **images (pièces jointes)** et/ou **liens d'exemple** **en un seul message** directement dans ce salon *(vous pouvez glisser plusieurs images dans ce même message)*.",
      "• **Si vous n'avez aucun exemple :** écrivez simplement **`aucun`** dans un message (ou cliquez sur **⏭️ Passer** ci-dessous).",
    ].join("\n"),
    components: [skipRow],
  });
};

const buildModStep1PromptPayload = (ticket) =>
  buildTicketPayload(ticket, {
    color: ELYSIUM_GOLD,
    title: `✏️ Modification — Étape 1/2 : Description (${ticket.id})`,
    description: [
      `🆔 **ID du ticket :** \`${ticket.id}\``,
      "",
      "📝 **Quelles modifications souhaitez-vous apporter au design ?**",
      "",
      "⚠️ **Important : votre réponse doit être fournie en un seul message** directement dans ce salon.",
      "*(Les éventuelles images ou liens pour illustrer vos modifications vous seront demandés juste après, à l'étape 2 !)*",
    ].join("\n"),
  });

const buildModStep2ExamplesPromptPayload = (ticket) => {
  const skipRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_skip_mod_examples:${ticket.id}`)
      .setLabel("Passer (aucune image)")
      .setEmoji("⏭️")
      .setStyle(ButtonStyle.Secondary)
  );

  return buildTicketPayload(ticket, {
    color: ELYSIUM_GOLD,
    title: `🖼️ Modification — Étape 2/2 : Images ou liens (${ticket.id})`,
    description: [
      `🆔 **ID du ticket :** \`${ticket.id}\``,
      "",
      "✅ **Votre description des modifications a bien été enregistrée !**",
      "",
      "🖼️ **Souhaitez-vous joindre des images ou liens pour illustrer les modifications demandées ?**",
      "• **Si oui :** envoyez vos **images (pièces jointes)** et/ou **liens** **en un seul message** dans ce salon.",
      "• **Si non :** écrivez simplement **`aucun`** (ou cliquez sur **⏭️ Passer** ci-dessous).",
    ].join("\n"),
    components: [skipRow],
  });
};

/** Envoie le brief initial ou la demande de modification en MP à l'utilisateur 520496557146243072. */
const sendRequestToOwnerDm = async (client, ticket, { isModification = false } = {}) => {
  const owner = await client.users.fetch(OWNER_USER_ID);
  if (!owner) {
    throw new Error(`Impossible de contacter l'utilisateur ${OWNER_USER_ID} en message privé.`);
  }

  const filesToForward = isModification
    ? ticket.pendingModFiles || []
    : ticket.exampleFiles || [];
  const links = isModification
    ? ticket.pendingModLinks || []
    : ticket.exampleLinks || [];
  const note = isModification ? ticket.pendingModNote : ticket.exampleNote;
  const mainText = isModification ? ticket.pendingModText : ticket.description;

  const extraImages = [];
  const extraFiles = [];
  const overflowFiles = [];

  for (let i = 0; i < filesToForward.length; i += 1) {
    const resolved = await resolveStoredFileAttachment(client, filesToForward[i], i);
    if (!resolved) continue;
    const attachName = `ref_${i + 1}_${resolved.name}`;
    // Discord limite chaque message à 10 pièces jointes (logo + bannière = 2 -> max 8 par message)
    if (extraImages.length + extraFiles.length < 8) {
      if (resolved.isImage) {
        extraImages.push({ attachment: resolved.attachment, name: attachName });
      } else {
        extraFiles.push(new AttachmentBuilder(resolved.attachment, { name: attachName }));
      }
    } else {
      overflowFiles.push(new AttachmentBuilder(resolved.attachment, { name: attachName }));
    }
  }

  const channelLink = `https://discord.com/channels/${ticket.guildId}/${ticket.channelId}`;

  const fields = [
    {
      name: "🆔 ID du ticket",
      value: `\`${ticket.id}\``,
      inline: true,
    },
    {
      name: "👤 Client",
      value: `<@${ticket.userId}> (\`${ticket.userTag || ticket.userId}\`)`,
      inline: true,
    },
    {
      name: "🏷️ Origine du ticket",
      value: `${ticket.panelTitle || ticket.panelSlug}\n[Ouvrir #${ticket.channelName}](${channelLink})`,
      inline: true,
    },
    {
      name: isModification
        ? "✏️ Modifications souhaitées par le client"
        : "📋 Description très détaillée de la demande",
      value: String(mainText || "—").slice(0, 1024),
      inline: false,
    },
  ];

  if (mainText && mainText.length > 1024) {
    fields.push({
      name: "📋 Suite de la description",
      value: String(mainText).slice(1024, 2048),
      inline: false,
    });
  }

  if (links.length > 0 || filesToForward.length > 0 || note) {
    fields.push({
      name: isModification ? "🖼️ Références jointes" : "🎨 Exemple(s) de design fourni(s)",
      value: [
        ...(note ? [`💬 ${note}`] : []),
        ...links.map((l) => `🔗 ${l}`),
        ...filesToForward.map((f) => `📎 \`${f.fileName}\``),
      ]
        .join("\n")
        .slice(0, 1024),
      inline: false,
    });
  } else {
    fields.push({
      name: isModification ? "🖼️ Références jointes" : "🎨 Exemple(s) de design fourni(s)",
      value: "*Aucun exemple joint par le client.*",
      inline: false,
    });
  }

  fields.push({
    name: "📨 Répondre à ce ticket en MP",
    value: `Envoyez simplement l'identifiant **\`${ticket.id}\`** ici en message privé : le bot vous demandera alors le fichier **Preview**, puis les **fichiers finaux**, et enverra automatiquement le preview dans le ticket !`,
    inline: false,
  });

  const dmPayload = buildTicketPayload(ticket, {
    color: ELYSIUM_GOLD,
    title: isModification
      ? `🔄 Modification demandée — ${ticket.id} (#${ticket.channelName})`
      : `🆕 Nouvelle demande de ticket — ${ticket.id} (#${ticket.channelName})`,
    description: isModification
      ? `🆔 **ID du ticket :** \`${ticket.id}\`\nLe client <@${ticket.userId}> a demandé des modifications sur le preview du ticket **#${ticket.channelName}**.`
      : `🆔 **ID du ticket :** \`${ticket.id}\`\nUne nouvelle demande vient d'être soumise dans le ticket **#${ticket.channelName}**.`,
    fields,
    extraImages,
    extraFiles,
  });

  await owner.send(dmPayload);

  for (let offset = 0; offset < overflowFiles.length; offset += 8) {
    await owner.send(
      buildTicketPayload(ticket, {
        color: ELYSIUM_GOLD,
        title: `📎 Pièces jointes supplémentaires — ${ticket.id}`,
        description: `🆔 **ID du ticket :** \`${ticket.id}\`\nSuite des fichiers joints par <@${ticket.userId}> :`,
        extraFiles: overflowFiles.slice(offset, offset + 8),
      })
    );
  }
};

/** Finalise l'envoi du brief initial à 520496557146243072 et informe le client dans le salon ticket. */
const finalizeInitialBriefSubmission = async (client, ticketChannel, ticket) => {
  await sendRequestToOwnerDm(client, ticket, { isModification: false });

  ticket.status = "pending_designer";
  saveTicket(ticket);

  const examplesSummary =
    (ticket.exampleFiles?.length || 0) + (ticket.exampleLinks?.length || 0) > 0
      ? [
          ...(ticket.exampleLinks || []).map((u) => `🔗 ${u}`),
          ...(ticket.exampleFiles || []).map((f) => `📎 \`${f.fileName}\``),
        ]
          .join("\n")
          .slice(0, 1024)
      : "*Aucun exemple joint*";

  await ticketChannel.send(
    buildTicketPayload(ticket, {
      color: ELYSIUM_INFO,
      title: `⏳ Demande prise en charge (${ticket.id})`,
      description: [
        `🆔 **ID du ticket :** \`${ticket.id}\``,
        "",
        `Merci <@${ticket.userId}> ! Toutes vos informations ont bien été transmises.`,
        "**Votre demande est prise en charge, merci de patienter.** Nous reviendrons vers vous directement dans ce salon dès que votre aperçu (*preview*) sera prêt !",
      ].join("\n"),
      fields: [
        {
          name: "📋 Récapitulatif de votre description",
          value: String(ticket.description || "—").slice(0, 1024),
          inline: false,
        },
        {
          name: "🎨 Exemple(s) transmis",
          value: examplesSummary,
          inline: false,
        },
      ],
    })
  );
};

/** Finalise l'envoi d'une demande de modification à 520496557146243072 et informe le client dans le salon ticket. */
const finalizeModificationSubmission = async (client, ticketChannel, ticket) => {
  await sendRequestToOwnerDm(client, ticket, { isModification: true });

  ticket.round = (ticket.round || 1) + 1;
  ticket.currentPreviewFiles = [];
  ticket.currentFinalFiles = [];
  ticket.pendingModText = "";
  ticket.pendingModFiles = [];
  ticket.pendingModLinks = [];
  ticket.pendingModNote = "";
  ticket.status = "pending_designer";
  saveTicket(ticket);

  await ticketChannel.send(
    buildTicketPayload(ticket, {
      color: ELYSIUM_INFO,
      title: `⏳ Demande de modification envoyée (${ticket.id})`,
      description: [
        `🆔 **ID du ticket :** \`${ticket.id}\``,
        "",
        "Vos modifications ont bien été transmises ! **Merci de patienter** pendant la mise à jour de votre design, un nouveau preview vous sera envoyé ici dès qu'il sera prêt.",
      ].join("\n"),
    })
  );
};

/** Envoie automatiquement le(s) fichier(s) Preview dans le salon du ticket une fois les fichiers finaux reçus en MP. */
const deliverPreviewToTicketChannel = async (client, ticket) => {
  const ticketChannel = await client.channels.fetch(ticket.channelId).catch(() => null);
  if (!ticketChannel || !ticketChannel.isTextBased()) {
    throw new Error(`Le salon du ticket (#${ticket.channelName}) est introuvable.`);
  }

  const previews = ticket.currentPreviewFiles || [];
  const previewImages = [];
  const extraPreviewFiles = [];
  const overflowPreviewFiles = [];

  for (let i = 0; i < previews.length; i += 1) {
    const resolved = await resolveStoredFileAttachment(client, previews[i], i);
    if (!resolved) continue;
    const attachName = `preview_${i + 1}_${resolved.name}`;
    if (previewImages.length + extraPreviewFiles.length < 8) {
      if (resolved.isImage) {
        previewImages.push({ attachment: resolved.attachment, name: attachName });
      } else {
        extraPreviewFiles.push(new AttachmentBuilder(resolved.attachment, { name: attachName }));
      }
    } else {
      overflowPreviewFiles.push(new AttachmentBuilder(resolved.attachment, { name: attachName }));
    }
  }

  for (let offset = 0; offset < overflowPreviewFiles.length; offset += 8) {
    await ticketChannel.send(
      buildTicketPayload(ticket, {
        color: ELYSIUM_GOLD,
        title: `🎨 Fichiers Preview complémentaires (${ticket.id})`,
        description: `🆔 **ID du ticket :** \`${ticket.id}\`\nFichiers d'aperçu supplémentaires :`,
        extraFiles: overflowPreviewFiles.slice(offset, offset + 8),
      })
    );
  }

  const clientActionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_client_accept:${ticket.id}`)
      .setLabel("Accepter")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ticket_client_modify:${ticket.id}`)
      .setLabel("Demander une modification")
      .setEmoji("✏️")
      .setStyle(ButtonStyle.Primary)
  );

  await ticketChannel.send(
    buildTicketPayload(ticket, {
      content: `<@${ticket.userId}>`,
      color: ELYSIUM_GOLD,
      title: `🎨 Aperçu (Preview) de votre commande (${ticket.id})`,
      description: [
        `🆔 **ID du ticket :** \`${ticket.id}\``,
        "",
        `Bonjour <@${ticket.userId}>, voici le **preview** réalisé pour votre demande !`,
        "",
        "• Si le résultat vous convient, cliquez sur **✅ Accepter** pour recevoir immédiatement l'ensemble de vos fichiers finaux.",
        "• Si vous souhaitez ajuster certains éléments, cliquez sur **✏️ Demander une modification**.",
      ].join("\n"),
      extraImages: previewImages,
      extraFiles: extraPreviewFiles,
      components: [clientActionRow],
    })
  );

  ticket.status = "awaiting_client_review";
  saveTicket(ticket);
};

// ============================================================================
// Collecte des messages & fichiers dans les tickets et en MP
// ============================================================================

const handleOwnerDmFlow = async (message) => {
  if (!isOwnerUser(message.author?.id)) return false;

  const content = String(message.content || "").trim();
  const hasAttachments = Boolean(message.attachments && message.attachments.size > 0);
  const session = getDmSession(OWNER_USER_ID);

  // 1) Commande d'annulation de la saisie MP en cours
  if (!hasAttachments && /^(annuler|cancel|stop)$/i.test(content)) {
    if (session?.ticketId) {
      const prevTicket = getTicket(session.ticketId);
      setDmSession(OWNER_USER_ID, null);
      await sendDmResponse(
        message,
        prevTicket
          ? buildTicketPayload(prevTicket, {
              color: ELYSIUM_INFO,
              title: `🛑 Import MP annulé (${prevTicket.id})`,
              description: `La saisie en cours pour le ticket **\`${prevTicket.id}\`** a été annulée.\nEnvoyez à nouveau l'ID d'un ticket dès que vous souhaitez envoyer un preview et des fichiers finaux.`,
            })
          : buildElysiumPayload({
              color: ELYSIUM_INFO,
              title: "🛑 Import MP annulé",
              description: "La session d'envoi en cours a été annulée.",
            })
      );
      return true;
    }
    return false;
  }

  // 2) Si l'utilisateur envoie l'ID d'un ticket en MP (sans pièces jointes) -> démarre la collecte Preview puis Final
  if (!hasAttachments && content) {
    const matchedTicket = findTicketByIdentifier(content);
    if (matchedTicket) {
      matchedTicket.currentPreviewFiles = [];
      matchedTicket.currentFinalFiles = [];
      saveTicket(matchedTicket);

      setDmSession(OWNER_USER_ID, {
        ticketId: matchedTicket.id,
        step: "awaiting_preview",
        startedAt: Date.now(),
      });

      try {
        await message.react("✅");
      } catch {
        // ignore
      }

      await sendDmResponse(
        message,
        buildTicketPayload(matchedTicket, {
          color: ELYSIUM_GOLD,
          title: `🖼️ Étape 1/2 — Envoyez le fichier Preview (${matchedTicket.id})`,
          description: [
            `🆔 **ID du ticket :** \`${matchedTicket.id}\``,
            `👤 **Client :** <@${matchedTicket.userId}> (\`${matchedTicket.userTag || matchedTicket.userId}\`)`,
            `📍 **Salon :** <#${matchedTicket.channelId}> (**#${matchedTicket.channelName}**)`,
            "",
            "👉 **Envoyez maintenant le fichier (ou les images) de Preview** directement ici en message privé *(en un seul message)*.",
            "*(Écrivez `annuler` à tout moment pour interrompre.)*",
          ].join("\n"),
        })
      );
      return true;
    }

    // Si aucune session n'est active ou si le texte ressemble à un ID de ticket introuvable
    if (!session || /tkt/i.test(content) || /^\d+$/.test(content)) {
      await sendDmResponse(
        message,
        buildElysiumPayload({
          color: ELYSIUM_ERROR,
          title: "❌ Ticket introuvable",
          description: [
            `Aucun ticket ne correspond à \`${content.slice(0, 60)}\`.`,
            "",
            "Envoyez **l'ID exact du ticket** affiché dans le message du bot (ex : **`TKT-0001`**).",
          ].join("\n"),
        })
      );
      return true;
    }
  }

  // 3) Aucune session active alors que des fichiers sont envoyés sans avoir indiqué l'ID du ticket
  if (!session || !session.ticketId) {
    if (hasAttachments) {
      await sendDmResponse(
        message,
        buildElysiumPayload({
          color: ELYSIUM_INFO,
          title: "ℹ️ Envoyez d'abord l'ID du ticket",
          description:
            "Avant d'importer vos fichiers, envoyez en message privé **l'ID du ticket** concerné (ex : **`TKT-0001`**). Le bot vous demandera ensuite le fichier **Preview**, puis les **fichiers finaux**.",
        })
      );
      return true;
    }
    return false;
  }

  const activeTicket = getTicket(session.ticketId);
  if (!activeTicket) {
    setDmSession(OWNER_USER_ID, null);
    await sendDmResponse(
      message,
      buildElysiumPayload({
        color: ELYSIUM_ERROR,
        title: "❌ Ticket introuvable",
        description:
          "Le ticket associé à cette session n'existe plus. Envoyez l'ID d'un ticket actif (ex : `TKT-0001`).",
      })
    );
    return true;
  }

  const round = activeTicket.round || 1;

  // 4) Étape 1/2 en MP : réception du fichier Preview -> passe automatiquement à la demande des fichiers finaux
  if (session.step === "awaiting_preview") {
    if (!hasAttachments) {
      await sendDmResponse(
        message,
        buildTicketPayload(activeTicket, {
          color: ELYSIUM_INFO,
          title: `🖼️ Fichier Preview attendu (${activeTicket.id})`,
          description: [
            `🆔 **ID du ticket :** \`${activeTicket.id}\``,
            "",
            "⚠️ Aucun fichier joint détecté. Veuillez glisser-déposer **votre fichier Preview** dans votre message privé *(ou écrivez `annuler`)*.",
          ].join("\n"),
        })
      );
      return true;
    }

    const previewDir = path.join(
      TICKET_FILES_DIR,
      activeTicket.id,
      `round_${round}`,
      "preview"
    );
    activeTicket.currentPreviewFiles = activeTicket.currentPreviewFiles || [];
    const savedCount = await saveMessageAttachmentsToDir(
      message,
      previewDir,
      activeTicket.currentPreviewFiles
    );
    saveTicket(activeTicket);

    setDmSession(OWNER_USER_ID, {
      ticketId: activeTicket.id,
      step: "awaiting_final",
      updatedAt: Date.now(),
    });

    try {
      await message.react("✅");
    } catch {
      // ignore
    }

    const previewNames = activeTicket.currentPreviewFiles
      .map((f) => `\`${f.fileName}\``)
      .join(", ");

    await sendDmResponse(
      message,
      buildTicketPayload(activeTicket, {
        color: ELYSIUM_GOLD,
        title: `📦 Étape 2/2 — Envoyez les fichiers finaux (${activeTicket.id})`,
        description: [
          `🆔 **ID du ticket :** \`${activeTicket.id}\``,
          `✅ **Preview reçu (${savedCount}) :** ${previewNames}`,
          "",
          "👉 **Envoyez maintenant les fichiers finaux** directement ici en message privé *(vous pouvez joindre tous vos fichiers finaux dans ce message)*.",
          "⚡ **Dès réception des fichiers finaux, l'envoi dans le ticket se fera automatiquement !**",
        ].join("\n"),
      })
    );
    return true;
  }

  // 5) Étape 2/2 en MP : réception des fichiers finaux -> envoi automatique du Preview dans le ticket !
  if (session.step === "awaiting_final") {
    if (!hasAttachments) {
      await sendDmResponse(
        message,
        buildTicketPayload(activeTicket, {
          color: ELYSIUM_INFO,
          title: `📦 Fichiers finaux attendus (${activeTicket.id})`,
          description: [
            `🆔 **ID du ticket :** \`${activeTicket.id}\``,
            "",
            "⚠️ Aucun fichier joint détecté. Veuillez glisser-déposer **les fichiers finaux** dans votre message privé *(ou écrivez `annuler`)*.",
          ].join("\n"),
        })
      );
      return true;
    }

    const finalDir = path.join(
      TICKET_FILES_DIR,
      activeTicket.id,
      `round_${round}`,
      "final"
    );
    activeTicket.currentFinalFiles = activeTicket.currentFinalFiles || [];
    await saveMessageAttachmentsToDir(
      message,
      finalDir,
      activeTicket.currentFinalFiles
    );
    saveTicket(activeTicket);

    try {
      await message.react("✅");
    } catch {
      // ignore
    }

    const client = message.client;
    if (!client) {
      throw new Error("Client Discord indisponible lors de l'envoi automatique au ticket.");
    }

    await deliverPreviewToTicketChannel(client, activeTicket);
    setDmSession(OWNER_USER_ID, null);

    await sendDmResponse(
      message,
      buildTicketPayload(activeTicket, {
        color: ELYSIUM_SUCCESS,
        title: `✅ Envoyé automatiquement dans le ticket ! (${activeTicket.id})`,
        description: [
          `🆔 **ID du ticket :** \`${activeTicket.id}\``,
          "",
          `🖼️ **Preview envoyé automatiquement :** **${activeTicket.currentPreviewFiles.length}** fichier(s) transmis à <@${activeTicket.userId}> dans <#${activeTicket.channelId}>.`,
          `📦 **Fichiers finaux enregistrés :** **${activeTicket.currentFinalFiles.length}** fichier(s) prêts — ils seront livrés automatiquement au client dès qu'il cliquera sur **Accepter** !`,
        ].join("\n"),
      })
    );
    return true;
  }

  return false;
};

export const handleTicketAndDmMessage = async (message) => {
  if (message.author?.bot) return false;

  const inGuild =
    typeof message.inGuild === "function"
      ? message.inGuild()
      : Boolean(message.guildId || message.guild);

  // 1) Message privé envoyé par l'administrateur 520496557146243072
  if (!inGuild) {
    return handleOwnerDmFlow(message);
  }

  // 2) Message envoyé dans un salon ticket sur le serveur communautaire 1565264995078508554
  const guildId = message.guildId || message.guild?.id;
  if (guildId !== COMMUNITY_GUILD_ID) return false;

  const channelId = message.channelId || message.channel?.id;
  const ticket = getTicketByChannelId(channelId);
  if (!ticket) return false;

  // Seul l'auteur du ticket déclenche l'avancement des réponses client en 1 message
  if (message.author.id !== ticket.userId) return false;

  const client = message.client || message.guild?.client || message.channel?.client;
  const rawContent = String(message.content || "").trim();

  // Compatibilité ascendante avec les éventuels anciens tickets déjà ouverts
  const effectiveStatus =
    ticket.status === "awaiting_initial_info"
      ? ticket.description
        ? "awaiting_examples"
        : "awaiting_description"
      : ticket.status;

  // --- Étape initiale 1/2 : Description détaillée en un seul message ---
  if (effectiveStatus === "awaiting_description") {
    // Si l'utilisateur joint déjà un fichier par avance, on le conserve sans le perdre
    if (message.attachments && message.attachments.size > 0) {
      const exDir = path.join(TICKET_FILES_DIR, ticket.id, "examples");
      ticket.exampleFiles = ticket.exampleFiles || [];
      await saveMessageAttachmentsToDir(message, exDir, ticket.exampleFiles);
    }

    if (!rawContent) {
      saveTicket(ticket);
      await message.channel.send(
        buildTicketPayload(ticket, {
          color: ELYSIUM_ERROR,
          title: `⚠️ Description écrite requise (${ticket.id})`,
          description: [
            `🆔 **ID du ticket :** \`${ticket.id}\``,
            "",
            "Veuillez d'abord rédiger **votre description détaillée** sous forme de texte **en un seul message** dans ce salon.",
            "*(Les images ou liens d'exemple vous seront demandés juste après !)*",
          ].join("\n"),
        })
      );
      return true;
    }

    ticket.description = rawContent;
    ticket.status = "awaiting_examples";
    saveTicket(ticket);

    try {
      await message.react("✅");
    } catch {
      // ignore
    }

    const step2Msg = await message.channel.send(buildStep2ExamplesPromptPayload(ticket));
    ticket.step2MessageId = step2Msg?.id || null;
    saveTicket(ticket);
    return true;
  }

  // --- Étape initiale 2/2 : Images ou liens d'exemple en un seul message -> envoi MP automatique ---
  if (effectiveStatus === "awaiting_examples") {
    if (message.attachments && message.attachments.size > 0) {
      const exDir = path.join(TICKET_FILES_DIR, ticket.id, "examples");
      ticket.exampleFiles = ticket.exampleFiles || [];
      await saveMessageAttachmentsToDir(message, exDir, ticket.exampleFiles);
    }

    const urls = extractUrls(rawContent);
    if (urls.length > 0) {
      ticket.exampleLinks = [...new Set([...(ticket.exampleLinks || []), ...urls])];
    }

    const remainingText = stripUrls(rawContent);
    if (remainingText && !NO_EXAMPLE_WORDS_RE.test(remainingText)) {
      ticket.exampleNote = remainingText;
    }

    saveTicket(ticket);

    if (ticket.step2MessageId && message.channel?.messages?.fetch) {
      const prevStepMsg = await message.channel.messages
        .fetch(ticket.step2MessageId)
        .catch(() => null);
      if (prevStepMsg?.edit) {
        await prevStepMsg.edit({ components: [] }).catch(() => null);
      }
    }

    try {
      await message.react("✅");
    } catch {
      // ignore
    }

    await finalizeInitialBriefSubmission(client, message.channel, ticket);
    return true;
  }

  // --- Demande de modification Étape 1/2 : Description des modifications en un seul message ---
  if (effectiveStatus === "awaiting_mod_description") {
    if (message.attachments && message.attachments.size > 0) {
      const modDir = path.join(
        TICKET_FILES_DIR,
        ticket.id,
        `mod_round_${ticket.round || 1}`
      );
      ticket.pendingModFiles = ticket.pendingModFiles || [];
      await saveMessageAttachmentsToDir(message, modDir, ticket.pendingModFiles);
    }

    if (!rawContent) {
      saveTicket(ticket);
      await message.channel.send(
        buildTicketPayload(ticket, {
          color: ELYSIUM_ERROR,
          title: `⚠️ Description des modifications requise (${ticket.id})`,
          description: [
            `🆔 **ID du ticket :** \`${ticket.id}\``,
            "",
            "Veuillez d'abord expliquer par écrit **les modifications souhaitées en un seul message**.",
          ].join("\n"),
        })
      );
      return true;
    }

    ticket.pendingModText = rawContent;
    ticket.status = "awaiting_mod_examples";
    saveTicket(ticket);

    try {
      await message.react("✅");
    } catch {
      // ignore
    }

    const modStep2Msg = await message.channel.send(buildModStep2ExamplesPromptPayload(ticket));
    ticket.modStep2MessageId = modStep2Msg?.id || null;
    saveTicket(ticket);
    return true;
  }

  // --- Demande de modification Étape 2/2 : Images ou liens d'exemple -> envoi MP automatique ---
  if (effectiveStatus === "awaiting_mod_examples") {
    if (message.attachments && message.attachments.size > 0) {
      const modDir = path.join(
        TICKET_FILES_DIR,
        ticket.id,
        `mod_round_${ticket.round || 1}`
      );
      ticket.pendingModFiles = ticket.pendingModFiles || [];
      await saveMessageAttachmentsToDir(message, modDir, ticket.pendingModFiles);
    }

    const urls = extractUrls(rawContent);
    if (urls.length > 0) {
      ticket.pendingModLinks = [...new Set([...(ticket.pendingModLinks || []), ...urls])];
    }

    const remainingText = stripUrls(rawContent);
    if (remainingText && !NO_EXAMPLE_WORDS_RE.test(remainingText)) {
      ticket.pendingModNote = remainingText;
    }

    saveTicket(ticket);

    if (ticket.modStep2MessageId && message.channel?.messages?.fetch) {
      const prevModMsg = await message.channel.messages
        .fetch(ticket.modStep2MessageId)
        .catch(() => null);
      if (prevModMsg?.edit) {
        await prevModMsg.edit({ components: [] }).catch(() => null);
      }
    }

    try {
      await message.react("✅");
    } catch {
      // ignore
    }

    await finalizeModificationSubmission(client, message.channel, ticket);
    return true;
  }

  return false;
};

// ============================================================================
// Interactions (Boutons & Modale de /send-message)
// ============================================================================

export const handleTicketInteraction = async (interaction) => {
  const customId = String(interaction.customId || "");

  // 1) Soumission de la modale de /send-message
  if (interaction.isModalSubmit() && customId.startsWith("send_msg_modal:")) {
    if (!(await ensureAllowedCommandUser(interaction))) return true;
    const [, channelId, categoryId] = customId.split(":");
    const targetChannel =
      interaction.guild?.channels?.cache?.get(channelId) ||
      (await interaction.guild?.channels?.fetch(channelId).catch(() => null));

    if (!targetChannel || !targetChannel.isTextBased()) {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "❌ Salon introuvable",
        description: "Le salon sélectionné n'existe plus ou n'est pas accessible.",
      });
      return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const title = interaction.fields.getTextInputValue("embed_title")?.trim() || "";
    const messageText = interaction.fields.getTextInputValue("embed_text").trim();
    const buttonText = interaction.fields.getTextInputValue("button_label").trim();
    const ticketPrefix = interaction.fields.getTextInputValue("ticket_prefix")?.trim() || "";

    await publishTicketPanel({
      interaction,
      targetChannel,
      categoryId,
      title,
      messageText,
      buttonText,
      ticketPrefix,
    });
    return true;
  }

  // 2) Clic sur le bouton d'un message /send-message -> Création du salon ticket + message d'accueil + question 1
  if (interaction.isButton() && customId.startsWith("ticket_open:")) {
    if (interaction.guildId !== COMMUNITY_GUILD_ID) return true;
    const panelId = customId.split(":")[1];
    const panel = getTicketPanel(panelId);

    if (!panel) {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "❌ Panneau introuvable",
        description: "Ce bouton de ticket n'est plus actif.",
      });
      return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      panel.ticketCount = (panel.ticketCount || 0) + 1;
      saveTicketPanel(panel);

      const paddedNum = String(panel.ticketCount).padStart(3, "0");
      const userSlug = slugifyChannelPart(interaction.user.username, "membre").slice(0, 18);
      const channelName = `ticket-${panel.slug}-${paddedNum}-${userSlug}`.slice(0, 95);

      const { id: ticketId, globalNumber } = allocateUniqueTicketId();

      const overwrites = [
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
          ],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ];

      const ownerMember = await interaction.guild.members.fetch(OWNER_USER_ID).catch(() => null);
      if (ownerMember) {
        overwrites.push({
          id: OWNER_USER_ID,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
          ],
        });
      }

      let parentCategoryId = panel.categoryId || null;
      if (parentCategoryId) {
        const cat =
          interaction.guild.channels.cache.get(parentCategoryId) ||
          (await interaction.guild.channels.fetch(parentCategoryId).catch(() => null));
        if (!cat || cat.type !== ChannelType.GuildCategory) {
          parentCategoryId = null;
        }
      }

      const ticketChannel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: parentCategoryId || undefined,
        topic: `ID : ${ticketId} • Ticket #${paddedNum} • Source : ${panel.slug} (${panel.title}) • Client : ${interaction.user.tag} (${interaction.user.id})`,
        permissionOverwrites: overwrites,
      });

      const ticket = {
        id: ticketId,
        globalNumber,
        panelId: panel.id,
        panelSlug: panel.slug,
        panelTitle: panel.title,
        ticketNumber: panel.ticketCount,
        guildId: interaction.guildId,
        channelId: ticketChannel.id,
        channelName: ticketChannel.name,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        status: "awaiting_description",
        description: "",
        exampleLinks: [],
        exampleFiles: [],
        exampleNote: "",
        currentPreviewFiles: [],
        currentFinalFiles: [],
        pendingModText: "",
        pendingModFiles: [],
        pendingModLinks: [],
        pendingModNote: "",
        round: 1,
        welcomeMessageId: null,
        promptMessageId: null,
        createdAt: Date.now(),
      };

      // 1) Message d'accueil du ticket (avec ID)
      const welcomeMsg = await ticketChannel.send(buildTicketWelcomePayload(ticket));
      ticket.welcomeMessageId = welcomeMsg.id;

      // 2) Message demandant la description détaillée en un seul message (avec ID)
      const step1Msg = await ticketChannel.send(buildStep1DescriptionPromptPayload(ticket));
      ticket.promptMessageId = step1Msg.id;

      saveTicket(ticket);

      await respondTicketElysium(interaction, ticket, {
        ephemeral: true,
        color: ELYSIUM_SUCCESS,
        title: `🎫 Ticket créé ! (${ticket.id})`,
        description: [
          `🆔 **ID du ticket :** \`${ticket.id}\``,
          "",
          `Votre salon privé a été ouvert : <#${ticketChannel.id}>.`,
          "Rendez-vous dedans pour envoyer votre description détaillée en un message !",
        ].join("\n"),
      });
    } catch (err) {
      console.error("[ticket_open]", err);
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "❌ Impossible de créer le ticket",
        description:
          err.message ||
          "Vérifiez que le bot dispose de la permission `Gérer les salons` sur ce serveur.",
      });
    }
    return true;
  }

  // 3) Bouton optionnel : Passer l'étape 2 (aucune image / lien d'exemple) -> envoie le MP directement
  if (interaction.isButton() && customId.startsWith("ticket_skip_examples:")) {
    const ticketId = customId.split(":")[1];
    const ticket = getTicket(ticketId);
    if (!ticket) return true;

    if (interaction.user.id !== ticket.userId && !isCommandAllowedUser(interaction.user.id)) {
      await respondTicketElysium(interaction, ticket, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "⛔ Accès refusé",
        description: "Seul l'auteur du ticket peut valider cette étape.",
      });
      return true;
    }

    if (ticket.status !== "awaiting_examples") {
      await respondTicketElysium(interaction, ticket, {
        ephemeral: true,
        color: ELYSIUM_INFO,
        title: "ℹ️ Étape déjà traitée",
        description: "Votre demande a déjà été transmise.",
      });
      return true;
    }

    await interaction.deferUpdate();
    await interaction.editReply({ components: [] }).catch(() => null);
    await finalizeInitialBriefSubmission(interaction.client, interaction.channel, ticket);
    return true;
  }

  // 4) Dans le ticket : le client clique sur "Demander une modification" -> lance la collecte en messages
  if (interaction.isButton() && customId.startsWith("ticket_client_modify:")) {
    const ticketId = customId.split(":")[1];
    const ticket = getTicket(ticketId);
    if (!ticket) return true;

    if (interaction.user.id !== ticket.userId && !isCommandAllowedUser(interaction.user.id)) {
      await respondTicketElysium(interaction, ticket, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "⛔ Accès refusé",
        description: "Seul l'auteur du ticket peut demander une modification.",
      });
      return true;
    }

    ticket.pendingModText = "";
    ticket.pendingModFiles = [];
    ticket.pendingModLinks = [];
    ticket.pendingModNote = "";
    ticket.status = "awaiting_mod_description";
    saveTicket(ticket);

    await interaction.deferUpdate();
    await interaction.editReply({ components: [] }).catch(() => null);
    await interaction.channel.send(buildModStep1PromptPayload(ticket));
    return true;
  }

  // 5) Bouton optionnel : Passer les images sur une demande de modification -> envoie le MP directement
  if (interaction.isButton() && customId.startsWith("ticket_skip_mod_examples:")) {
    const ticketId = customId.split(":")[1];
    const ticket = getTicket(ticketId);
    if (!ticket) return true;

    if (interaction.user.id !== ticket.userId && !isCommandAllowedUser(interaction.user.id)) {
      await respondTicketElysium(interaction, ticket, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "⛔ Accès refusé",
        description: "Seul l'auteur du ticket peut valider cette étape.",
      });
      return true;
    }

    if (ticket.status !== "awaiting_mod_examples") {
      await respondTicketElysium(interaction, ticket, {
        ephemeral: true,
        color: ELYSIUM_INFO,
        title: "ℹ️ Étape déjà traitée",
        description: "Vos modifications ont déjà été envoyées.",
      });
      return true;
    }

    await interaction.deferUpdate();
    await interaction.editReply({ components: [] }).catch(() => null);
    await finalizeModificationSubmission(interaction.client, interaction.channel, ticket);
    return true;
  }

  // 6) Dans le ticket : le client clique sur "Accepter" -> envoi de TOUS les fichiers finaux + incitation au don PayPal
  if (interaction.isButton() && customId.startsWith("ticket_client_accept:")) {
    const ticketId = customId.split(":")[1];
    const ticket = getTicket(ticketId);
    if (!ticket) return true;

    if (interaction.user.id !== ticket.userId && !isCommandAllowedUser(interaction.user.id)) {
      await respondTicketElysium(interaction, ticket, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "⛔ Accès refusé",
        description: "Seul l'auteur du ticket peut accepter la commande.",
      });
      return true;
    }

    if (ticket.status === "completed") {
      await respondTicketElysium(interaction, ticket, {
        ephemeral: true,
        color: ELYSIUM_INFO,
        title: "ℹ️ Commande déjà validée",
        description: "Vos fichiers finaux vous ont déjà été envoyés ci-dessus !",
      });
      return true;
    }

    await interaction.deferUpdate();

    try {
      await interaction.editReply({ components: [] }).catch(() => null);

      const finals = ticket.currentFinalFiles || [];
      const resolvedAttachments = [];
      for (let i = 0; i < finals.length; i += 1) {
        const res = await resolveStoredFileAttachment(interaction.client, finals[i], i);
        if (res) {
          resolvedAttachments.push(
            new AttachmentBuilder(res.attachment, { name: res.name })
          );
        }
      }

      // Discord limite un message à 10 pièces jointes (dont logo + bannière = 2) -> lots de 8 fichiers max par message
      const BATCH_SIZE = 8;
      if (resolvedAttachments.length === 0) {
        await interaction.channel.send(
          buildTicketPayload(ticket, {
            content: `<@${ticket.userId}>`,
            color: ELYSIUM_SUCCESS,
            title: `🎉 Design validé ! (${ticket.id})`,
            description: `🆔 **ID du ticket :** \`${ticket.id}\`\n\nMerci d'avoir validé votre design !`,
          })
        );
      } else {
        for (let offset = 0; offset < resolvedAttachments.length; offset += BATCH_SIZE) {
          const chunk = resolvedAttachments.slice(offset, offset + BATCH_SIZE);
          const totalBatches = Math.ceil(resolvedAttachments.length / BATCH_SIZE);
          const currentBatch = Math.floor(offset / BATCH_SIZE) + 1;

          await interaction.channel.send(
            buildTicketPayload(ticket, {
              content: offset === 0 ? `<@${ticket.userId}>` : undefined,
              color: ELYSIUM_SUCCESS,
              title:
                totalBatches > 1
                  ? `📦 Vos fichiers finaux (${currentBatch}/${totalBatches}) — ${ticket.id}`
                  : `📦 Voici l'ensemble de vos fichiers finaux ! (${ticket.id})`,
              description:
                offset === 0
                  ? `🆔 **ID du ticket :** \`${ticket.id}\`\n\nMerci <@${ticket.userId}> pour votre validation ! Vous trouverez ci-joint tous les fichiers haute qualité de votre commande.`
                  : `🆔 **ID du ticket :** \`${ticket.id}\`\n\nSuite de vos fichiers finaux :`,
              extraFiles: chunk,
            })
          );
        }
      }

      // Message d'incitation à faire une donation PayPal après envoi des fichiers finaux
      const donateRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Faire une donation PayPal")
          .setEmoji("💛")
          .setStyle(ButtonStyle.Link)
          .setURL(DONATION_URL)
      );

      await interaction.channel.send(
        buildTicketPayload(ticket, {
          color: ELYSIUM_GOLD,
          title: `💛 Soutenez Elysium Esport ! (${ticket.id})`,
          description: [
            `🆔 **ID du ticket :** \`${ticket.id}\``,
            "",
            `Nous espérons que votre design vous plaît à 100%, <@${ticket.userId}> !`,
            "",
            "Si vous êtes satisfait(e) du travail réalisé et souhaitez soutenir notre travail ainsi que le développement d'**Elysium**, n'hésitez pas à faire une petite **donation** — chaque geste compte énormément pour nous ! 🙏",
            "",
            `👉 **Lien de donation :** ${DONATION_URL}`,
          ].join("\n"),
          components: [donateRow],
        })
      );

      ticket.status = "completed";
      ticket.completedAt = Date.now();
      saveTicket(ticket);

      // Notifie également l'administrateur en MP que le client a validé et reçu les fichiers finaux
      const owner = await interaction.client.users.fetch(OWNER_USER_ID).catch(() => null);
      if (owner) {
        await owner
          .send(
            buildTicketPayload(ticket, {
              color: ELYSIUM_SUCCESS,
              title: `✅ Commande acceptée — ${ticket.id} (#${ticket.channelName})`,
              description: `🆔 **ID du ticket :** \`${ticket.id}\`\n\n<@${ticket.userId}> a accepté le preview dans <#${ticket.channelId}> ! Tous les fichiers finaux (**${resolvedAttachments.length}**) ainsi que le lien de donation PayPal lui ont été envoyés.`,
            })
          )
          .catch(() => null);
      }
    } catch (err) {
      console.error("[ticket_client_accept]", err);
      await interaction.followUp(
        buildTicketPayload(ticket, {
          ephemeral: true,
          color: ELYSIUM_ERROR,
          title: "❌ Erreur lors de l'envoi des fichiers finaux",
          description: err.message || "Une erreur inattendue est survenue.",
        })
      );
    }
    return true;
  }

  return false;
};
