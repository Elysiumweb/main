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
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  DEFAULT_TIMEZONE,
  ELYSIUM_ERROR,
  ELYSIUM_GOLD,
  ELYSIUM_INFO,
  ELYSIUM_SUCCESS,
  MATCH_FILES_DIR,
  MATCH_GUILD_ID,
  SITE_URL,
} from "../config.js";
import { computeMatchSchedule, formatDateFr } from "../lib/dateTime.js";
import { buildElysiumPayload, respondElysium } from "../lib/embeds.js";
import {
  completeMatchOnSite,
  createUpcomingMatchOnSite,
  getKnownOpponents,
  getSiteGames,
  getSitePlayers,
  getSiteRosters,
  isFirebaseConnected,
  saveImageToSiteBank,
  upsertOpponentOnSite,
} from "../lib/firebase.js";
import {
  downloadAttachmentBuffer,
  isImageAttachment,
  processOpponentLogoBuffer,
} from "../lib/imageProcessor.js";
import { ensureAllowedCommandUser, isCommandAllowedUser } from "../lib/permissions.js";
import {
  parseReplayBuffer,
  resolveReplaySideAndSeries,
} from "../lib/replayProcessor.js";
import {
  ensureDirectories,
  getPendingResultMatchesInChannel,
  getScheduledMatch,
  nextCounter,
  saveScheduledMatch,
} from "../lib/store.js";

const NO_ROSTER_VALUE = "__NO_ROSTER__";
const FORMAT_SUGGESTIONS = ["BO1", "BO3", "BO5", "BO7", "BO9", "Showmatch", " Championnat"];

const getTeamDisplayName = (roster) => {
  const clean = typeof roster === "string" ? roster.trim() : "";
  return clean ? `Elysium ${clean}` : "Elysium";
};

const extractChannelId = (raw = "") => {
  const clean = String(raw || "").trim();
  const mention = /^<#(\d{15,22})>$/.exec(clean);
  if (mention) return mention[1];
  const digits = /^(\d{15,22})$/.exec(clean);
  if (digits) return digits[1];
  return "";
};

export const askResultDefinition = new SlashCommandBuilder()
  .setName("ask-result")
  .setDescription("Programme un match Elysium sur Discord et le crée automatiquement sur le site")
  .addStringOption((opt) =>
    opt
      .setName("jeu")
      .setDescription("Quel jeu ? (liste issue du site)")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("roster")
      .setDescription("Quel roster ? (liste issue du site selon le jeu choisi)")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("date")
      .setDescription("Date du match (ex: 30/10/2026 ou 2026-10-30 ou aujourd'hui)")
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("heure_match")
      .setDescription("Heure de début du match (ex: 20:00)")
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("heure_fin")
      .setDescription("Heure de fin du match (ex: 21:00)")
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("format")
      .setDescription("Format du match (ex: BO5, BO7, BO3...)")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("nom_match")
      .setDescription("Identifiant / Nom du match (lobby)")
      .setRequired(true)
      .setMaxLength(120)
  )
  .addStringOption((opt) =>
    opt
      .setName("mot_de_passe")
      .setDescription("Mot de passe du match (lobby)")
      .setRequired(true)
      .setMaxLength(120)
  )
  .addStringOption((opt) =>
    opt
      .setName("equipe_adverse")
      .setDescription("Nom de l'équipe adverse")
      .setRequired(true)
      .setAutocomplete(true)
      .setMaxLength(100)
  )
  .addAttachmentOption((opt) =>
    opt
      .setName("logo_adversaire")
      .setDescription("Logo de l'équipe adverse (image PNG, JPG, WEBP...)")
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("id_channel")
      .setDescription("Salon ou ID du salon où envoyer les annonces et demander les replays")
      .setRequired(true)
      .setAutocomplete(true)
  );

export const handleAskResultAutocomplete = async (interaction) => {
  if (!isCommandAllowedUser(interaction.user?.id)) {
    await interaction.respond([]);
    return;
  }

  try {
    const focusedOpt = interaction.options.getFocused(true);
    const query = String(focusedOpt.value || "").trim().toLowerCase();

    if (focusedOpt.name === "jeu") {
      const games = await getSiteGames();
      const filtered = games.filter((g) => !query || g.toLowerCase().includes(query));
      await interaction.respond(
        filtered.slice(0, 25).map((g) => ({ name: g, value: g }))
      );
      return;
    }

    if (focusedOpt.name === "roster") {
      const selectedGame = String(interaction.options.getString("jeu") || "").trim();
      const rosters = await getSiteRosters(selectedGame);
      if (rosters.length === 0) {
        await interaction.respond([
          {
            name: selectedGame
              ? `Équipe principale ${selectedGame} (aucun sous-roster sur le site)`
              : "Sélectionnez d'abord un jeu (ou équipe principale)",
            value: NO_ROSTER_VALUE,
          },
        ]);
        return;
      }
      const filtered = rosters.filter(
        (r) => !query || r.name.toLowerCase().includes(query) || r.game.toLowerCase().includes(query)
      );
      await interaction.respond(
        filtered.slice(0, 25).map((r) => ({
          name: selectedGame ? r.name : `${r.name} (${r.game})`,
          value: r.name,
        }))
      );
      return;
    }

    if (focusedOpt.name === "format") {
      const suggestions = FORMAT_SUGGESTIONS.map((s) => s.trim());
      const list = query && !suggestions.some((s) => s.toLowerCase() === query)
        ? [focusedOpt.value.trim(), ...suggestions]
        : suggestions;
      await interaction.respond(
        list
          .filter((f) => !query || f.toLowerCase().includes(query))
          .slice(0, 25)
          .map((f) => ({ name: f, value: f }))
      );
      return;
    }

    if (focusedOpt.name === "equipe_adverse") {
      const opponents = await getKnownOpponents();
      const matches = opponents
        .filter((o) => !query || o.name.toLowerCase().includes(query))
        .map((o) => o.name);
      const list =
        focusedOpt.value.trim() &&
        !matches.some((m) => m.toLowerCase() === focusedOpt.value.trim().toLowerCase())
          ? [focusedOpt.value.trim(), ...matches]
          : matches;
      await interaction.respond(
        list.slice(0, 25).map((name) => ({ name: name.slice(0, 100), value: name.slice(0, 100) }))
      );
      return;
    }

    if (focusedOpt.name === "id_channel") {
      const guild = interaction.guild;
      const choices = [];
      const directId = extractChannelId(focusedOpt.value);
      if (directId) {
        const ch = guild?.channels?.cache?.get(directId);
        choices.push({
          name: ch ? `#${ch.name} (${directId})` : `ID du salon : ${directId}`,
          value: directId,
        });
      }
      if (guild) {
        const textChannels = [...guild.channels.cache.values()].filter(
          (ch) =>
            ch.type === ChannelType.GuildText ||
            ch.type === ChannelType.GuildAnnouncement
        );
        for (const ch of textChannels) {
          if (choices.some((c) => c.value === ch.id)) continue;
          const label = `#${ch.name} (${ch.id})`;
          if (!query || label.toLowerCase().includes(query)) {
            choices.push({ name: label.slice(0, 100), value: ch.id });
          }
          if (choices.length >= 25) break;
        }
      }
      await interaction.respond(choices.slice(0, 25));
      return;
    }

    await interaction.respond([]);
  } catch (err) {
    console.error("[/ask-result autocomplete]", err);
    await interaction.respond([]);
  }
};

export const handleAskResultCommand = async (interaction) => {
  if (interaction.guildId !== MATCH_GUILD_ID) {
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "⛔ Serveur non autorisé",
      description: "La commande `/ask-result` n'est disponible que sur le serveur esport Elysium.",
    });
    return;
  }
  if (!(await ensureAllowedCommandUser(interaction))) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!isFirebaseConnected()) {
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "⚠️ Connexion au site requise",
      description:
        "Le bot doit être connecté à Firebase Firestore pour créer le match sur le site. Placez `serviceAccountKey.json` dans `bot/` ou configurez `FIREBASE_SERVICE_ACCOUNT_JSON` dans `bot/.env`.",
    });
    return;
  }

  const game = interaction.options.getString("jeu", true).trim();
  const rawRoster = interaction.options.getString("roster", true).trim();
  const roster = rawRoster === NO_ROSTER_VALUE ? null : rawRoster;
  const dateInput = interaction.options.getString("date", true).trim();
  const startTimeInput = interaction.options.getString("heure_match", true).trim();
  const endTimeInput = interaction.options.getString("heure_fin", true).trim();
  const format = interaction.options.getString("format", true).trim();
  const lobbyName = interaction.options.getString("nom_match", true).trim();
  const lobbyPassword = interaction.options.getString("mot_de_passe", true).trim();
  const opponentName = interaction.options.getString("equipe_adverse", true).trim();
  const logoAttachment = interaction.options.getAttachment("logo_adversaire", true);
  const rawChannelId = interaction.options.getString("id_channel", true).trim();

  // 1) Validation du jeu et du roster par rapport au site
  const siteGames = await getSiteGames();
  const matchedGame = siteGames.find((g) => g.toLowerCase() === game.toLowerCase());
  if (!matchedGame) {
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "❌ Jeu invalide",
      description: `Le jeu \`${game}\` n'existe pas sur le site. Jeux disponibles : ${siteGames.map((g) => `\`${g}\``).join(", ")}.`,
    });
    return;
  }

  const siteRosters = await getSiteRosters(matchedGame);
  let resolvedRoster = null;
  if (siteRosters.length > 0) {
    const foundRoster = siteRosters.find(
      (r) => r.name.toLowerCase() === String(roster || "").toLowerCase()
    );
    if (!foundRoster) {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "❌ Roster introuvable sur le site",
        description: `Veuillez choisir un roster existant pour **${matchedGame}** : ${siteRosters.map((r) => `\`${r.name}\``).join(", ")}.`,
      });
      return;
    }
    resolvedRoster = foundRoster.name;
  }

  // 2) Validation du salon cible
  const channelId = extractChannelId(rawChannelId);
  const targetChannel = channelId
    ? interaction.guild.channels.cache.get(channelId) ||
      (await interaction.guild.channels.fetch(channelId).catch(() => null))
    : null;

  if (!targetChannel || !targetChannel.isTextBased()) {
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "❌ Salon introuvable",
      description: `Impossible de trouver un salon textuel avec l'identifiant \`${rawChannelId}\` sur ce serveur.`,
    });
    return;
  }

  // 3) Validation de la date et des horaires
  const schedule = computeMatchSchedule({
    dateInput,
    startTimeInput,
    endTimeInput,
    timeZone: DEFAULT_TIMEZONE,
  });
  if (!schedule.ok) {
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "❌ Date ou horaire invalide",
      description: schedule.error,
    });
    return;
  }

  // 4) Validation & compression du logo de l'équipe adverse
  if (!isImageAttachment(logoAttachment)) {
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "❌ Logo invalide",
      description: "Veuillez fournir une image valide (PNG, JPG, WEBP, GIF) pour le logo de l'équipe adverse.",
    });
    return;
  }

  try {
    ensureDirectories();
    const rawLogoBuffer = await downloadAttachmentBuffer(logoAttachment.url);
    const { dataUrl, mime, bytes, discordThumbnailBuffer } =
      await processOpponentLogoBuffer(rawLogoBuffer);

    // Enregistrement du logo dans la banque d'images Firestore + fiche adversaire + création du match ("upcoming" ou "live" si déjà en cours)
    await saveImageToSiteBank({ dataUrl, mime, bytes, folder: "matches" });
    await upsertOpponentOnSite({ name: opponentName, logoDataUrl: dataUrl });

    const nowMs = Date.now();
    const alreadyInProgress = nowMs >= schedule.startAtMs && nowMs < schedule.endAtMs;

    const createdMatch = await createUpcomingMatchOnSite({
      game: matchedGame,
      roster: resolvedRoster,
      opponentName,
      opponentLogo: dataUrl,
      date: schedule.date,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      format,
      timezone: schedule.timeZone,
      initialStatus: alreadyInProgress ? "live" : "upcoming",
      actorDiscordId: interaction.user.id,
    });

    const jobNum = nextCounter("match");
    const jobId = `match_${jobNum}_${Date.now()}`;
    const logoLocalPath = path.join(MATCH_FILES_DIR, `${jobId}_opponent.png`);
    fs.writeFileSync(logoLocalPath, discordThumbnailBuffer);

    const matchJob = {
      id: jobId,
      siteMatchId: createdMatch.id,
      guildId: interaction.guildId,
      channelId: targetChannel.id,
      createdBy: interaction.user.id,
      game: matchedGame,
      roster: resolvedRoster,
      opponentName,
      format,
      lobbyName,
      lobbyPassword,
      date: schedule.date,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      startAtMs: schedule.startAtMs,
      endAtMs: schedule.endAtMs,
      logoLocalPath,
      liveStatusSet: alreadyInProgress,
      startSent: false,
      endPromptSent: false,
      endPromptMessageId: null,
      completed: false,
      cancelled: false,
      uploadedReplays: [],
      declaredScoreUs: null,
      declaredScoreThem: null,
      confirmNoReplay: false,
      activeUploadAt: 0,
    };

    saveScheduledMatch(matchJob);

    const startUnix = Math.floor(schedule.startAtMs / 1000);
    const endUnix = Math.floor(schedule.endAtMs / 1000);
    const teamName = getTeamDisplayName(resolvedRoster);
    const matchUrl = `${SITE_URL}/resultats/${createdMatch.id}`;

    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_SUCCESS,
      title: "✅ Match programmé & publié sur le site !",
      description: [
        `Le match **${teamName} vs ${opponentName}** a été créé sur le site avec le statut **${alreadyInProgress ? "En direct" : "À venir"}** ([voir la fiche du site](${matchUrl})).`,
        "",
        `📢 **À l'heure du début** (<t:${startUnix}:F> — <t:${startUnix}:R>), le match passe en **En direct** sur le site et le bot envoie la présentation + les identifiants du lobby dans <#${targetChannel.id}>.`,
        `🏁 **À l'heure de fin** (<t:${endUnix}:t>), le bot demandera tous les replays et le score dans <#${targetChannel.id}> pour mettre à jour le site automatiquement.`,
      ].join("\n"),
      fields: [
        { name: "🎮 Jeu & Roster", value: `${matchedGame}${resolvedRoster ? ` · ${resolvedRoster}` : ""}`, inline: true },
        { name: "🆚 Adversaire", value: opponentName, inline: true },
        { name: "📐 Format", value: format, inline: true },
        { name: "📅 Date & Horaires", value: `${formatDateFr(schedule.date)} • ${schedule.startTime} → ${schedule.endTime}`, inline: true },
        { name: "🔑 Lobby (confidentiel jusqu'au match)", value: `Nom : \`${lobbyName}\`\nMDP : \`${lobbyPassword}\``, inline: true },
        { name: "📍 Salon cible", value: `<#${targetChannel.id}>`, inline: true },
      ],
    });
  } catch (err) {
    console.error("[/ask-result]", err);
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "❌ Impossible de programmer le match",
      description: err.message || "Une erreur est survenue lors de la création du match.",
    });
  }
};

/**
 * Envoie la présentation du match + identifiants du lobby à l'heure du match dans le salon cible.
 */
export const sendMatchStartAnnouncement = async (client, matchJob) => {
  const channel = await client.channels.fetch(matchJob.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    throw new Error(`Salon ${matchJob.channelId} introuvable pour l'annonce de début.`);
  }

  const teamName = getTeamDisplayName(matchJob.roster);
  const endUnix = Math.floor(matchJob.endAtMs / 1000);
  const matchUrl = `${SITE_URL}/resultats/${matchJob.siteMatchId}`;

  const extraFiles = [];
  let thumbnailUrl = "";
  if (matchJob.logoLocalPath && fs.existsSync(matchJob.logoLocalPath)) {
    extraFiles.push(
      new AttachmentBuilder(matchJob.logoLocalPath, { name: "opponent-logo.png" })
    );
    thumbnailUrl = "attachment://opponent-logo.png";
  }

  const payload = buildElysiumPayload({
    color: ELYSIUM_GOLD,
    title: `⚔️ COUP D'ENVOI — ${teamName.toUpperCase()} VS ${matchJob.opponentName.toUpperCase()}`,
    url: matchUrl,
    thumbnailUrl,
    extraFiles,
    description: [
      `🔥 C'est l'heure du match pour **${teamName}** face à **${matchJob.opponentName}** !`,
      "",
      "🏠 **C'est la Elysium qui ouvre le lobby !** Retrouvez ci-dessous tous les paramètres de connexion pour rejoindre la partie. Bon match à tous ! 💪",
    ].join("\n"),
    fields: [
      { name: "🎮 Jeu", value: matchJob.game, inline: true },
      { name: "🛡️ Équipe Elysium", value: teamName, inline: true },
      { name: "🆚 Équipe adverse", value: matchJob.opponentName, inline: true },
      { name: "📐 Format", value: `**${matchJob.format}**`, inline: true },
      { name: "🏠 Hôte de la partie", value: "**Elysium ouvre le match**", inline: true },
      { name: "🕒 Fin estimée", value: `<t:${endUnix}:t>`, inline: true },
      {
        name: "🔐 Identifiants du match (Lobby)",
        value: [
          `> **Nom :** \`${matchJob.lobbyName}\``,
          `> **Mot de passe :** \`${matchJob.lobbyPassword}\``,
        ].join("\n"),
        inline: false,
      },
    ],
  });

  await channel.send(payload);
};

/** Construit le message interactif de fin de match (collecte illimitée de replays + score). */
export const buildMatchEndPromptPayload = (matchJob) => {
  const teamName = getTeamDisplayName(matchJob.roster);
  const replays = Array.isArray(matchJob.uploadedReplays) ? matchJob.uploadedReplays : [];
  const hasScore =
    matchJob.declaredScoreUs !== null &&
    matchJob.declaredScoreUs !== undefined &&
    matchJob.declaredScoreThem !== null &&
    matchJob.declaredScoreThem !== undefined;

  const replayLines =
    replays.length === 0
      ? "*Aucun fichier `.replay` importé pour l'instant.*"
      : replays
          .slice(0, 15)
          .map(
            (g, idx) =>
              `**${idx + 1}.** \`${g.fileName || `Game_${idx + 1}.replay`}\` — ${g.map || "Carte"} *(Bleu ${g.blueScore} – ${g.orangeScore} Orange)*`
          )
          .concat(
            replays.length > 15 ? [`*... et ${replays.length - 15} autre(s) replay(s).*`] : []
          )
          .join("\n");

  const scoreText = hasScore
    ? `**${matchJob.declaredScoreUs}** ${teamName} — **${matchJob.declaredScoreThem}** ${matchJob.opponentName}`
    : "*Non renseigné — cliquez sur « Entrer le score »*";

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`match_upload_hint:${matchJob.id}`)
      .setLabel("Importer des replays")
      .setEmoji("📂")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`match_score_btn:${matchJob.id}`)
      .setLabel(hasScore ? "Modifier le score" : "Entrer le score")
      .setEmoji("🔢")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`match_clear_replays:${matchJob.id}`)
      .setLabel("Vider les replays")
      .setEmoji("🗑️")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(replays.length === 0),
    new ButtonBuilder()
      .setCustomId(`match_submit_result:${matchJob.id}`)
      .setLabel("Envoyer")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
  );

  return buildElysiumPayload({
    color: ELYSIUM_GOLD,
    title: `🏁 FIN DU MATCH — ${teamName} vs ${matchJob.opponentName}`,
    description: [
      `Le match **${teamName}** contre **${matchJob.opponentName}** (*${matchJob.format}*) est terminé !`,
      "",
      "Pour mettre à jour automatiquement le site avec les résultats et statistiques :",
      "1️⃣ **Importez tous les fichiers `.replay`** du match en les déposant directement dans ce salon *(en un ou plusieurs messages, autant de fichiers `.replay` que nécessaire)*.",
      `2️⃣ **Renseignez le score final** via le bouton **🔢 Entrer le score** *(ex: 4 Elysium – 1 ${matchJob.opponentName})*.`,
      "3️⃣ Cliquez sur **✅ Envoyer** une fois que tous les replays et le score sont prêts !",
    ].join("\n"),
    fields: [
      {
        name: `📂 Replays importés (${replays.length})`,
        value: replayLines,
        inline: false,
      },
      {
        name: "🏆 Score déclaré",
        value: scoreText,
        inline: false,
      },
    ],
    components: [row],
  });
};

/** Envoie la demande de replays et de score à l'heure de fin du match. */
export const sendMatchEndPrompt = async (client, matchJob) => {
  const channel = await client.channels.fetch(matchJob.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    throw new Error(`Salon ${matchJob.channelId} introuvable pour la demande de résultats.`);
  }

  const payload = buildMatchEndPromptPayload(matchJob);
  const sent = await channel.send(payload);
  matchJob.endPromptMessageId = sent.id;
  matchJob.activeUploadAt = Date.now();
  saveScheduledMatch(matchJob);
};

/** Rafraîchit le panneau de fin de match dans le salon après ajout de replays ou saisie du score. */
const refreshMatchEndPromptMessage = async (channel, matchJob) => {
  if (!matchJob.endPromptMessageId || !channel?.messages) return;
  try {
    const msg = await channel.messages.fetch(matchJob.endPromptMessageId);
    if (msg) {
      await msg.edit(buildMatchEndPromptPayload(matchJob));
    }
  } catch (err) {
    console.warn("[MatchEnd] Rafraîchissement du panneau ignoré :", err.message);
  }
};

/**
 * Détecte automatiquement les fichiers `.replay` envoyés dans un salon où un match attend ses résultats.
 * Permet d'envoyer n'importe quel nombre de replays en 1 ou N messages avant de cliquer sur Envoyer.
 */
export const handleMatchReplayAttachments = async (message) => {
  if (message.author?.bot || !message.guild || message.guild.id !== MATCH_GUILD_ID) return false;
  if (!message.attachments || message.attachments.size === 0) return false;

  const replayAttachments = [...message.attachments.values()].filter((att) =>
    String(att.name || "").toLowerCase().endsWith(".replay")
  );
  if (replayAttachments.length === 0) return false;

  const pendingMatches = getPendingResultMatchesInChannel(message.channelId);
  if (pendingMatches.length === 0) return false;

  const matchJob = pendingMatches[0];
  if (!Array.isArray(matchJob.uploadedReplays)) matchJob.uploadedReplays = [];

  let addedCount = 0;
  let duplicateCount = 0;
  const errors = [];

  for (const att of replayAttachments) {
    try {
      const buffer = await downloadAttachmentBuffer(att.url);
      const parsed = parseReplayBuffer(buffer, att.name);
      const isExactDuplicate = matchJob.uploadedReplays.some(
        (existing) => existing.replayId && existing.replayId === parsed.replayId
      );
      if (isExactDuplicate) {
        duplicateCount += 1;
        continue;
      }
      matchJob.uploadedReplays.push(parsed);
      addedCount += 1;
    } catch (err) {
      errors.push(`\`${att.name}\` : ${err.message}`);
    }
  }

  matchJob.confirmNoReplay = false;
  saveScheduledMatch(matchJob);

  try {
    await message.react(addedCount > 0 ? "✅" : "⚠️");
  } catch {
    // ignore permission réaction
  }

  await refreshMatchEndPromptMessage(message.channel, matchJob);

  if (errors.length > 0 || duplicateCount > 0) {
    const notes = [];
    if (addedCount > 0) notes.push(`✅ **${addedCount}** replay(s) ajouté(s) (total : **${matchJob.uploadedReplays.length}**).`);
    if (duplicateCount > 0) notes.push(`ℹ️ **${duplicateCount}** replay(s) identique(s) déjà présent(s) ignoré(s).`);
    if (errors.length > 0) notes.push(`⚠️ Fichier(s) non reconnu(s) :\n${errors.join("\n")}`);
    await message.reply(
      buildElysiumPayload({
        color: errors.length > 0 ? ELYSIUM_ERROR : ELYSIUM_INFO,
        title: "📂 Import des replays",
        description: notes.join("\n\n"),
      })
    );
  }

  return true;
};

/** Gestion des boutons et modales liés à la collecte des résultats de fin de match. */
export const handleMatchResultInteraction = async (interaction) => {
  const customId = String(interaction.customId || "");

  // Bouton : activer / expliquer l'import illimité de replays
  if (interaction.isButton() && customId.startsWith("match_upload_hint:")) {
    const jobId = customId.split(":")[1];
    const matchJob = getScheduledMatch(jobId);
    if (!matchJob || matchJob.completed || matchJob.cancelled) {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_INFO,
        title: matchJob?.cancelled ? "🚫 Match annulé" : "ℹ️ Match déjà clôturé",
        description: matchJob?.cancelled
          ? "Ce match a été annulé pour la journée."
          : "Ce match a déjà été validé et mis à jour sur le site.",
      });
      return true;
    }

    matchJob.activeUploadAt = Date.now();
    saveScheduledMatch(matchJob);

    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_INFO,
      title: "📂 Importez vos fichiers .replay",
      description: [
        `Envoyez directement vos fichiers \`.replay\` dans ce salon (<#${matchJob.channelId}>) !`,
        "",
        "• Vous pouvez envoyer **autant de fichiers `.replay` que nécessaire**, en **un seul ou plusieurs messages**.",
        "• Chaque fichier envoyé mettra à jour le compteur ci-dessus automatiquement.",
        "• Une fois tous les replays chargés et le score renseigné, cliquez sur **✅ Envoyer**.",
      ].join("\n"),
    });
    return true;
  }

  // Bouton : vider la liste des replays avant envoi
  if (interaction.isButton() && customId.startsWith("match_clear_replays:")) {
    const jobId = customId.split(":")[1];
    const matchJob = getScheduledMatch(jobId);
    if (!matchJob || matchJob.completed || matchJob.cancelled) return true;

    matchJob.uploadedReplays = [];
    matchJob.confirmNoReplay = false;
    saveScheduledMatch(matchJob);

    await interaction.update(buildMatchEndPromptPayload(matchJob));
    return true;
  }

  // Bouton : ouvrir la modale de saisie du score
  if (interaction.isButton() && customId.startsWith("match_score_btn:")) {
    const jobId = customId.split(":")[1];
    const matchJob = getScheduledMatch(jobId);
    if (!matchJob || matchJob.completed || matchJob.cancelled) {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_INFO,
        title: matchJob?.cancelled ? "🚫 Match annulé" : "ℹ️ Match déjà clôturé",
        description: matchJob?.cancelled
          ? "Ce match a été annulé."
          : "Ce match a déjà été validé sur le site.",
      });
      return true;
    }

    const teamName = getTeamDisplayName(matchJob.roster);
    const modal = new ModalBuilder()
      .setCustomId(`match_score_modal:${matchJob.id}`)
      .setTitle("Score final du match");

    const scoreUsInput = new TextInputBuilder()
      .setCustomId("score_us")
      .setLabel(`Score ${teamName}`.slice(0, 45))
      .setPlaceholder("Ex : 4")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(3);
    if (matchJob.declaredScoreUs !== null && matchJob.declaredScoreUs !== undefined) {
      scoreUsInput.setValue(String(matchJob.declaredScoreUs));
    }

    const scoreThemInput = new TextInputBuilder()
      .setCustomId("score_them")
      .setLabel(`Score ${matchJob.opponentName}`.slice(0, 45))
      .setPlaceholder("Ex : 1")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(3);
    if (matchJob.declaredScoreThem !== null && matchJob.declaredScoreThem !== undefined) {
      scoreThemInput.setValue(String(matchJob.declaredScoreThem));
    }

    modal.addComponents(
      new ActionRowBuilder().addComponents(scoreUsInput),
      new ActionRowBuilder().addComponents(scoreThemInput)
    );

    await interaction.showModal(modal);
    return true;
  }

  // Soumission de la modale de score
  if (interaction.isModalSubmit() && customId.startsWith("match_score_modal:")) {
    const jobId = customId.split(":")[1];
    const matchJob = getScheduledMatch(jobId);
    if (!matchJob || matchJob.completed) return true;

    const rawUs = interaction.fields.getTextInputValue("score_us").trim();
    const rawThem = interaction.fields.getTextInputValue("score_them").trim();

    if (!/^\d+$/.test(rawUs) || !/^\d+$/.test(rawThem)) {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "❌ Score invalide",
        description: "Veuillez entrer uniquement des nombres entiers positifs (ex : `4` et `1`).",
      });
      return true;
    }

    matchJob.declaredScoreUs = Number(rawUs);
    matchJob.declaredScoreThem = Number(rawThem);
    saveScheduledMatch(matchJob);

    await refreshMatchEndPromptMessage(interaction.channel, matchJob);

    const teamName = getTeamDisplayName(matchJob.roster);
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_SUCCESS,
      title: "✅ Score enregistré",
      description: `Score pris en compte : **${matchJob.declaredScoreUs}** ${teamName} — **${matchJob.declaredScoreThem}** ${matchJob.opponentName}.\nVérifiez que tous vos replays sont importés puis cliquez sur **✅ Envoyer** !`,
    });
    return true;
  }

  // Bouton : valider et envoyer tous les replays + score sur le site
  if (interaction.isButton() && customId.startsWith("match_submit_result:")) {
    const [, jobId, mode] = customId.split(":");
    const matchJob = getScheduledMatch(jobId);
    if (!matchJob || matchJob.completed || matchJob.cancelled) {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_INFO,
        title: matchJob?.cancelled ? "🚫 Match annulé" : "ℹ️ Déjà envoyé",
        description: matchJob?.cancelled
          ? "Ce match a été annulé."
          : "Ce match a déjà été mis à jour sur le site.",
      });
      return true;
    }

    const hasScore =
      matchJob.declaredScoreUs !== null &&
      matchJob.declaredScoreUs !== undefined &&
      matchJob.declaredScoreThem !== null &&
      matchJob.declaredScoreThem !== undefined;

    if (!hasScore) {
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "🔢 Score manquant",
        description:
          "Veuillez d'abord renseigner le score final (ex : `4` Elysium – `1` Adversaire) en cliquant sur le bouton **🔢 Entrer le score**.",
      });
      return true;
    }

    const replays = Array.isArray(matchJob.uploadedReplays) ? matchJob.uploadedReplays : [];
    const isRocketLeague = matchJob.game.toLowerCase() === "rocket league";

    if (isRocketLeague && replays.length === 0 && mode !== "force_no_replay") {
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`match_submit_result:${matchJob.id}:force_no_replay`)
          .setLabel("Confirmer sans replay (forfait)")
          .setEmoji("⚠️")
          .setStyle(ButtonStyle.Secondary)
      );
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_INFO,
        title: "📂 Aucun replay importé",
        description: [
          "Vous n'avez pas encore déposé de fichier `.replay` dans le salon.",
          "",
          "• **Pour envoyer vos replays :** glissez-déposez vos fichiers `.replay` dans ce salon avant de cliquer sur **✅ Envoyer**.",
          "• **S'il s'agit d'un forfait sans replay :** cliquez sur le bouton ci-dessous.",
        ].join("\n"),
        components: [confirmRow],
      });
      return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Récupère les joueurs du site en priorisant ceux du roster actif pour la liaison automatique
      const allGamePlayers = await getSitePlayers({ game: matchJob.game });
      const prioritizedPlayers = [...allGamePlayers].sort((a, b) => {
        const aInRoster = matchJob.roster && a.roster === matchJob.roster ? 0 : 1;
        const bInRoster = matchJob.roster && b.roster === matchJob.roster ? 0 : 1;
        return aInRoster - bInRoster;
      });

      const resolved = resolveReplaySideAndSeries({
        games: replays,
        declaredScoreUs: matchJob.declaredScoreUs,
        declaredScoreThem: matchJob.declaredScoreThem,
        members: prioritizedPlayers,
      });

      await completeMatchOnSite({
        matchId: matchJob.siteMatchId,
        scoreUs: resolved.scoreUs,
        scoreThem: resolved.scoreThem,
        declaredScoreUs: matchJob.declaredScoreUs,
        declaredScoreThem: matchJob.declaredScoreThem,
        replays: resolved.replays,
        replaySide: resolved.side,
        maps: resolved.maps,
        players: resolved.players,
        mvp: resolved.mvp,
        actorDiscordId: interaction.user.id,
      });

      matchJob.completed = true;
      matchJob.completedAt = Date.now();
      saveScheduledMatch(matchJob);

      const teamName = getTeamDisplayName(matchJob.roster);
      const matchUrl = `${SITE_URL}/resultats/${matchJob.siteMatchId}`;
      const isWin = resolved.scoreUs > resolved.scoreThem;
      const resultLabel = isWin
        ? "🏆 VICTOIRE ELYSIUM"
        : resolved.scoreUs < resolved.scoreThem
          ? "⚔️ DÉFAITE"
          : "🤝 ÉGALITÉ";

      const fields = [
        {
          name: "📊 Score publié sur le site",
          value: `**${resolved.scoreUs}** ${teamName} — **${resolved.scoreThem}** ${matchJob.opponentName}`,
          inline: true,
        },
        {
          name: "📂 Replays enregistrés",
          value: resolved.hasReplays
            ? `${resolved.replays.length} game(s) · Équipe **${resolved.sideLabel}**`
            : "Score seul (sans replay)",
          inline: true,
        },
      ];

      if (resolved.mvpDetails) {
        fields.push({
          name: "🌟 MVP de la série",
          value: `**${resolved.mvpDetails.pseudo || resolved.mvpDetails.name}** (${resolved.mvpDetails.count}× MVP)`,
          inline: true,
        });
      }

      if (resolved.players.length > 0) {
        fields.push({
          name: "👥 Statistiques joueurs liées au site",
          value: resolved.players
            .map(
              (p) =>
                `• **${p.pseudo}** : ${p.goals} B · ${p.assists} PD · ${p.saves} Arr · ${p.shots} T · ${p.score} Pts${p.mvp ? ` · ${p.mvp}× MVP` : ""}`
            )
            .join("\n")
            .slice(0, 1024),
          inline: false,
        });
      }

      const finalPanelPayload = buildElysiumPayload({
        color: isWin ? ELYSIUM_SUCCESS : ELYSIUM_GOLD,
        title: `${resultLabel} — ${teamName} vs ${matchJob.opponentName}`,
        url: matchUrl,
        description: `✅ Le match et ses replays ont été publiés sur le site avec le statut **Terminé** !\n🔗 [Consulter la page du match sur le site](${matchUrl})`,
        fields,
        components: [],
      });

      // Met à jour le panneau principal du salon
      if (matchJob.endPromptMessageId) {
        const targetChannel =
          interaction.guild?.channels?.cache?.get(matchJob.channelId) ||
          (await interaction.client.channels.fetch(matchJob.channelId).catch(() => null));
        if (targetChannel?.messages) {
          const promptMsg = await targetChannel.messages
            .fetch(matchJob.endPromptMessageId)
            .catch(() => null);
          if (promptMsg) {
            await promptMsg.edit(finalPanelPayload);
          } else {
            await targetChannel.send(finalPanelPayload);
          }
        }
      }

      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_SUCCESS,
        title: "✅ Site mis à jour avec succès !",
        description: `Le match **${teamName} vs ${matchJob.opponentName}** est désormais passé en **Terminé** sur [le site Elysium](${matchUrl}).`,
      });
    } catch (err) {
      console.error("[match_submit_result]", err);
      await respondElysium(interaction, {
        ephemeral: true,
        color: ELYSIUM_ERROR,
        title: "❌ Erreur lors de la mise à jour du site",
        description: err.message || "Une erreur est survenue lors de l'envoi des résultats.",
      });
    }
    return true;
  }

  return false;
};
