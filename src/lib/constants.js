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
export const PAYPAL_CURRENCY = "EUR";

/** Page de paiement PayPal hébergée — utilisée en repli si le SDK est bloqué. */
export const paypalCheckoutUrl = (id = PAYPAL_HOSTED_BUTTON_ID) =>
  `https://www.paypal.com/ncp/payment/${id}`;

export const SOCIALS = [
  { name: "X", url: "https://x.com/ElysiumxEVA", icon: "x" },
  { name: "Instagram", url: "https://www.instagram.com/elysiumxeva/", icon: "instagram" },
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

export const computePlayerStats = (player, matches) => {
  if (!player || !matches || !Array.isArray(matches)) return null;
  const fields = getStatFieldsForGame(player?.game || "EVA");
  const sums = {};
  fields.forEach((f) => {
    sums[f.key] = 0;
  });
  let totalGamesPlayed = 0;

  matches
    .filter((m) => m.status !== "upcoming")
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

