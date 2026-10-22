/**
 * Permissions par fonctionnalité
 * ============================================================================
 * Les 4 rôles historiques (`visitor`, `player`, `manager`, `bureau`) restent la
 * base d'attribution, mais chaque compte peut recevoir des permissions fines
 * (`users/{uid}.permissions`) sans changer de rôle. Le compte « officiel » est
 * désormais un indicateur de données (`users/{uid}.official === true`) et non
 * plus un UID codé en dur dans `firestore.rules`.
 *
 * Les mêmes clés sont utilisées côté client (onglets admin, boutons) et côté
 * règles Firestore (`hasPerm('inbox.support')`), afin qu'une permission
 * accordée dans l'admin ouvre réellement l'écriture correspondante.
 */

export const PERMISSION = {
  // Boîte de réception (support + candidatures)
  INBOX_SUPPORT: "inbox.support",
  INBOX_RECRUIT: "inbox.recruit",
  INBOX_MANAGE: "inbox.manage",
  INBOX_EXPORT: "inbox.export",
  CANNED_REPLIES: "inbox.canned",
  // Contenus
  ARTICLES_MANAGE: "articles.manage",
  MEDIA_MANAGE: "media.manage",
  CONTENT_EDIT: "content.edit",
  ANNOUNCEMENTS_MANAGE: "announcements.manage",
  // Sports
  MATCHES_MANAGE: "matches.manage",
  ROSTERS_MANAGE: "rosters.manage",
  POSITIONS_MANAGE: "positions.manage",
  EVENTS_MANAGE: "events.manage",
  TRYOUTS_MANAGE: "tryouts.manage",
  COMPETITIONS_MANAGE: "competitions.manage",
  OPPONENTS_MANAGE: "opponents.manage",
  // Écosystème
  PARTNERS_MANAGE: "partners.manage",
  CAMPAIGNS_MANAGE: "campaigns.manage",
  NEWSLETTER_MANAGE: "newsletter.manage",
  // Pilotage
  ANALYTICS_VIEW: "analytics.view",
  TEAM_MANAGE: "team.manage",
  REDIRECTS_MANAGE: "redirects.manage",
  FLAGS_MANAGE: "flags.manage",
  AUDIT_VIEW: "audit.view",
};

const ALL_PERMISSIONS = Object.values(PERMISSION);

/** Regroupement utilisé par l'écran « Équipe & permissions ». */
export const PERMISSION_GROUPS = [
  {
    id: "inbox",
    label: "Boîte de réception",
    permissions: [
      { id: PERMISSION.INBOX_SUPPORT, label: "Voir le support" },
      { id: PERMISSION.INBOX_RECRUIT, label: "Voir les candidatures" },
      { id: PERMISSION.INBOX_MANAGE, label: "Traiter / assigner / répondre" },
      { id: PERMISSION.INBOX_EXPORT, label: "Exporter en CSV" },
      { id: PERMISSION.CANNED_REPLIES, label: "Gérer les réponses types" },
    ],
  },
  {
    id: "content",
    label: "Contenus",
    permissions: [
      { id: PERMISSION.ARTICLES_MANAGE, label: "Articles" },
      { id: PERMISSION.MEDIA_MANAGE, label: "Médiathèque" },
      { id: PERMISSION.CONTENT_EDIT, label: "Pages statiques (À propos, partenaires, légal)" },
      { id: PERMISSION.ANNOUNCEMENTS_MANAGE, label: "Annonces & bannières" },
    ],
  },
  {
    id: "sports",
    label: "Sportif",
    permissions: [
      { id: PERMISSION.MATCHES_MANAGE, label: "Matchs" },
      { id: PERMISSION.ROSTERS_MANAGE, label: "Rosters" },
      { id: PERMISSION.POSITIONS_MANAGE, label: "Postes" },
      { id: PERMISSION.EVENTS_MANAGE, label: "Événements" },
      { id: PERMISSION.TRYOUTS_MANAGE, label: "Tryouts" },
      { id: PERMISSION.COMPETITIONS_MANAGE, label: "Compétitions" },
      { id: PERMISSION.OPPONENTS_MANAGE, label: "Adversaires" },
    ],
  },
  {
    id: "eco",
    label: "Écosystème",
    permissions: [
      { id: PERMISSION.PARTNERS_MANAGE, label: "Demandes partenaires" },
      { id: PERMISSION.CAMPAIGNS_MANAGE, label: "Campagnes de dons" },
      { id: PERMISSION.NEWSLETTER_MANAGE, label: "Newsletter" },
    ],
  },
  {
    id: "pilot",
    label: "Pilotage",
    permissions: [
      { id: PERMISSION.ANALYTICS_VIEW, label: "Analytics" },
      { id: PERMISSION.TEAM_MANAGE, label: "Équipe & invitations" },
      { id: PERMISSION.REDIRECTS_MANAGE, label: "Redirections" },
      { id: PERMISSION.FLAGS_MANAGE, label: "Feature flags" },
      { id: PERMISSION.AUDIT_VIEW, label: "Journal d'audit" },
    ],
  },
];

/** Permissions accordées par défaut à chaque rôle historique. */
export const ROLE_PERMISSIONS = {
  visitor: [],
  player: [],
  manager: [
    PERMISSION.INBOX_RECRUIT,
    PERMISSION.INBOX_MANAGE,
    PERMISSION.INBOX_EXPORT,
    PERMISSION.CANNED_REPLIES,
    PERMISSION.MEDIA_MANAGE,
    PERMISSION.EVENTS_MANAGE,
    PERMISSION.TRYOUTS_MANAGE,
    PERMISSION.POSITIONS_MANAGE,
  ],
  // Le bureau reçoit tout : c'est le rôle d'administration historique.
  bureau: ALL_PERMISSIONS,
};

/** L'onglet admin et la permission qu'il exige. */
export const ADMIN_TABS = [
  // Deux permissions possibles : le support OU les candidatures suffisent.
  { id: "inbox", permission: [PERMISSION.INBOX_SUPPORT, PERMISSION.INBOX_RECRUIT] },
  { id: "users", permission: PERMISSION.TEAM_MANAGE },
  { id: "team", permission: PERMISSION.TEAM_MANAGE },
  { id: "matches", permission: PERMISSION.MATCHES_MANAGE },
  { id: "rosters", permission: PERMISSION.ROSTERS_MANAGE },
  { id: "roster", permission: PERMISSION.ROSTERS_MANAGE },
  { id: "positions", permission: PERMISSION.POSITIONS_MANAGE },
  { id: "articles", permission: PERMISSION.ARTICLES_MANAGE },
  { id: "media", permission: PERMISSION.MEDIA_MANAGE },
  { id: "events", permission: PERMISSION.EVENTS_MANAGE },
  { id: "competitions", permission: PERMISSION.COMPETITIONS_MANAGE },
  { id: "opponents", permission: PERMISSION.OPPONENTS_MANAGE },
  { id: "campaigns", permission: PERMISSION.CAMPAIGNS_MANAGE },
  { id: "partners", permission: PERMISSION.PARTNERS_MANAGE },
  { id: "newsletter", permission: PERMISSION.NEWSLETTER_MANAGE },
  { id: "tryouts", permission: PERMISSION.TRYOUTS_MANAGE },
  { id: "help", permission: PERMISSION.CONTENT_EDIT },
  { id: "content", permission: PERMISSION.CONTENT_EDIT },
  { id: "announcements", permission: PERMISSION.ANNOUNCEMENTS_MANAGE },
  { id: "analytics", permission: PERMISSION.ANALYTICS_VIEW },
  { id: "redirects", permission: PERMISSION.REDIRECTS_MANAGE },
  { id: "flags", permission: PERMISSION.FLAGS_MANAGE },
  { id: "audit", permission: PERMISSION.AUDIT_VIEW },
];

/** Permissions valides (utilisé pour valider les payloads avant écriture). */
export const isKnownPermission = (value) => ALL_PERMISSIONS.includes(value);
export const isValidPermission = isKnownPermission;

export const normalizePermissions = (list) =>
  [...new Set((Array.isArray(list) ? list : []).filter(isKnownPermission))];

/**
 * Calcule la liste effective des permissions d'un compte.
 * @param {{ role?: string, permissions?: string[], official?: boolean }} args
 */
export const resolvePermissions = ({ role = "visitor", permissions = [], official = false } = {}) => {
  if (official) return ALL_PERMISSIONS;
  const base = ROLE_PERMISSIONS[role] || [];
  return [...new Set([...base, ...normalizePermissions(permissions)])];
};

export const hasPermission = (permissions, permission) =>
  Array.isArray(permissions) && permissions.includes(permission);

/** Une exigence peut être une permission ou une liste (OU logique). */
const satisfies = (permissions, requirement) =>
  Array.isArray(requirement)
    ? requirement.some((permission) => hasPermission(permissions, permission))
    : hasPermission(permissions, requirement);

/** Un compte peut-il ouvrir l'admin (au moins un onglet) ? */
export const canAccessAdmin = (permissions) =>
  ADMIN_TABS.some((tab) => satisfies(permissions, tab.permission));

/** Onglets autorisés pour une liste de permissions. */
export const allowedAdminTabs = (permissions) =>
  ADMIN_TABS.filter((tab) => satisfies(permissions, tab.permission)).map((tab) => tab.id);

/** Différence de permissions (pour l'audit / l'affichage avant/après). */
export const diffPermissions = (before = [], after = []) => ({
  added: after.filter((p) => !before.includes(p)),
  removed: before.filter((p) => !after.includes(p)),
});

export { ALL_PERMISSIONS };
