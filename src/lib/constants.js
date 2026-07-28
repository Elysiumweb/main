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
