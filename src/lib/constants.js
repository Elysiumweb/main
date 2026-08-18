export const OFFICIAL_UID = process.env.REACT_APP_OFFICIAL_UID;
export const GAMES = ["EVA", "Rocket League", "Valorant"];
export const ROLES = ["visitor", "player", "manager", "bureau"];

// Rosters per game — EVA has no rosters, RL has Junior / Espoir / Académique / Esport,
// Valorant has Valeureux / Vaillant
export const ROSTERS = {
  "Rocket League": ["Junior", "Espoir", "Académique", "Esport"],
  "Valorant": ["Valeureux", "Vaillant"],
  "EVA": [],
};

// Flat list of all rosters (for selects / validation)
export const ALL_ROSTERS = Object.values(ROSTERS).flat();

/** Le jeu possède-t-il des rosters ? */
export const gameHasRosters = (game) => (ROSTERS[game] || []).length > 0;

/** Couleur d'accent par jeu (EVA = or, RL = orange, Valorant = rouge) */
export const GAME_COLORS = {
  "EVA": "#D8CA82",
  "Rocket League": "#F4511E",
  "Valorant": "#FF4655",
};
export const getGameColor = (game) => GAME_COLORS[game] || "#D8CA82";

/** Abréviation d'affichage par jeu */
export const GAME_SHORT_LABELS = {
  "EVA": "EVA",
  "Rocket League": "RL",
  "Valorant": "Valo",
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

export const MATCH_FORMATS = ["BO1", "BO3", "BO5", "BO7"];
export const MATCH_STATUSES = ["upcoming", "live", "finished", "postponed", "cancelled"];

export const COMPETITION_LEVELS = ["local", "regional", "national", "international", "major"];
export const COMPETITION_TYPES = ["league", "cup", "tournament", "qualifier"];
export const COMPETITION_GROUPS = ["group", "playoff", "final"];

export const PARTNER_TIERS = ["gold", "silver", "bronze"];
export const PARTNER_LEVELS = ["premium", "official", "technical", "media"];

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

/** Normalise un lien : vérifie http/https */
export const isValidUrl = (s) => !s || /^https?:\/\/.+/.test(s);

/** Génère un slug stable pour URL : pseudo-date */
export const slugify = (str) =>
  String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

/** URL stable d'un match */
export const matchDetailUrl = (match) => {
  if (!match?.id) return "/resultats";
  const slug = slugify(`${match.opponentName || "adversaire"}-${match.date || ""}`);
  return `/match/${match.id}${slug ? `-${slug}` : ""}`;
};

/** URL stable d'une compétition */
export const competitionDetailUrl = (comp) => {
  if (!comp?.id) return "/competitions";
  const slug = slugify(comp.name || "");
  return `/competitions/${comp.id}${slug ? `-${slug}` : ""}`;
};
