export const OFFICIAL_UID = process.env.REACT_APP_OFFICIAL_UID;
export const GAMES = ["EVA", "Rocket League"];
export const ROLES = ["visitor", "player", "manager", "bureau"];

// Rosters per game — EVA has no rosters, RL has Junior / Espoir / Académique / Esport
export const ROSTERS = {
  "Rocket League": ["Junior", "Espoir", "Académique", "Esport"],
  "EVA": [],
};

// Flat list of all rosters (for selects / validation)
export const ALL_ROSTERS = Object.values(ROSTERS).flat();

export const getElysiumTeamName = (roster) => {
  const label = typeof roster === "string" ? roster.trim() : "";
  return label ? `Elysium ${label}` : "Elysium";
};

/* ---- Dons / PayPal ----
   Bouton hébergé (« no-code checkout ») PayPal. Les identifiants peuvent être
   surchargés par variables d'environnement pour changer de compte sans toucher au code. */
export const PAYPAL_CLIENT_ID =
  process.env.REACT_APP_PAYPAL_CLIENT_ID ||
  "BAAbCu7rK1aJRGuvAviOgg98LkO_L8buiPNLZP7ZAHjwWMUhGgQa8G8ztm6NUXbEKef-cnKHldolelwwjs";
export const PAYPAL_HOSTED_BUTTON_ID =
  process.env.REACT_APP_PAYPAL_HOSTED_BUTTON_ID || "8R9PKMBPRB45N";
/** Bouton hébergé PayPal pour le don récurrent / adhésion (montant libre, mensuel).
    À remplacer par l'identifiant du bouton d'abonnement PayPal créé dans le dashboard. */
export const PAYPAL_SUBSCRIPTION_HOSTED_BUTTON_ID =
  process.env.REACT_APP_PAYPAL_SUBSCRIPTION_HOSTED_BUTTON_ID || "";
export const PAYPAL_CURRENCY = "EUR";

/** Page de paiement PayPal hébergée — utilisée en repli si le SDK est bloqué. */
export const paypalCheckoutUrl = (id = PAYPAL_HOSTED_BUTTON_ID) =>
  `https://www.paypal.com/ncp/payment/${id}`;

export const SOCIALS = [
  { name: "X", url: "https://x.com/ElysiumxEVA", icon: "x" },
  { name: "Instagram", url: "https://www.instagram.com/elysiumxeva/", icon: "instagram" },
  { name: "TikTok", url: "https://www.tiktok.com/@elysiumxeva", icon: "tiktok" },
  { name: "Threads", url: "https://www.threads.net/@elysiumxeva", icon: "threads" },
  { name: "Twitch", url: "https://www.twitch.tv/elysiumxeva", icon: "twitch" },
  { name: "YouTube", url: "https://www.youtube.com/@elysiumfr", icon: "youtube" },
  { name: "Discord", url: "https://discord.gg/RH3ZZkMJsw", icon: "discord" },
];

export const STAT_FIELDS = {
  "Rocket League": [
    { key: "buts", label: "Buts" },
    { key: "passes", label: "Passes Décisives" },
    { key: "arrets", label: "Arrêts" },
    { key: "tirs", label: "Tirs" },
  ],
  "EVA": [
    { key: "kills", label: "Kill" },
    { key: "deaths", label: "Mort" },
    { key: "assists", label: "Assistance" },
  ],
};

export const getStatFieldsForGame = (game) => {
  return STAT_FIELDS[game] || STAT_FIELDS["EVA"];
};

export const isPlayerInMatch = (match, player) => {
  if (!match || !player) return false;
  if (match.players && Array.isArray(match.players) && match.players.length > 0) {
    return match.players.some(
      (p) =>
        (player.id && p.playerId === player.id) ||
        (player.pseudo && p.pseudo && p.pseudo.toLowerCase() === player.pseudo.toLowerCase())
    );
  }
  return false;
};

/** Score principal par jeu pour un leaderboard : kills (EVA) ou buts (RL). */
export const getPrimaryStatKey = (game) => (game === "Rocket League" ? "buts" : "kills");
export const getSecondaryStatKey = (game) => (game === "Rocket League" ? "passes" : "deaths");

const matchParticipant = (match, player) => {
  if (!match || !match.players || !Array.isArray(match.players)) return null;
  return match.players.find(
    (p) =>
      (player.id && p.playerId === player.id) ||
      (player.pseudo && p.pseudo && p.pseudo.toLowerCase() === player.pseudo.toLowerCase())
  ) || null;
};

const matchResult = (match) => {
  const us = Number(match.scoreUs);
  const them = Number(match.scoreThem);
  if (!match.scoreUs && match.scoreUs !== 0) return null;
  return us > them ? "win" : us < them ? "loss" : "draw";
};

/**
 * Leaderboard public par joueur, alimenté par les stats saisies sur les matchs.
 * Retourne pour chaque membre du roster : parties jouées, W/L/D, win rate,
 * ratio principal (K/D pour EVA, buts/partie pour RL) et performances du mois.
 */
export const computePlayerLeaderboard = (members, matches, { monthOnly = false, minGames = 1 } = {}) => {
  if (!members || !matches) return [];
  const finished = matches.filter((m) => m.status !== "upcoming" && m.status !== "live");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  return members
    .filter((m) => m.status !== "staff")
    .map((member) => {
      const participated = finished.filter((m) => matchParticipant(m, member));
      const relevant = monthOnly
        ? participated.filter((m) => {
            const d = m.date ? new Date(`${m.date}T${m.time ? m.time.slice(0, 5) : "12:00"}:00`) : null;
            return d && d.getTime() >= monthStart;
          })
        : participated;
      if (relevant.length < minGames) return null;

      let gamesPlayed = 0;
      let wins = 0, losses = 0, draws = 0;
      let primaryTotal = 0, secondaryTotal = 0, deaths = 0;
      const fields = getStatFieldsForGame(member.game || "EVA");

      relevant.forEach((m) => {
        const entry = matchParticipant(m, member);
        if (!entry) return;
        const gamesList = Array.isArray(entry.games) && entry.games.length > 0 ? entry.games : [entry];
        gamesList.forEach((g) => {
          if (!g || typeof g !== "object") return;
          gamesPlayed++;
          fields.forEach((f) => {
            const val = Number(g[f.key]) || 0;
            if (f.key === getPrimaryStatKey(member.game)) primaryTotal += val;
            if (f.key === getSecondaryStatKey(member.game)) secondaryTotal += val;
            if (f.key === "deaths") deaths += val;
          });
        });
        const r = matchResult(m);
        if (r === "win") wins++;
        else if (r === "loss") losses++;
        else if (r === "draw") draws++;
      });

      if (gamesPlayed === 0) return null;

      const primaryKey = getPrimaryStatKey(member.game);
      const secondaryKey = getSecondaryStatKey(member.game);
      const ratio =
        primaryKey === "kills"
          ? (primaryTotal / (deaths || 1)).toFixed(2)
          : (primaryTotal / gamesPlayed).toFixed(2);

      return {
        ...member,
        matchesPlayed: relevant.length,
        gamesPlayed,
        wins,
        losses,
        draws,
        winRate: relevant.length ? Math.round((wins / relevant.length) * 100) : 0,
        primaryTotal,
        secondaryTotal,
        primaryKey,
        secondaryKey,
        ratio: Number(ratio),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.winRate - a.winRate || b.ratio - a.ratio || b.matchesPlayed - a.matchesPlayed);
};

/** « Joueur du mois » : meilleur win rate (min. 2 matchs) sur le mois en cours. */
export const getPlayerOfTheMonth = (members, matches) => {
  const board = computePlayerLeaderboard(members, matches, { monthOnly: true, minGames: 2 });
  return board[0] || null;
};

export const computePlayerStats = (player, matches) => {
  if (!player || !matches || !Array.isArray(matches)) return null;
  const fields = getStatFieldsForGame(player?.game || "EVA");
  const sums = {};
  fields.forEach((f) => {
    sums[f.key] = 0;
  });
  let totalGamesPlayed = 0;

  matches
    .filter((m) => m.status !== "upcoming" && m.status !== "live")
    .forEach((m) => {
      if (!m.players || !Array.isArray(m.players)) return;
      const pEntry = m.players.find(
        (p) =>
          (player.id && p.playerId === player.id) ||
          (player.pseudo && p.pseudo && p.pseudo.toLowerCase() === player.pseudo.toLowerCase())
      );
      if (!pEntry) return;
      const gamesList =
        Array.isArray(pEntry.games) && pEntry.games.length > 0 ? pEntry.games : [pEntry];
      gamesList.forEach((g) => {
        if (!g || typeof g !== "object") return;
        totalGamesPlayed++;
        fields.forEach((f) => {
          sums[f.key] += Number(g[f.key]) || 0;
        });
      });
    });

  if (totalGamesPlayed === 0) return null;

  return fields.map((f) => {
    const avg = sums[f.key] / totalGamesPlayed;
    const formatted = Number(avg.toFixed(2)).toString();
    return {
      label: f.label,
      value: formatted,
      total: sums[f.key],
      games: totalGamesPlayed,
    };
  });
};

