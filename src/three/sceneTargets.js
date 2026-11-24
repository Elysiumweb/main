// Where the 3D emblem sits on each page.
// x / y are in scene units (camera sees ~10 x 5.7 units on desktop), scale 1 = full emblem,
// explode 0 = assembled, 1+ = shards flying apart.
// Routes not listed here fall back to the "/equipe" pose.

const T = (x, y, scale, explode, tilt = 0) => ({ x, y, scale, explode, tilt });

export const SCENE_TARGETS = {
  "/": { desktop: T(2.35, 0.05, 1, 0), mobile: T(0, 1.2, 0.5, 0) },
  "/equipe": { desktop: T(3, 0.4, 0.82, 0.35, 0.3), mobile: T(0.3, 1.25, 0.45, 0.4) },
  "/staff": { desktop: T(3, 0.4, 0.82, 0.3, 0.3), mobile: T(0.3, 1.25, 0.45, 0.35) },
  "/resultats": { desktop: T(3.1, 0.35, 0.78, 0.55, -0.4), mobile: T(-0.2, 1.2, 0.45, 0.6) },
  "/calendrier": { desktop: T(2.9, -0.2, 0.75, 0.85, 0.5), mobile: T(0.2, 1.2, 0.45, 0.8) },
  "/recrutement": { desktop: T(2.6, 0.1, 0.95, 1.35, -0.2), mobile: T(0, 1.1, 0.5, 1.2) },
  "/boutique": { desktop: T(3.2, 0.5, 0.75, 0.2, 0.6), mobile: T(0, 1.25, 0.45, 0.25) },
  "/soutenir": { desktop: T(2.9, 0.3, 0.85, 0.12, -0.5), mobile: T(0, 1.2, 0.48, 0.15) },
  "/actus": { desktop: T(3.05, 0.45, 0.76, 0.45, 0.2), mobile: T(0, 1.22, 0.45, 0.5) },
  "/medias": { desktop: T(3.15, 0.2, 0.74, 0.65, -0.3), mobile: T(0, 1.2, 0.45, 0.7) },
  "/competitions": { desktop: T(2.95, 0.5, 0.8, 0.25, 0.45), mobile: T(0, 1.25, 0.45, 0.3) },
  "/statistiques": { desktop: T(3, 0.15, 0.78, 0.7, -0.25), mobile: T(0, 1.2, 0.45, 0.75) },
  "/a-propos": { desktop: T(3.05, 0.3, 0.82, 0.4, 0.35), mobile: T(0, 1.22, 0.45, 0.45) },
  "/partenaires": { desktop: T(3.1, 0.4, 0.76, 0.5, -0.35), mobile: T(0, 1.2, 0.45, 0.55) },
  "/support": { desktop: T(3, 0.3, 0.8, 0.3, 0.3), mobile: T(0, 1.2, 0.45, 0.35) },
  "/presse": { desktop: T(3.05, 0.35, 0.78, 0.4, -0.3), mobile: T(0, 1.22, 0.45, 0.45) },
  "/connexion": { desktop: T(3.1, 0.1, 0.8, 0.2, 0.25), mobile: T(0, 1.15, 0.45, 0.25) },
};

const FALLBACK = { desktop: T(3, 0.4, 0.82, 0.35, 0.3), mobile: T(0.3, 1.25, 0.45, 0.4) };

export function sceneTargetFor(pathname, portrait) {
  const clean = pathname && pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/";
  // Detail routes (/equipe/:id, /actus/:slug…) share their section's pose.
  const section = clean.length > 1 ? `/${clean.split("/")[1]}` : "/";
  const set = SCENE_TARGETS[clean] || SCENE_TARGETS[section] || FALLBACK;
  return portrait ? set.mobile : set.desktop;
}
