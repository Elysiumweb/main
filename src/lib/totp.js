const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const base32Encode = (bytes) => {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < bytes.length; i += 1) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
};

export const base32Decode = (input) => {
  const clean = String(input || "").toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
};

export const generateTotpSecret = (byteLength = 20) => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
};

const hmacSha1 = async (keyBytes, counter) => {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, 0);
  view.setUint32(4, counter >>> 0);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, buf));
};

export const totpAt = async (secret, timestamp = Date.now(), step = 30, digits = 6) => {
  const keyBytes = base32Decode(secret);
  if (!keyBytes.length) return "";
  const counter = Math.floor(timestamp / 1000 / step);
  const hmac = await hmacSha1(keyBytes, counter);
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  const mod = 10 ** digits;
  return String(bin % mod).padStart(digits, "0");
};

export const verifyTotp = async (secret, code, { window = 1, step = 30 } = {}) => {
  const trimmed = String(code || "").replace(/\D/g, "");
  if (trimmed.length !== 6 || !secret) return false;
  const now = Date.now();
  for (let i = -window; i <= window; i += 1) {
    const expected = await totpAt(secret, now + i * step * 1000, step);
    if (expected && expected === trimmed) return true;
  }
  return false;
};

export const totpOtpauthUrl = (secret, account, issuer = "Elysium Esport") => {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
};

const sessionKey = (uid) => `elysium_mfa_ok_${uid}`;

export const isMfaSessionOk = (uid) => {
  if (!uid || typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(sessionKey(uid)) === "1";
};

export const markMfaSessionOk = (uid) => {
  if (!uid || typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(sessionKey(uid), "1");
};

export const clearMfaSession = (uid) => {
  if (typeof sessionStorage === "undefined") return;
  if (uid) sessionStorage.removeItem(sessionKey(uid));
  else Object.keys(sessionStorage).filter((k) => k.startsWith("elysium_mfa_ok_")).forEach((k) => sessionStorage.removeItem(k));
};
