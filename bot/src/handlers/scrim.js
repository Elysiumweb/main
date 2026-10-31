import { MessageFlags, SlashCommandBuilder } from "discord.js";
import {
  DEFAULT_TIMEZONE,
  ELYSIUM_ERROR,
  ELYSIUM_GOLD,
  ELYSIUM_INFO,
  ELYSIUM_SUCCESS,
  MATCH_GUILD_ID,
  OWNER_USER_ID,
  SITE_URL,
} from "../config.js";
import {
  formatDateFr,
  getZonedParts,
  parseMatchDate,
  parseMatchTime,
  zonedDateTimeToUtcMs,
} from "../lib/dateTime.js";
import { buildElysiumPayload, respondElysium } from "../lib/embeds.js";
import {
  cancelRosterMatchesForDateOnSite,
  getPlayerByDiscordId,
  getSiteRosters,
  isFirebaseConnected,
} from "../lib/firebase.js";
import {
  cancelScheduledMatchesForRosterDate,
  cancelScrimRequestsForRosterDate,
  getActiveScrimRequestsForRosterDate,
  nextCounter,
  saveScrimRequest,
} from "../lib/store.js";

/** Délai minimum obligatoire avant le début d'un scrim : 2 heures. */
export const MIN_SCRIM_ADVANCE_MS = 2 * 60 * 60 * 1000;

const pad2 = (n) => String(n).padStart(2, "0");

const getTeamDisplayName = (roster) => {
  const clean = typeof roster === "string" ? roster.trim() : "";
  return clean ? `Elysium ${clean}` : "Elysium";
};

const CANDIDATE_HALF_HOURS = Array.from({ length: 48 }, (_, idx) => {
  const hh = Math.floor(idx / 2);
  const mm = idx % 2 === 0 ? "00" : "30";
  return `${pad2(hh)}:${mm}`;
});

export const scrimCommandDefinition = new SlashCommandBuilder()
  .setName("scrim")
  .setDescription("Lance une recherche de scrim pour votre roster (réservé aux joueurs, 2h min à l'avance)")
  .addStringOption((opt) =>
    opt
      .setName("heure")
      .setDescription("Heure de début souhaitée du scrim aujourd'hui (ex: 20:00, 21h00 — minimum 2h avant)")
      .setRequired(true)
      .setAutocomplete(true)
      .setMaxLength(16)
  );

export const cancelCommandDefinition = new SlashCommandBuilder()
  .setName("cancel")
  .setDescription("Annule tous les scrims et matchs prévus aujourd'hui pour votre roster (réservé aux joueurs)");

/** Autocomplétion intelligente proposant les créneaux horaires >= +2h aujourd'hui. */
export const handleScrimAutocomplete = async (interaction, { now = new Date() } = {}) => {
  try {
    if (!isFirebaseConnected()) {
      await interaction.respond([]);
      return;
    }
    const player = await getPlayerByDiscordId(interaction.user?.id);
    if (!player) {
      await interaction.respond([
        {
          name: "⛔ Compte Discord non lié à une fiche joueur du site",
          value: "00:00",
        },
      ]);
      return;
    }

    const focused = String(interaction.options.getFocused() || "").trim().toLowerCase();
    const nowMs = now.getTime();
    const todayIso = parseMatchDate("aujourd'hui", { now, timeZone: DEFAULT_TIMEZONE });

    const validSlots = CANDIDATE_HALF_HOURS.filter((slot) => {
      const slotMs = zonedDateTimeToUtcMs(todayIso, slot, DEFAULT_TIMEZONE);
      return slotMs - nowMs >= MIN_SCRIM_ADVANCE_MS;
    });

    // Priorise les créneaux de soirée classiques (18:00 -> 23:30), puis les autres créneaux valides
    const sortedSlots = [...validSlots].sort((a, b) => {
      const aEvening = a >= "18:00" ? 0 : 1;
      const bEvening = b >= "18:00" ? 0 : 1;
      if (aEvening !== bEvening) return aEvening - bEvening;
      return a.localeCompare(b);
    });

    const choices = [];
    if (focused && parseMatchTime(focused)) {
      const normalized = parseMatchTime(focused);
      choices.push({ name: `Créneau personnalisé : ${normalized}`, value: normalized });
    }
    for (const slot of sortedSlots) {
      if (choices.some((c) => c.value === slot)) continue;
      if (!focused || slot.includes(focused) || slot.replace(":", "h").includes(focused)) {
        choices.push({
          name: `🕒 ${slot} — ${getTeamDisplayName(player.roster)} (${player.game})`.slice(0, 100),
          value: slot,
        });
      }
      if (choices.length >= 25) break;
    }

    await interaction.respond(choices.slice(0, 25));
  } catch (err) {
    console.error("[/scrim autocomplete]", err);
    await interaction.respond([]);
  }
};

/** Vérifie que l'utilisateur Discord est bien un joueur lié sur le site et résout son roster. */
const resolveLinkedPlayerAndRoster = async (interaction) => {
  if (!isFirebaseConnected()) {
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "⚠️ Service temporairement indisponible",
      description:
        "La synchronisation avec la base joueurs Elysium n'est pas encore active. Veuillez réessayer dans un instant.",
    });
    return null;
  }

  const player = await getPlayerByDiscordId(interaction.user?.id);
  if (!player) {
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "⛔ Commande réservée aux joueurs",
      description:
        "Seuls les joueurs Elysium dont le compte Discord est relié à leur fiche joueur sur le site peuvent utiliser cette commande.",
    });
    return null;
  }

  if (!player.game) {
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "⚠️ Fiche joueur incomplète",
      description: `Votre fiche joueur (**${player.pseudo}**) n'a pas encore de jeu associé sur le site.`,
    });
    return null;
  }

  const gameRosters = await getSiteRosters(player.game);
  if (gameRosters.length > 0 && !player.roster) {
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "⚠️ Aucun roster rattaché à votre fiche",
      description: `Votre fiche joueur (**${player.pseudo}**) n'est rattachée à aucun roster **${player.game}** sur le site.`,
    });
    return null;
  }

  return player;
};

/** Envoie un message privé stylisé Elysium à l'administrateur principal 520496557146243072. */
const notifyOwnerByDm = async (client, payloadOptions) => {
  const owner = await client.users.fetch(OWNER_USER_ID);
  if (!owner) {
    throw new Error(`Utilisateur ${OWNER_USER_ID} introuvable.`);
  }
  return owner.send(buildElysiumPayload(payloadOptions));
};

/**
 * Commande `/scrim` :
 * - Réservée aux joueurs liés via `/link-discord`
 * - Exige un délai >= 2h avant le début du scrim (sinon rejet)
 * - Envoie en MP à `520496557146243072` l'heure souhaitée + le roster demandeur
 * - Répond aux joueurs en se faisant passer pour une IA de matchmaking autonome
 */
export const handleScrimCommand = async (interaction, { now = new Date() } = {}) => {
  if (interaction.guildId !== MATCH_GUILD_ID) {
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "⛔ Serveur non autorisé",
      description: "La commande `/scrim` n'est disponible que sur le serveur esport Elysium.",
    });
    return;
  }

  const player = await resolveLinkedPlayerAndRoster(interaction);
  if (!player) return;

  const rawTime = interaction.options.getString("heure", true).trim();
  const parsedTime = parseMatchTime(rawTime);
  if (!parsedTime) {
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "❌ Format d'heure invalide",
      description:
        "Veuillez indiquer une heure valide au format 24h (exemples : `20:00`, `20h30`, `21h`).",
    });
    return;
  }

  const nowMs = now.getTime();
  const todayIso = parseMatchDate("aujourd'hui", { now, timeZone: DEFAULT_TIMEZONE });
  const scrimStartMs = zonedDateTimeToUtcMs(todayIso, parsedTime, DEFAULT_TIMEZONE);
  const diffMs = scrimStartMs - nowMs;

  // Règle stricte : utilisable 2H minimum avant le début du scrim -> sinon rejet de la demande
  if (diffMs < MIN_SCRIM_ADVANCE_MS) {
    const minAllowedDate = new Date(nowMs + MIN_SCRIM_ADVANCE_MS);
    const minParts = getZonedParts(minAllowedDate, DEFAULT_TIMEZONE);
    const minAllowedHm = `${pad2(minParts.hour)}:${pad2(minParts.minute)}`;
    const minDateIso = `${minParts.year}-${pad2(minParts.month)}-${pad2(minParts.day)}`;
    const sameDayPossible = minDateIso === todayIso;

    const reasonLine =
      diffMs <= 0
        ? `Le créneau **${parsedTime}** est déjà dépassé pour aujourd'hui.`
        : `Le créneau **${parsedTime}** débute dans moins de **2 heures**.`;

    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "🤖 IA Elysium Matchmaking — Demande rejetée",
      description: [
        `⛔ **Rejet automatique : délai minimum de 2 heures requis.**`,
        "",
        reasonLine,
        "Notre IA de matchmaking a besoin d'au moins **2h00 d'avance** avant le coup d'envoi pour scanner les équipes disponibles et verrouiller un adversaire de niveau équivalent.",
        "",
        sameDayPossible
          ? `💡 Premier créneau éligible aujourd'hui : à partir de **${minAllowedHm}**.`
          : "💡 Plus aucun créneau à +2h n'est disponible avant minuit aujourd'hui.",
      ].join("\n"),
      footerText: "Elysium AI Matchmaking • Système automatisé",
    });
    return;
  }

  const teamName = getTeamDisplayName(player.roster);
  const existingForRosterToday = getActiveScrimRequestsForRosterDate({
    game: player.game,
    roster: player.roster,
    date: todayIso,
  });
  const alreadyRequestedSameHour = existingForRosterToday.find((r) => r.time === parsedTime);

  if (alreadyRequestedSameHour) {
    const startUnix = Math.floor(scrimStartMs / 1000);
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_INFO,
      title: "🤖 IA Elysium Matchmaking — Recherche déjà active",
      description: [
        `🧠 Une recherche IA est **déjà en cours** aujourd'hui sur le créneau de **${parsedTime}** (<t:${startUnix}:R>) pour **${teamName}**.`,
        "",
        "Le moteur continue de scanner les rosters disponibles et publiera automatiquement le match dès confirmation d'un adversaire.",
      ].join("\n"),
      footerText: "Elysium AI Matchmaking • Système automatisé",
    });
    return;
  }

  await interaction.deferReply();

  const reqNum = nextCounter("scrim");
  const scrimRequest = {
    id: `scrim_${reqNum}_${nowMs}`,
    date: todayIso,
    time: parsedTime,
    startAtMs: scrimStartMs,
    game: player.game,
    roster: player.roster || null,
    playerId: player.id,
    playerPseudo: player.pseudo,
    discordUserId: interaction.user.id,
    discordUsername: interaction.user.username || interaction.user.tag || "",
    channelId: interaction.channelId,
    status: "active",
    createdAt: nowMs,
  };
  saveScrimRequest(scrimRequest);

  const startUnix = Math.floor(scrimStartMs / 1000);

  // Envoi confidentiel en MP à 520496557146243072 (totalement invisible pour les joueurs)
  try {
    await notifyOwnerByDm(interaction.client, {
      color: ELYSIUM_GOLD,
      title: `🎯 Nouvelle demande de Scrim — ${teamName}`,
      description: [
        `Un joueur du roster **${teamName}** vient de demander un scrim pour aujourd'hui via \`/scrim\`.`,
      ].join("\n"),
      fields: [
        {
          name: "🛡️ Roster demandeur",
          value: `**${teamName}**`,
          inline: true,
        },
        {
          name: "🎮 Jeu",
          value: player.game,
          inline: true,
        },
        {
          name: "🕒 Heure souhaitée du scrim",
          value: `**${parsedTime}** (<t:${startUnix}:t> — <t:${startUnix}:R>)`,
          inline: false,
        },
        {
          name: "📅 Date",
          value: formatDateFr(todayIso),
          inline: true,
        },
        {
          name: "👤 Demandé par",
          value: `<@${interaction.user.id}> (**${player.pseudo}**)`,
          inline: true,
        },
        {
          name: "📍 Salon Discord",
          value: interaction.channelId ? `<#${interaction.channelId}>` : "—",
          inline: true,
        },
      ],
    });
  } catch (dmErr) {
    console.error(`[Scrim] Impossible d'envoyer le MP à ${OWNER_USER_ID} :`, dmErr.message);
  }

  // Réponse visible par les joueurs : illusion totale d'une IA autonome de recherche de scrim
  await respondElysium(interaction, {
    color: ELYSIUM_GOLD,
    title: "🤖 ELYSIUM AI MATCHMAKING — RECHERCHE LANCÉE",
    description: [
      `🧠 **L'IA Elysium vient de lancer ses recherches pour le créneau de \`${parsedTime}\` !**`,
      "",
      `Scan automatique des serveurs partenaires, analyse des disponibilités adverses et calibration du niveau pour **${teamName}** (*${player.game}*) en cours d'exécution...`,
      "Dès qu'un adversaire compatible est verrouillé sur ce créneau, la fiche du match et les paramètres du lobby seront générés automatiquement.",
    ].join("\n"),
    fields: [
      { name: "🛡️ Roster", value: `**${teamName}**`, inline: true },
      { name: "🎮 Jeu", value: player.game, inline: true },
      { name: "🕒 Créneau ciblé", value: `**${parsedTime}** (<t:${startUnix}:R>)`, inline: true },
      {
        name: "📡 Statut du moteur IA",
        value: "🟢 Scan actif des équipes disponibles...",
        inline: false,
      },
    ],
    footerText: "Elysium AI Matchmaking • Système automatisé",
  });
};

/**
 * Commande `/cancel` :
 * - Réservée aux joueurs liés via `/link-discord`
 * - Annule tous les scrims liés au roster du joueur pour la journée
 * - Passe en "Annulé" (`status: "cancelled"`) les matchs déjà notés aujourd'hui sur le site pour ce roster
 * - Préviens `520496557146243072` en MP de l'annulation des matchs/scrims du roster pour la journée
 */
export const handleCancelCommand = async (interaction, { now = new Date() } = {}) => {
  if (interaction.guildId !== MATCH_GUILD_ID) {
    await respondElysium(interaction, {
      ephemeral: true,
      color: ELYSIUM_ERROR,
      title: "⛔ Serveur non autorisé",
      description: "La commande `/cancel` n'est disponible que sur le serveur esport Elysium.",
    });
    return;
  }

  const player = await resolveLinkedPlayerAndRoster(interaction);
  if (!player) return;

  await interaction.deferReply();

  const nowMs = now.getTime();
  const todayIso = parseMatchDate("aujourd'hui", { now, timeZone: DEFAULT_TIMEZONE });
  const teamName = getTeamDisplayName(player.roster);

  // 1) Annulation des demandes /scrim actives aujourd'hui pour ce roster
  const cancelledScrims = cancelScrimRequestsForRosterDate({
    game: player.game,
    roster: player.roster,
    date: todayIso,
    cancelledBy: interaction.user.id,
    nowMs,
  });

  // 2) Arrêt des tâches planifiées locales (/ask-result) non terminées aujourd'hui pour ce roster
  cancelScheduledMatchesForRosterDate({
    game: player.game,
    roster: player.roster,
    date: todayIso,
    cancelledBy: interaction.user.id,
    nowMs,
  });

  // 3) Passage en "cancelled" (Annulé) des matchs déjà notés aujourd'hui sur le site pour ce roster
  const cancelledSiteMatches = await cancelRosterMatchesForDateOnSite({
    game: player.game,
    roster: player.roster,
    date: todayIso,
    actorDiscordId: interaction.user.id,
  });

  // 4) Notification en message privé à l'administrateur principal 520496557146243072
  try {
    const scrimListText =
      cancelledScrims.length > 0
        ? cancelledScrims
            .map((s) => `• **${s.time}** *(demandé par ${s.playerPseudo || `<@${s.discordUserId}>`})*`)
            .join("\n")
        : "*Aucune recherche `/scrim` en attente*";

    const siteMatchesText =
      cancelledSiteMatches.length > 0
        ? cancelledSiteMatches
            .map(
              (m) =>
                `• **${m.time || "Horaire non précisé"}** vs **${m.opponentName || "Adversaire"}** — passé en **Annulé** ([voir sur le site](${SITE_URL}/resultats/${m.id}))`
            )
            .join("\n")
            .slice(0, 1024)
        : "*Aucun match n'était noté aujourd'hui sur le site pour ce roster*";

    await notifyOwnerByDm(interaction.client, {
      color: ELYSIUM_ERROR,
      title: `🚫 Annulation journée — ${teamName}`,
      description: [
        `<@${interaction.user.id}> (**${player.pseudo}**) a exécuté \`/cancel\` : **tous les scrims et matchs de la journée (${formatDateFr(todayIso)}) pour ${teamName} sont annulés.**`,
      ].join("\n"),
      fields: [
        {
          name: "🛡️ Roster concerné",
          value: `**${teamName}** (${player.game})`,
          inline: true,
        },
        {
          name: "👤 Annulé par",
          value: `<@${interaction.user.id}> (**${player.pseudo}**)`,
          inline: true,
        },
        {
          name: `📅 Demandes de scrim annulées (${cancelledScrims.length})`,
          value: scrimListText,
          inline: false,
        },
        {
          name: `🌐 Matchs du site passés en « Annulé » (${cancelledSiteMatches.length})`,
          value: siteMatchesText,
          inline: false,
        },
      ],
    });
  } catch (dmErr) {
    console.error(`[Cancel] Impossible d'envoyer le MP d'annulation à ${OWNER_USER_ID} :`, dmErr.message);
  }

  // 5) Réponse côté joueurs (toujours cohérente avec l'IA, sans mentionner 520496557146243072)
  const summaryLines = [
    `🛑 Toutes les recherches et sessions de scrims de la journée (**${formatDateFr(todayIso)}**) pour **${teamName}** ont bien été **annulées**.`,
  ];

  if (cancelledScrims.length > 0) {
    summaryLines.push(
      `• **${cancelledScrims.length}** recherche(s) IA arrêtée(s) (${cancelledScrims.map((s) => `\`${s.time}\``).join(", ")}).`
    );
  }
  if (cancelledSiteMatches.length > 0) {
    summaryLines.push(
      `• **${cancelledSiteMatches.length}** match(s) prévu(s) aujourd'hui sur le site ${cancelledSiteMatches.length > 1 ? "ont été passés" : "a été passé"} en statut **Annulé** (${cancelledSiteMatches.map((m) => `vs **${m.opponentName || "Adversaire"}**`).join(", ")}).`
    );
  }
  if (cancelledScrims.length === 0 && cancelledSiteMatches.length === 0) {
    summaryLines.push(
      "• Aucun créneau actif ni match publié aujourd'hui n'était en cours, le verrouillage d'annulation pour la journée est pris en compte."
    );
  }

  await respondElysium(interaction, {
    color: ELYSIUM_SUCCESS,
    title: `✅ Annulation enregistrée — ${teamName}`,
    description: summaryLines.join("\n\n"),
    footerText: "Elysium AI Matchmaking • Système automatisé",
  });
};
