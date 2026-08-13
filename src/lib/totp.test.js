import { TextEncoder, TextDecoder } from "util";
import { generateTotpSecret, totpAt, totpOtpauthUrl, verifyTotp } from "./totp";

if (typeof global.TextEncoder === "undefined") global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === "undefined") global.TextDecoder = TextDecoder;

const subtle = require("crypto").webcrypto?.subtle;
if (typeof global.crypto === "undefined" || !global.crypto.subtle) {
  global.crypto = require("crypto").webcrypto;
}

describe("app-level TOTP (Spark)", () => {
  it("generates a base32 secret and a valid otpauth URL", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThanOrEqual(16);
    const url = totpOtpauthUrl(secret, "bureau@elysium-esport.fr");
    expect(url.startsWith("otpauth://totp/")).toBe(true);
    expect(url).toContain(secret);
    expect(url).toContain("Elysium");
  });

  it("accepts the current code and rejects a wrong one", async () => {
    if (!subtle && !global.crypto?.subtle) return;
    const secret = generateTotpSecret();
    const code = await totpAt(secret);
    expect(code).toMatch(/^\d{6}$/);
    await expect(verifyTotp(secret, code)).resolves.toBe(true);
    await expect(verifyTotp(secret, "000000")).resolves.toBe(false);
    await expect(verifyTotp(secret, "")).resolves.toBe(false);
  });
});
