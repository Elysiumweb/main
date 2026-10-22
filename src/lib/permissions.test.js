import {
  ALL_PERMISSIONS,
  PERMISSION,
  allowedAdminTabs,
  canAccessAdmin,
  diffPermissions,
  hasPermission,
  isValidPermission,
  normalizePermissions,
  resolvePermissions,
} from "./permissions";

describe("permissions — résolution", () => {
  test("le rôle bureau reçoit toutes les permissions", () => {
    const permissions = resolvePermissions({ role: "bureau" });
    expect(permissions).toHaveLength(ALL_PERMISSIONS.length);
    expect(permissions).toContain(PERMISSION.ANALYTICS_VIEW);
    expect(permissions).toContain(PERMISSION.TEAM_MANAGE);
  });

  test("un manager ne reçoit que les permissions de son rôle par défaut", () => {
    const permissions = resolvePermissions({ role: "manager" });
    expect(permissions).toContain(PERMISSION.INBOX_RECRUIT);
    expect(permissions).toContain(PERMISSION.MEDIA_MANAGE);
    expect(permissions).not.toContain(PERMISSION.INBOX_SUPPORT);
    expect(permissions).not.toContain(PERMISSION.TEAM_MANAGE);
  });

  test("un visiteur peut recevoir une permission fine explicite", () => {
    const permissions = resolvePermissions({
      role: "visitor",
      permissions: [PERMISSION.INBOX_SUPPORT, "inconnue", PERMISSION.INBOX_SUPPORT],
    });
    expect(permissions).toEqual([PERMISSION.INBOX_SUPPORT]);
  });

  test("le statut officiel court-circuite le rôle et les permissions stockées", () => {
    const permissions = resolvePermissions({ role: "visitor", permissions: [], official: true });
    expect(permissions).toEqual(expect.arrayContaining(ALL_PERMISSIONS));
  });

  test("les permissions inconnues sont ignorées", () => {
    expect(isValidPermission("root.everything")).toBe(false);
    expect(normalizePermissions(["root.everything", PERMISSION.AUDIT_VIEW])).toEqual([PERMISSION.AUDIT_VIEW]);
  });
});

describe("permissions — navigation admin", () => {
  test("hasPermission / canAccessAdmin", () => {
    expect(hasPermission([PERMISSION.ANALYTICS_VIEW], PERMISSION.ANALYTICS_VIEW)).toBe(true);
    expect(canAccessAdmin([])).toBe(false);
    expect(canAccessAdmin([PERMISSION.INBOX_RECRUIT])).toBe(true);
  });

  test("les onglets sont filtrés par permission et contiennent les nouveaux écrans", () => {
    const tabs = allowedAdminTabs(resolvePermissions({ role: "bureau" }));
    expect(tabs).toEqual(expect.arrayContaining([
      "inbox", "team", "content", "announcements", "analytics", "redirects", "flags",
    ]));
    expect(allowedAdminTabs([PERMISSION.INBOX_RECRUIT])).toEqual(["inbox"]);
  });
});

describe("permissions — diff", () => {
  test("calcule les ajouts et retraits", () => {
    expect(diffPermissions(
      [PERMISSION.INBOX_SUPPORT, PERMISSION.MEDIA_MANAGE],
      [PERMISSION.MEDIA_MANAGE, PERMISSION.ANALYTICS_VIEW],
    )).toEqual({
      added: [PERMISSION.ANALYTICS_VIEW],
      removed: [PERMISSION.INBOX_SUPPORT],
    });
  });
});
