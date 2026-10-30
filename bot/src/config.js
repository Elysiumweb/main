import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const BOT_ROOT = path.resolve(__dirname, "..");
export const REPO_ROOT = path.resolve(BOT_ROOT, "..");

// Charge bot/.env en priorité, puis .env à la racine du dépôt en repli.
dotenv.config({ path: path.join(BOT_ROOT, ".env") });
dotenv.config({ path: path.join(REPO_ROOT, ".env") });

/** Extrait automatiquement le Client ID Discord depuis le 1er segment base64 du token si non fourni. */
export const deriveClientIdFromToken = (token = "") => {
  try {
    const firstPart = String(token || "").trim().split(".")[0];
    if (!firstPart) return "";
    const decoded = Buffer.from(firstPart, "base64").toString("utf8").trim();
    return /^\d{15,22}$/.test(decoded) ? decoded : "";
  } catch {
    return "";
  }
};

export const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || "").trim();
export const DISCORD_CLIENT_ID =
  (process.env.DISCORD_CLIENT_ID || "").trim() || deriveClientIdFromToken(DISCORD_TOKEN);

// --- Identifiants Discord imposés par le cahier des charges ---
export const OWNER_USER_ID = "520496557146243072";

// Serveur matchs / esport (/ask-result, /link, /command-allowed)
export const MATCH_GUILD_ID = "1526866278462001202";

// Serveur communautaire / commandes graphiques (bienvenue, au revoir, /send-message, /command-allowed)
export const COMMUNITY_GUILD_ID = "1565264995078508554";

export const ALLOWED_GUILD_IDS = [COMMUNITY_GUILD_ID, MATCH_GUILD_ID];

// Salons de bienvenue et d'au revoir sur le serveur 1565264995078508554
export const WELCOME_CHANNEL_ID = "1565265445752152125";
export const GOODBYE_CHANNEL_ID = "1565265516992401489";

// Lien de donation PayPal après acceptation d'un ticket
export const DONATION_URL =
  (process.env.DONATION_URL || "").trim() ||
  "https://www.paypal.com/ncp/payment/8R9PKMBPRB45N";

export const SITE_URL =
  (process.env.SITE_URL || "").trim().replace(/\/$/, "") ||
  "https://elysium-esport.fr";

export const DEFAULT_TIMEZONE = (process.env.BOT_TIMEZONE || "").trim() || "Europe/Paris";
export const OFFICIAL_FIREBASE_UID = "9IzGlpp6DHhrN9GW72haeb869Om1";

// Couleur principale Elysium (or charte graphique)
export const ELYSIUM_GOLD = 0xd8ca82;
export const ELYSIUM_DARK = 0x111111;
export const ELYSIUM_SUCCESS = 0x34d399;
export const ELYSIUM_ERROR = 0xf87171;
export const ELYSIUM_INFO = 0x38bdf8;

// Chemins des assets et du stockage persistant local
export const ASSETS_DIR = path.join(BOT_ROOT, "assets");
export const LOGO_PATH = path.join(ASSETS_DIR, "elysium-logo.png");
export const BANNER_PATH = path.join(ASSETS_DIR, "elysium-banner.jpg");

export const DATA_DIR = path.join(BOT_ROOT, "data");
export const STATE_FILE_PATH = path.join(DATA_DIR, "state.json");
export const TICKET_FILES_DIR = path.join(DATA_DIR, "ticket_files");
export const MATCH_FILES_DIR = path.join(DATA_DIR, "match_files");

// Jeux de base définis sur le site (hors jeux retirés historiques)
export const DEFAULT_SITE_GAMES = ["EVA", "Rocket League"];
export const LEGACY_REMOVED_GAMES = ["Valorant"];
