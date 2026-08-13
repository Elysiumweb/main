import { getMultiFactorResolver, multiFactor } from "firebase/auth";
import { mfaErrorMessage, readEnrolledFactors, resolverFromMfaError } from "./mfa";

jest.mock("firebase/auth", () => ({
  __esModule: true,
  EmailAuthProvider: { credential: jest.fn() },
  TotpMultiFactorGenerator: { FACTOR_ID: "totp" },
  getMultiFactorResolver: jest.fn((auth, err) => ({ auth, hints: err?.customData?.hints || [] })),
  multiFactor: jest.fn((user) => ({ enrolledFactors: user?.__factors || [] })),
  reauthenticateWithCredential: jest.fn(),
  reauthenticateWithPopup: jest.fn(),
}));

jest.mock("./firebase", () => ({
  auth: { currentUser: null },
  googleProvider: {},
}));

describe("mfa helpers", () => {
  beforeEach(() => {
    multiFactor.mockImplementation((user) => ({ enrolledFactors: user?.__factors || [] }));
    getMultiFactorResolver.mockImplementation((auth, err) => ({ auth, hints: err?.customData?.hints || [] }));
  });

  it("maps Firebase MFA errors to actionable French copy", () => {
    expect(mfaErrorMessage({ code: "auth/requires-recent-login" })).toMatch(/confirmez votre identité/i);
    expect(mfaErrorMessage({ code: "auth/unverified-email" })).toMatch(/email/i);
    expect(mfaErrorMessage({ code: "auth/invalid-verification-code" })).toMatch(/invalide/i);
    expect(mfaErrorMessage({ code: "auth/operation-not-allowed" })).toMatch(/projet/i);
    expect(mfaErrorMessage({ code: "auth/unknown-xyz" })).toMatch(/Impossible de configurer/i);
  });

  it("reads totp factors from multiFactor()", () => {
    const user = { __factors: [{ uid: "a", factorId: "totp", displayName: "App" }] };
    expect(readEnrolledFactors(user)).toHaveLength(1);
    expect(readEnrolledFactors({ __factors: [{ uid: "b", factorId: "phone" }] })).toHaveLength(0);
    expect(readEnrolledFactors(null)).toEqual([]);
  });

  it("falls back to reloadUserInfo when live factors are empty", () => {
    const user = {
      __factors: [],
      reloadUserInfo: {
        mfaInfo: [{ mfaEnrollmentId: "totp-1", displayName: "Auth app", totpInfo: {} }],
      },
    };
    expect(readEnrolledFactors(user)).toEqual([
      { uid: "totp-1", displayName: "Auth app", factorId: "totp" },
    ]);
  });

  it("builds a resolver only for multi-factor-auth-required", () => {
    expect(resolverFromMfaError({ code: "auth/wrong-password" })).toBeNull();
    expect(resolverFromMfaError({ code: "auth/multi-factor-auth-required" })).toEqual(
      expect.objectContaining({ hints: [] }),
    );
  });
});
