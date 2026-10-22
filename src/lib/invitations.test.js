import {
  INVITATION_STATUS,
  expiresAt,
  generateInviteToken,
  invitationUrl,
  isInvitationExpired,
  isInviteToken,
} from "./invitations";

describe("invitations — jetons", () => {
  test("génère un jeton hexadécimal de taille attendue", () => {
    const token = generateInviteToken();
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    expect(isInviteToken(token)).toBe(true);
    expect(generateInviteToken(10)).toHaveLength(24);
  });

  test("rejette les jetons trop courts ou non hexadécimaux", () => {
    expect(isInviteToken("abc")).toBe(false);
    expect(isInviteToken("Z".repeat(32))).toBe(false);
    expect(isInviteToken(null)).toBe(false);
  });

  test("construit un lien interne", () => {
    const token = "a".repeat(32);
    expect(invitationUrl(token, "https://elysium-esport.fr/")).toBe(`https://elysium-esport.fr/invitation/${token}`);
    expect(invitationUrl("court", "https://elysium-esport.fr")).toBe("");
  });
});

describe("invitations — expiration", () => {
  test("calcule une échéance bornée", () => {
    const from = new Date("2026-10-22T00:00:00Z");
    expect(expiresAt(from, 7).toISOString()).toBe("2026-10-29T00:00:00.000Z");
    expect(expiresAt(from, 0).toISOString()).toBe("2026-10-23T00:00:00.000Z");
    expect(expiresAt(from, 999).getTime()).toBeGreaterThan(from.getTime());
  });

  test("détecte les statuts et dates passées", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    expect(isInvitationExpired({ status: INVITATION_STATUS.PENDING, expiresAt: "2026-10-23T12:00:00Z" }, now)).toBe(false);
    expect(isInvitationExpired({ status: INVITATION_STATUS.PENDING, expiresAt: "2026-10-21T12:00:00Z" }, now)).toBe(true);
    expect(isInvitationExpired({ status: INVITATION_STATUS.ACCEPTED, expiresAt: "2026-10-23T12:00:00Z" }, now)).toBe(true);
    expect(isInvitationExpired(null, now)).toBe(true);
  });
});
