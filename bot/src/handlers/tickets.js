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
  ensureOwnerOnly,
  isCommandAllowedUser,
  isOwnerUser,
} from "../lib/permissions.js";
import {
  ensureDirectories,
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

/** Construit un slug de panneau garanti unique pour ne jamais mélanger les tickets de 2 messages différents. */
const allocateUniquePanelSlug = (preferredRaw) => {
  const base = slugifyChannelPart(preferredRaw, "demande");
  const existingSlugs = new Set(listTicketPanels().map((p) => p.slug));
  if (!existingSlugs.has(base)) return base;
  let n = 2;
  while (existingSlugs.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
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
  if (fileMeta.sourceChannelId && fileMeta.sourceMessageId) {
    const ch = await client.channels.fetch(fileMeta.sourceChannelId).catch(() => null);
    const msg = ch?.messages
      ? await ch.messages.fetch(fileMeta.sourceMessageId).catch(() => null)
      : null;
    const att =
      msg?.attachments?.get(fileMeta.attachmentId) ||
      [...(msg?.attachments?.values() || [])].find((a) => a.name === fileMeta.fileName);
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
// Rendu des messages de formulaire & studio MP
// ============================================================================

const buildInitialTicketFormPayload = (ticket) => {
  const hasDesc = Boolean(ticket.description && ticket.description.trim());
  const exampleCount =
    (ticket.exampleFiles?.length || 0) + (ticket.exampleLinks?.length || 0);

  const fields = [
    {
      name: "1️⃣ Description très détaillée (Obligatoire)",
      value: hasDesc
        ? ticket.description.slice(0, 1000)
        : "*Non renseignée — cliquez sur **📝 Remplir les informations** ci-dessous.*",
      inline: false,
    },
    {
      name: "2️⃣ Exemple de design souhaité — Image / Lien (Facultatif)",
      value:
        exampleCount > 0
          ? [
              ...(ticket.exampleLinks || []).map((u) => `🔗 ${u}`),
              ...(ticket.exampleFiles || []).map((f) => `🖼️ \`${f.fileName}\``),
            ]
              .join("\n")
              .slice(0, 1000)
          : "*Aucun exemple joint pour l'instant (vous pouvez coller un lien dans le formulaire ou envoyer directement une image dans ce salon avant de cliquer sur Envoyer).*",
      inline: false,
    },
  ];

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_fill_modal:${ticket.id}`)
      .setLabel(hasDesc ? "Modifier ma description" : "Remplir les informations")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ticket_submit_initial:${ticket.id}`)
      .setLabel("Envoyer ma demande")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!hasDesc)
  );

  return buildElysiumPayload({
    content: `<@${ticket.userId}>`,
    color: ELYSIUM_GOLD,
    title: `🎫 Ticket ouvert — ${ticket.panelTitle || ticket.panelSlug}`,
    description: [
      `Bienvenue <@${ticket.userId}> dans votre salon dédié (**#${ticket.channelName}**) !`,
      "",
      "Afin que nous puissions traiter votre demande, veuillez compléter les informations suivantes :",
      "• **Décrivez-nous de manière très détaillée ce que vous désirez** *(obligatoire)* via le bouton **📝 Remplir les informations**.",
      "• **Avez-vous un exemple de design que vous désirez ?** *(facultatif)* : si oui, indiquez le **lien** dans le formulaire ou **envoyez directement votre image dans ce salon**.",
      "",
      "Dès que tout est prêt, cliquez sur **✅ Envoyer ma demande** !",
    ].join("\n"),
    fields,
    components: [row],
  });
};

const buildModificationDraftPayload = (ticket) => {
  const modFiles = ticket.pendingModFiles || [];
  const modLinks = ticket.pendingModLinks || [];

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_client_modify:${ticket.id}`)
      .setLabel("Modifier le texte")
      .setEmoji("✏️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ticket_submit_mod:${ticket.id}`)
      .setLabel("Envoyer les modifications")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
  );

  return buildElysiumPayload({
    color: ELYSIUM_GOLD,
    title: "✏️ Demande de modification du design",
    description: [
      "Votre description des modifications a bien été enregistrée ci-dessous.",
      "",
      "🖼️ **Souhaitez-vous joindre une ou plusieurs images** pour illustrer les modifications ?",
      "• **Si oui :** envoyez vos images directement dans ce salon puis cliquez sur **✅ Envoyer les modifications**.",
      "• **Si non :** cliquez directement sur **✅ Envoyer les modifications**.",
    ].join("\n"),
    fields: [
      {
        name: "📝 Modifications demandées (Obligatoire)",
        value: (ticket.pendingModText || "—").slice(0, 1024),
        inline: false,
      },
      {
        name: `🖼️ Images / Liens joints (${modFiles.length + modLinks.length})`,
        value:
          modFiles.length + modLinks.length > 0
            ? [
                ...modLinks.map((u) => `🔗 ${u}`),
                ...modFiles.map((f) => `🖼️ \`${f.fileName}\``),
              ]
                .join("\n")
                .slice(0, 1024)
            : "*Aucune image jointe pour l'instant.*",
        inline: false,
      },
    ],
    components: [row],
  });
};

const buildOwnerDmStudioPayload = (ticket, activeBucket = null) => {
  const previews = ticket.currentPreviewFiles || [];
  const finals = ticket.currentFinalFiles || [];

  const modeLabel =
    activeBucket === "preview"
      ? "🟢 **PREVIEW ACTIF** — Envoyez vos images de preview ici en MP !"
      : activeBucket === "final"
        ? "🟢 **FINAL ACTIF** — Envoyez tous vos fichiers finaux ici en MP !"
        : "⚪ Cliquez sur **Preview** ou **Final** ci-dessous avant d'importer vos fichiers en MP.";

  const formatList = (files) =>
    files.length === 0
      ? "*Aucun fichier importé*"
      : files
          .slice(0, 15)
          .map((f, i) => `${i + 1}. \`${f.fileName}\``)
          .concat(files.length > 15 ? [`*... +${files.length - 15} autre(s)*`] : [])
          .join("\n");

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_dm_bucket:${ticket.id}:preview`)
      .setLabel("Preview")
      .setEmoji("🖼️")
      .setStyle(activeBucket === "preview" ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ticket_dm_bucket:${ticket.id}:final`)
      .setLabel("Final")
      .setEmoji("📦")
      .setStyle(activeBucket === "final" ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ticket_dm_send:${ticket.id}`)
      .setLabel("Envoyée")
      .setEmoji("📨")
      .setStyle(ButtonStyle.Secondary)
  );

  const components = [row1];
  if (previews.length > 0 || finals.length > 0) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_dm_clear:${ticket.id}`)
          .setLabel("Vider les fichiers importés")
          .setEmoji("🗑️")
          .setStyle(ButtonStyle.Danger)
      )
    );
  }

  return buildElysiumPayload({
    color: ELYSIUM_GOLD,
    title: `🎨 Réponse au ticket #${ticket.channelName}`,
    description: [
      `**Client :** <@${ticket.userId}> (\`${ticket.userTag || ticket.userId}\`)`,
      `**Salon :** <#${ticket.channelId}>`,
      "",
      modeLabel,
      "*Vous pouvez envoyer autant de fichiers que vous le souhaitez en un ou plusieurs messages.*",
    ].join("\n"),
    fields: [
      {
        name: `🖼️ Fichiers Preview (${previews.length})`,
        value: formatList(previews),
        inline: true,
      },
      {
        name: `📦 Fichiers Final (${finals.length})`,
        value: formatList(finals),
        inline: true,
      },
    ],
    components,
  });
};

/** Envoie un brief initial ou une demande de modification en MP à l'utilisateur 520496557146243072. */
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
  const mainText = isModification ? ticket.pendingModText : ticket.description;

  const extraImages = [];
  const extraFiles = [];

  for (let i = 0; i < filesToForward.length; i += 1) {
    const resolved = await resolveStoredFileAttachment(client, filesToForward[i], i);
    if (!resolved) continue;
    const attachName = `ref_${i + 1}_${resolved.name}`;
    if (resolved.isImage && extraImages.length < 8) {
      extraImages.push({ attachment: resolved.attachment, name: attachName });
    } else {
      extraFiles.push(new AttachmentBuilder(resolved.attachment, { name: attachName }));
    }
  }

  const replyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_dm_reply:${ticket.id}`)
      .setLabel("Répondre")
      .setEmoji("💬")
      .setStyle(ButtonStyle.Primary)
  );

  const channelLink = `https://discord.com/channels/${ticket.guildId}/${ticket.channelId}`;

  const fields = [
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

  if (links.length > 0 || filesToForward.length > 0) {
    fields.push({
      name: isModification ? "🖼️ Références jointes" : "🎨 Exemple(s) de design fourni(s)",
      value: [
        ...links.map((l) => `🔗 ${l}`),
        ...filesToForward.map((f) => `📎 \`${f.fileName}\``),
      ]
        .join("\n")
        .slice(0, 1024),
      inline: false,
    });
  }

  const dmPayload = buildElysiumPayload({
    color: ELYSIUM_GOLD,
    title: isModification
      ? `🔄 Modification demandée — #${ticket.channelName}`
      : `🆕 Nouvelle demande de ticket — #${ticket.channelName}`,
    description: isModification
      ? `Le client <@${ticket.userId}> a demandé des modifications sur le preview du ticket **#${ticket.channelName}**.`
      : `Une nouvelle demande vient d'être soumise dans le ticket **#${ticket.channelName}**.`,
    fields,
    extraImages,
    extraFiles,
    components: [replyRow],
  });

  await owner.send(dmPayload);
};

// ============================================================================
// Collecte des messages & fichiers dans les tickets et en MP
// ============================================================================

export const handleTicketAndDmMessage = async (message) => {
  if (message.author?.bot) return false;

  // 1) Message privé envoyé par l'administrateur 520496557146243072 (import Preview / Final)
  if (!message.inGuild()) {
    if (!isOwnerUser(message.author?.id)) return false;
    if (!message.attachments || message.attachments.size === 0) return false;

    const session = getDmSession(OWNER_USER_ID);
    if (!session || !session.ticketId) return false;

    const ticket = getTicket(session.ticketId);
    if (!ticket) return false;

    if (session.bucket !== "preview" && session.bucket !== "final") {
      await message.reply(
        buildElysiumPayload({
          color: ELYSIUM_INFO,
          title: "ℹ️ Choisissez d'abord Preview ou Final",
          description:
            "Cliquez d'abord sur le bouton **🖼️ Preview** ou **📦 Final** du panneau ci-dessus pour indiquer dans quelle catégorie ranger ces fichiers.",
        })
      );
      return true;
    }

    ensureDirectories();
    const round = ticket.round || 1;
    const bucketDir = path.join(
      TICKET_FILES_DIR,
      ticket.id,
      `round_${round}`,
      session.bucket
    );
    fs.mkdirSync(bucketDir, { recursive: true });

    const targetArray =
      session.bucket === "preview"
        ? (ticket.currentPreviewFiles = ticket.currentPreviewFiles || [])
        : (ticket.currentFinalFiles = ticket.currentFinalFiles || []);

    let imported = 0;
    for (const att of message.attachments.values()) {
      const idx = targetArray.length + 1;
      const safeName = sanitizeFileName(att.name, idx);
      const localPath = path.join(bucketDir, `${Date.now()}_${idx}_${safeName}`);
      const buffer = await downloadAttachmentBuffer(att.url);
      fs.writeFileSync(localPath, buffer);

      targetArray.push({
        fileName: att.name || safeName,
        localPath,
        contentType: att.contentType || "",
        size: att.size || buffer.byteLength,
        isImage: isImageAttachment(att),
        sourceChannelId: message.channelId,
        sourceMessageId: message.id,
        attachmentId: att.id,
      });
      imported += 1;
    }

    saveTicket(ticket);

    try {
      await message.react("✅");
    } catch {
      // ignore
    }

    // Rafraîchit le panneau studio MP pour afficher la liste à jour
    if (session.studioMessageId) {
      const studioMsg = await message.channel.messages
        .fetch(session.studioMessageId)
        .catch(() => null);
      if (studioMsg) {
        await studioMsg.edit(buildOwnerDmStudioPayload(ticket, session.bucket));
      }
    }

    return imported > 0;
  }

  // 2) Message envoyé dans un salon ticket sur le serveur communautaire 1565264995078508554
  if (message.guild.id !== COMMUNITY_GUILD_ID) return false;

  const ticket = getTicketByChannelId(message.channelId);
  if (!ticket) return false;
  if (message.author.id !== ticket.userId && !isCommandAllowedUser(message.author.id)) {
    return false;
  }

  // Phase A : saisie initiale (image/lien d'exemple ou texte complémentaire)
  if (ticket.status === "awaiting_initial_info") {
    let updated = false;
    ensureDirectories();

    const urls = extractUrls(message.content);
    if (urls.length > 0) {
      ticket.exampleLinks = [...new Set([...(ticket.exampleLinks || []), ...urls])];
      updated = true;
    }

    // Si le client écrit directement une longue description sans liens seuls et n'a pas encore rempli la modale
    const textWithoutUrls = String(message.content || "")
      .replace(/https?:\/\/[^\s<>()]+/gi, "")
      .trim();
    if (textWithoutUrls.length >= 10 && !ticket.description) {
      ticket.description = textWithoutUrls;
      updated = true;
    }

    if (message.attachments && message.attachments.size > 0) {
      const exDir = path.join(TICKET_FILES_DIR, ticket.id, "examples");
      fs.mkdirSync(exDir, { recursive: true });
      ticket.exampleFiles = ticket.exampleFiles || [];

      for (const att of message.attachments.values()) {
        const idx = ticket.exampleFiles.length + 1;
        const safeName = sanitizeFileName(att.name, idx);
        const localPath = path.join(exDir, `${Date.now()}_${idx}_${safeName}`);
        const buf = await downloadAttachmentBuffer(att.url);
        fs.writeFileSync(localPath, buf);

        ticket.exampleFiles.push({
          fileName: att.name || safeName,
          localPath,
          contentType: att.contentType || "",
          isImage: isImageAttachment(att),
          sourceChannelId: message.channelId,
          sourceMessageId: message.id,
          attachmentId: att.id,
        });
        updated = true;
      }
    }

    if (updated) {
      saveTicket(ticket);
      try {
        await message.react("✅");
      } catch {
        // ignore
      }
      if (ticket.formMessageId) {
        const formMsg = await message.channel.messages
          .fetch(ticket.formMessageId)
          .catch(() => null);
        if (formMsg) {
          await formMsg.edit(buildInitialTicketFormPayload(ticket));
        }
      }
    }
    return updated;
  }

  // Phase B : ajout d'images / liens lors d'une demande de modification
  if (ticket.status === "awaiting_modification_submit") {
    let updated = false;
    ensureDirectories();

    const urls = extractUrls(message.content);
    if (urls.length > 0) {
      ticket.pendingModLinks = [...new Set([...(ticket.pendingModLinks || []), ...urls])];
      updated = true;
    }

    if (message.attachments && message.attachments.size > 0) {
      const modDir = path.join(
        TICKET_FILES_DIR,
        ticket.id,
        `mod_round_${ticket.round || 1}`
      );
      fs.mkdirSync(modDir, { recursive: true });
      ticket.pendingModFiles = ticket.pendingModFiles || [];

      for (const att of message.attachments.values()) {
        const idx = ticket.pendingModFiles.length + 1;
        const safeName = sanitizeFileName(att.name, idx);
        const localPath = path.join(modDir, `${Date.now()}_${idx}_${safeName}`);
        const buf = await downloadAttachmentBuffer(att.url);
        fs.writeFileSync(localPath, buf);

        ticket.pendingModFiles.push({
          fileName: att.name || safeName,
          localPath,
          contentType: att.contentType || "",
          isImage: isImageAttachment(att),
          sourceChannelId: message.channelId,
          sourceMessageId: message.id,
          attachmentId: att.id,
        });
        updated = true;
      }
    }

    if (updated) {
      saveTicket(ticket);
      try {
        await message.react("✅");
      } catch {
        // ignore
      }
      if (ticket.modDraftMessageId) {
        const draftMsg = await message.channel.messages
          .fetch(ticket.modDraftMessageId)
          .catch(() => null);
        if (draftMsg) {
          await draftMsg.edit(buildModificationDraftPayload(ticket));
        }
      }
    }
    return updated;
  }

  return false;
};

// ============================================================================
// Interactions (Boutons & Modales du système de tickets)
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

  // 2) Clic sur le bouton d'un message /send-message -> Création du salon ticket identifiable
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
      // Nom clairement identifiable par message d'origine : ticket-<slugDuMessage>-<num>-<pseudo>
      const channelName = `ticket-${panel.slug}-${paddedNum}-${userSlug}`.slice(0, 95);

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

      // Ajoute l'accès au salon pour l'admin principal s'il est membre du serveur
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
        topic: `Ticket #${paddedNum} • Source : ${panel.slug} (${panel.title}) • Client : ${interaction.user.tag} (${interaction.user.id})`,
        permissionOverwrites: overwrites,
      });

      const globalTicketNum = nextCounter("ticket");
      const ticketId = `tkt_${globalTicketNum}_${Date.now()}`;

      const ticket = {
        id: ticketId,
        panelId: panel.id,
        panelSlug: panel.slug,
        panelTitle: panel.title,
        ticketNumber: panel.ticketCount,
        guildId: interaction.guildId,
        channelId: ticketChannel.id,
        channelName: ticketChannel.name,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        status: "awaiting_initial_info",
        description: "",
        exampleLinks: [],
        exampleFiles: [],
        currentPreviewFiles: [],
        currentFinalFiles: [],
        pendingModText: "",
        pendingModFiles: [],
        pendingModLinks: [],
        round: 1,
        formMessageId: null,
        modDraftMessageId: null,
        createdAt: Date.now(),
      };

      const formMsg = await ticketChannel.send(buildInitialTicketFormPayload(ticket));
      ticket.formMessageId = formMsg.id;
      saveTicket(ticket);

      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_SUCCESS,
        title: "🎫 Ticket créé !",
        description: `Votre salon privé a été ouvert : <#${ticketChannel.id}>.\nRendez-vous dedans pour décrire votre demande en détail !`,
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

  // 3) Bouton dans le ticket : ouvrir le formulaire de description initiale
  if (interaction.isButton() && customId.startsWith("ticket_fill_modal:")) {
    const ticketId = customId.split(":")[1];
    const ticket = getTicket(ticketId);
    if (!ticket) return true;

    if (interaction.user.id !== ticket.userId && !isCommandAllowedUser(interaction.user.id)) {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "⛔ Accès refusé",
        description: "Seul l'auteur du ticket peut remplir cette demande.",
      });
      return true;
    }

    const modal = new ModalBuilder()
      .setCustomId(`ticket_initial_modal:${ticket.id}`)
      .setTitle("Informations de votre demande");

    const descInput = new TextInputBuilder()
      .setCustomId("detailed_description")
      .setLabel("Décrivez en détail ce que vous désirez")
      .setPlaceholder(
        "Décrivez de manière très détaillée ce que vous désirez (style, couleurs, textes, dimensions...)"
      )
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(3800);
    if (ticket.description) descInput.setValue(ticket.description.slice(0, 3800));

    const exampleInput = new TextInputBuilder()
      .setCustomId("example_link")
      .setLabel("Exemple de design souhaité (Lien, optionnel)")
      .setPlaceholder(
        "Facultatif : collez un lien ici (ou envoyez une image directement dans le salon)"
      )
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(500);
    if (ticket.exampleLinks?.length) {
      exampleInput.setValue(ticket.exampleLinks.join(" ").slice(0, 500));
    }

    modal.addComponents(
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(exampleInput)
    );

    await interaction.showModal(modal);
    return true;
  }

  // 4) Soumission de la modale d'informations initiales
  if (interaction.isModalSubmit() && customId.startsWith("ticket_initial_modal:")) {
    const ticketId = customId.split(":")[1];
    const ticket = getTicket(ticketId);
    if (!ticket) return true;

    const description = interaction.fields.getTextInputValue("detailed_description").trim();
    const rawExample = interaction.fields.getTextInputValue("example_link")?.trim() || "";

    ticket.description = description;
    if (rawExample) {
      const urls = extractUrls(rawExample);
      ticket.exampleLinks = urls.length > 0 ? urls : [rawExample];
    }
    saveTicket(ticket);

    if (ticket.formMessageId && interaction.channel?.messages) {
      const formMsg = await interaction.channel.messages
        .fetch(ticket.formMessageId)
        .catch(() => null);
      if (formMsg) {
        await formMsg.edit(buildInitialTicketFormPayload(ticket));
      }
    }

    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_SUCCESS,
      title: "📝 Informations enregistrées",
      description: [
        "Votre description détaillée est enregistrée !",
        "",
        "• Si vous souhaitez joindre **une image d'exemple**, envoyez-la maintenant dans ce salon puis cliquez sur **✅ Envoyer ma demande**.",
        "• Sinon, cliquez directement sur **✅ Envoyer ma demande** pour transmettre votre brief !",
      ].join("\n"),
    });
    return true;
  }

  // 5) Envoi définitif du brief initial par le client -> MP à 520496557146243072 + message d'attente
  if (interaction.isButton() && customId.startsWith("ticket_submit_initial:")) {
    const ticketId = customId.split(":")[1];
    const ticket = getTicket(ticketId);
    if (!ticket) return true;

    if (interaction.user.id !== ticket.userId && !isCommandAllowedUser(interaction.user.id)) {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "⛔ Accès refusé",
        description: "Seul l'auteur du ticket peut envoyer cette demande.",
      });
      return true;
    }

    if (!ticket.description || !ticket.description.trim()) {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "⚠️ Description obligatoire manquante",
        description:
          "Veuillez d'abord décrire de manière très détaillée ce que vous désirez via le bouton **📝 Remplir les informations**.",
      });
      return true;
    }

    if (ticket.status !== "awaiting_initial_info") {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_INFO,
        title: "ℹ️ Demande déjà transmise",
        description: "Votre demande est déjà prise en charge.",
      });
      return true;
    }

    await interaction.deferUpdate();

    try {
      await sendRequestToOwnerDm(interaction.client, ticket, { isModification: false });

      ticket.status = "pending_designer";
      saveTicket(ticket);

      await interaction.editReply(
        buildElysiumPayload({
          color: ELYSIUM_INFO,
          title: "⏳ Demande prise en charge",
          description: [
            `Merci <@${ticket.userId}> ! Vos informations ont bien été transmises.`,
            "",
            "**Votre demande est prise en charge, merci de patienter.** Nous reviendrons vers vous directement dans ce salon dès que votre aperçu (*preview*) sera prêt !",
          ].join("\n"),
          fields: [
            {
              name: "📋 Récapitulatif de votre demande",
              value: ticket.description.slice(0, 1024),
              inline: false,
            },
          ],
          components: [],
        })
      );
    } catch (err) {
      console.error("[ticket_submit_initial]", err);
      await interaction.followUp(
        buildElysiumPayload({
          ephemeral: true,
          color: ELYSIUM_ERROR,
          title: "❌ Erreur lors de la transmission",
          description: err.message || "Impossible de transmettre la demande en message privé.",
        })
      );
    }
    return true;
  }

  // 6) En MP : l'utilisateur 520496557146243072 clique sur "Répondre" -> ouvre les 3 boutons (Preview, Final, Envoyée)
  if (interaction.isButton() && customId.startsWith("ticket_dm_reply:")) {
    if (!(await ensureOwnerOnly(interaction))) return true;
    const ticketId = customId.split(":")[1];
    const ticket = getTicket(ticketId);
    if (!ticket) {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "❌ Ticket introuvable",
        description: "Ce ticket n'existe plus.",
      });
      return true;
    }

    ticket.currentPreviewFiles = ticket.currentPreviewFiles || [];
    ticket.currentFinalFiles = ticket.currentFinalFiles || [];
    saveTicket(ticket);

    await interaction.deferReply();
    const studioMsg = await interaction.editReply(buildOwnerDmStudioPayload(ticket, "preview"));

    setDmSession(OWNER_USER_ID, {
      ticketId: ticket.id,
      bucket: "preview",
      studioMessageId: studioMsg.id,
      studioChannelId: interaction.channelId,
    });
    return true;
  }

  // 7) En MP : bascule entre les boutons "Preview" et "Final"
  if (interaction.isButton() && customId.startsWith("ticket_dm_bucket:")) {
    if (!(await ensureOwnerOnly(interaction))) return true;
    const [, ticketId, bucket] = customId.split(":");
    const ticket = getTicket(ticketId);
    if (!ticket) return true;

    setDmSession(OWNER_USER_ID, {
      ticketId: ticket.id,
      bucket,
      studioMessageId: interaction.message.id,
      studioChannelId: interaction.channelId,
    });

    await interaction.update(buildOwnerDmStudioPayload(ticket, bucket));
    return true;
  }

  // 7bis) En MP : vider les fichiers Preview/Final avant envoi si erreur de sélection
  if (interaction.isButton() && customId.startsWith("ticket_dm_clear:")) {
    if (!(await ensureOwnerOnly(interaction))) return true;
    const ticketId = customId.split(":")[1];
    const ticket = getTicket(ticketId);
    if (!ticket) return true;

    ticket.currentPreviewFiles = [];
    ticket.currentFinalFiles = [];
    saveTicket(ticket);

    const session = getDmSession(OWNER_USER_ID);
    const activeBucket = session?.ticketId === ticket.id ? session.bucket : "preview";
    await interaction.update(buildOwnerDmStudioPayload(ticket, activeBucket));
    return true;
  }

  // 8) En MP : clic sur "Envoyée" -> envoie le(s) Preview dans le ticket avec Accepter / Modification
  if (interaction.isButton() && customId.startsWith("ticket_dm_send:")) {
    if (!(await ensureOwnerOnly(interaction))) return true;
    const ticketId = customId.split(":")[1];
    const ticket = getTicket(ticketId);
    if (!ticket) return true;

    const previews = ticket.currentPreviewFiles || [];
    const finals = ticket.currentFinalFiles || [];

    if (previews.length === 0) {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "🖼️ Aucun fichier dans Preview",
        description:
          "Cliquez sur **🖼️ Preview**, envoyez au moins une image d'aperçu en MP, puis cliquez sur **📨 Envoyée**.",
      });
      return true;
    }

    if (finals.length === 0) {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "📦 Aucun fichier dans Final",
        description:
          "Cliquez sur **📦 Final**, envoyez le(s) fichier(s) finaux en MP (ils ne seront livrés au client qu'après son acceptation), puis cliquez sur **📨 Envoyée**.",
      });
      return true;
    }

    await interaction.deferUpdate();

    try {
      const ticketChannel = await interaction.client.channels
        .fetch(ticket.channelId)
        .catch(() => null);
      if (!ticketChannel || !ticketChannel.isTextBased()) {
        throw new Error(`Le salon du ticket (#${ticket.channelName}) est introuvable.`);
      }

      const previewImages = [];
      const extraPreviewFiles = [];

      for (let i = 0; i < previews.length; i += 1) {
        const resolved = await resolveStoredFileAttachment(interaction.client, previews[i], i);
        if (!resolved) continue;
        const attachName = `preview_${i + 1}_${resolved.name}`;
        if (resolved.isImage && previewImages.length < 8) {
          previewImages.push({ attachment: resolved.attachment, name: attachName });
        } else {
          extraPreviewFiles.push(
            new AttachmentBuilder(resolved.attachment, { name: attachName })
          );
        }
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
        buildElysiumPayload({
          content: `<@${ticket.userId}>`,
          color: ELYSIUM_GOLD,
          title: "🎨 Aperçu (Preview) de votre commande",
          description: [
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

      setDmSession(OWNER_USER_ID, null);

      await interaction.editReply(
        buildElysiumPayload({
          color: ELYSIUM_SUCCESS,
          title: "✅ Preview envoyé dans le ticket !",
          description: [
            `Le preview (**${previews.length}** fichier(s)) a été envoyé à <@${ticket.userId}> dans <#${ticket.channelId}>.`,
            `📦 **${finals.length}** fichier(s) final/finaux sont prêts et seront livrés automatiquement dès que le client cliquera sur **Accepter**.`,
          ].join("\n"),
          components: [],
        })
      );
    } catch (err) {
      console.error("[ticket_dm_send]", err);
      await interaction.followUp(
        buildElysiumPayload({
          ephemeral: true,
          color: ELYSIUM_ERROR,
          title: "❌ Échec de l'envoi du preview",
          description: err.message || "Une erreur est survenue.",
        })
      );
    }
    return true;
  }

  // 9) Dans le ticket : le client clique sur "Demander une modification" -> Modale obligatoire
  if (interaction.isButton() && customId.startsWith("ticket_client_modify:")) {
    const ticketId = customId.split(":")[1];
    const ticket = getTicket(ticketId);
    if (!ticket) return true;

    if (interaction.user.id !== ticket.userId && !isCommandAllowedUser(interaction.user.id)) {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "⛔ Accès refusé",
        description: "Seul l'auteur du ticket peut demander une modification.",
      });
      return true;
    }

    const modal = new ModalBuilder()
      .setCustomId(`ticket_mod_modal:${ticket.id}`)
      .setTitle("Demander une modification");

    const modInput = new TextInputBuilder()
      .setCustomId("modifications_text")
      .setLabel("Quelles modifications souhaitez-vous ?")
      .setPlaceholder(
        "Quelles modifications souhaitez-vous apporter au design ? (Obligatoire)"
      )
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(3800);
    if (ticket.pendingModText) {
      modInput.setValue(ticket.pendingModText.slice(0, 3800));
    }

    modal.addComponents(new ActionRowBuilder().addComponents(modInput));
    await interaction.showModal(modal);
    return true;
  }

  // 10) Soumission de la modale de modification (texte obligatoire + possibilité d'ajouter des images)
  if (interaction.isModalSubmit() && customId.startsWith("ticket_mod_modal:")) {
    const ticketId = customId.split(":")[1];
    const ticket = getTicket(ticketId);
    if (!ticket) return true;

    const modText = interaction.fields.getTextInputValue("modifications_text").trim();
    const urls = extractUrls(modText);

    ticket.pendingModText = modText;
    ticket.pendingModLinks = urls;
    if (ticket.status !== "awaiting_modification_submit") {
      ticket.pendingModFiles = [];
      ticket.status = "awaiting_modification_submit";
    }
    saveTicket(ticket);

    await interaction.deferReply();
    const draftMsg = await interaction.editReply(buildModificationDraftPayload(ticket));
    ticket.modDraftMessageId = draftMsg.id;
    saveTicket(ticket);
    return true;
  }

  // 11) Confirmation d'envoi de la demande de modification (texte + éventuelles images) à 520496557146243072
  if (interaction.isButton() && customId.startsWith("ticket_submit_mod:")) {
    const ticketId = customId.split(":")[1];
    const ticket = getTicket(ticketId);
    if (!ticket) return true;

    if (interaction.user.id !== ticket.userId && !isCommandAllowedUser(interaction.user.id)) {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "⛔ Accès refusé",
        description: "Seul l'auteur du ticket peut envoyer cette demande.",
      });
      return true;
    }

    await interaction.deferUpdate();

    try {
      await sendRequestToOwnerDm(interaction.client, ticket, { isModification: true });

      ticket.round = (ticket.round || 1) + 1;
      ticket.currentPreviewFiles = [];
      ticket.currentFinalFiles = [];
      ticket.pendingModText = "";
      ticket.pendingModFiles = [];
      ticket.pendingModLinks = [];
      ticket.modDraftMessageId = null;
      ticket.status = "pending_designer";
      saveTicket(ticket);

      await interaction.editReply(
        buildElysiumPayload({
          color: ELYSIUM_INFO,
          title: "⏳ Demande de modification envoyée",
          description:
            "Vos modifications ont bien été transmises ! **Merci de patienter** pendant la mise à jour de votre design, un nouveau preview vous sera envoyé ici dès qu'il sera prêt.",
          components: [],
        })
      );
    } catch (err) {
      console.error("[ticket_submit_mod]", err);
      await interaction.followUp(
        buildElysiumPayload({
          ephemeral: true,
          color: ELYSIUM_ERROR,
          title: "❌ Erreur lors de l'envoi",
          description: err.message || "Impossible d'envoyer la demande de modification.",
        })
      );
    }
    return true;
  }

  // 12) Dans le ticket : le client clique sur "Accepter" -> envoi de TOUS les fichiers finaux + incitation au don PayPal
  if (interaction.isButton() && customId.startsWith("ticket_client_accept:")) {
    const ticketId = customId.split(":")[1];
    const ticket = getTicket(ticketId);
    if (!ticket) return true;

    if (interaction.user.id !== ticket.userId && !isCommandAllowedUser(interaction.user.id)) {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "⛔ Accès refusé",
        description: "Seul l'auteur du ticket peut accepter la commande.",
      });
      return true;
    }

    if (ticket.status === "completed") {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_INFO,
        title: "ℹ️ Commande déjà validée",
        description: "Vos fichiers finaux vous ont déjà été envoyés ci-dessus !",
      });
      return true;
    }

    await interaction.deferUpdate();

    try {
      // Désactive les boutons du message de preview pour éviter les doubles clics
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
          buildElysiumPayload({
            content: `<@${ticket.userId}>`,
            color: ELYSIUM_SUCCESS,
            title: "🎉 Design validé !",
            description: "Merci d'avoir validé votre design !",
          })
        );
      } else {
        for (let offset = 0; offset < resolvedAttachments.length; offset += BATCH_SIZE) {
          const chunk = resolvedAttachments.slice(offset, offset + BATCH_SIZE);
          const totalBatches = Math.ceil(resolvedAttachments.length / BATCH_SIZE);
          const currentBatch = Math.floor(offset / BATCH_SIZE) + 1;

          await interaction.channel.send(
            buildElysiumPayload({
              content: offset === 0 ? `<@${ticket.userId}>` : undefined,
              color: ELYSIUM_SUCCESS,
              title:
                totalBatches > 1
                  ? `📦 Vos fichiers finaux (${currentBatch}/${totalBatches})`
                  : "📦 Voici l'ensemble de vos fichiers finaux !",
              description:
                offset === 0
                  ? `Merci <@${ticket.userId}> pour votre validation ! Vous trouverez ci-joint tous les fichiers haute qualité de votre commande.`
                  : "Suite de vos fichiers finaux :",
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
        buildElysiumPayload({
          color: ELYSIUM_GOLD,
          title: "💛 Soutenez Elysium Esport !",
          description: [
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
            buildElysiumPayload({
              color: ELYSIUM_SUCCESS,
              title: `✅ Commande acceptée — #${ticket.channelName}`,
              description: `<@${ticket.userId}> a accepté le preview dans <#${ticket.channelId}> ! Tous les fichiers finaux (**${resolvedAttachments.length}**) ainsi que le lien de donation PayPal lui ont été envoyés.`,
            })
          )
          .catch(() => null);
      }
    } catch (err) {
      console.error("[ticket_client_accept]", err);
      await interaction.followUp(
        buildElysiumPayload({
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
