import { TextEncoder, TextDecoder } from "util";
import { toQrDataUrl } from "./qrDataUrl";

if (typeof global.TextEncoder === "undefined") global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === "undefined") global.TextDecoder = TextDecoder;

describe("toQrDataUrl", () => {
  it("encodes an otpauth payload as a PNG data URL", async () => {
    const url = await toQrDataUrl("otpauth://totp/Elysium:test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Elysium");
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    expect(url.length).toBeGreaterThan(100);
  });
});
