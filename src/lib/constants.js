export const OFFICIAL_UID = process.env.REACT_APP_OFFICIAL_UID;
export const GAMES = ["EVA", "Rocket League"];
export const ROLES = ["visitor", "player", "manager", "bureau"];

// Les rosters ne sont plus prédéfinis en code : ils sont créés/supprimés par
// le compte officiel depuis le panel admin (collection Firestore `rosters`)
// et consommés via le hook `useRosters`. Les documents existants dont le jeu
// figure ci-dessous sont masqués des vues publiques (données historiques
// d'avant la suppression du pôle — l'admin peut les supprimer via les panels).
export const LEGACY_REMOVED_GAMES = ["Valorant"];

/** false pour les jeux supprimés du projet (ex. données Valorant historiques). */
export const isRemovedGame = (game) => LEGACY_REMOVED_GAMES.includes(game);

/** Couleur d'accent par jeu (EVA = or, RL = orange) */
export const GAME_COLORS = {
  "EVA": "#D8CA82",
  "Rocket League": "#F4511E",
};
export const getGameColor = (game) => GAME_COLORS[game] || "#D8CA82";

/** Abréviation d'affichage par jeu */
export const GAME_SHORT_LABELS = {
  "EVA": "EVA",
  "Rocket League": "RL",
};
export const getGameShortLabel = (game) => GAME_SHORT_LABELS[game] || game;

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
  { name: "Twitch", url: "https://www.twitch.tv/elysiumxeva", icon: "twitch" },
  { name: "YouTube", url: "https://www.youtube.com/@elysiumfr", icon: "youtube" },
  { name: "Discord", url: "https://discord.gg/RH3ZZkMJsw", icon: "discord" },
];

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
