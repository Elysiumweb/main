export const OFFICIAL_UID = process.env.REACT_APP_OFFICIAL_UID;
export const GAMES = ["EVA", "Rocket League"];
export const ROLES = ["visitor", "player", "manager", "bureau"];

// Rosters per game — EVA has no rosters, RL has Espoir / Académique / Esport
export const ROSTERS = {
  "Rocket League": ["Espoir", "Académique", "Esport"],
  "EVA": [],
};

// Flat list of all rosters (for selects / validation)
export const ALL_ROSTERS = Object.values(ROSTERS).flat();

export const SOCIALS = [
  { name: "X", url: "https://x.com/ElysiumxEVA", icon: "x" },
  { name: "Instagram", url: "https://www.instagram.com/elysiumxeva/", icon: "instagram" },
  { name: "Twitch", url: "https://www.twitch.tv/elysiumxeva", icon: "twitch" },
  { name: "YouTube", url: "https://www.youtube.com/@elysiumfr", icon: "youtube" },
  { name: "Discord", url: "https://discord.gg/RH3ZZkMJsw", icon: "discord" },
];
