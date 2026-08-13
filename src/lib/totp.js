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
  const rng = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
  if (rng) rng(bytes);
  else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return base32Encode(bytes);
};

export const readStoredTotpSecret = (profile) =>
  profile?.totp?.secret || profile?.totpSecret || "";

const rotl = (n, s) => (n << s) | (n >>> (32 - s));

const sha1Bytes = (bytes) => {
  const extra = bytes.length % 64;
  const padLen = extra < 56 ? 56 - extra : 120 - extra;
  const total = bytes.length + padLen + 8;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const bitLen = bytes.length * 8;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 4, bitLen >>> 0);
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 80; i += 1) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i += 1) {
      const f = i < 20 ? (b & c) | (~b & d)
        : i < 40 ? b ^ c ^ d
          : i < 60 ? (b & c) | (b & d) | (c & d)
            : b ^ c ^ d;
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const temp = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0);
  outView.setUint32(4, h1);
  outView.setUint32(8, h2);
  outView.setUint32(12, h3);
  outView.setUint32(16, h4);
  return out;
};

const hmacSha1Sync = (keyBytes, messageBytes) => {
  const block = 64;
  let key = keyBytes.length > block ? sha1Bytes(keyBytes) : keyBytes;
  const oKey = new Uint8Array(block);
  const iKey = new Uint8Array(block);
  oKey.set(key);
  iKey.set(key);
  for (let i = 0; i < block; i += 1) {
    oKey[i] ^= 0x5c;
    iKey[i] ^= 0x36;
  }
  const inner = new Uint8Array(block + messageBytes.length);
  inner.set(iKey);
  inner.set(messageBytes, block);
  const innerHash = sha1Bytes(inner);
  const outer = new Uint8Array(block + innerHash.length);
  outer.set(oKey);
  outer.set(innerHash, block);
  return sha1Bytes(outer);
};

const hmacSha1 = async (keyBytes, counter) => {
  const msg = new Uint8Array(8);
  const view = new DataView(msg.buffer);
  view.setUint32(0, 0);
  view.setUint32(4, counter >>> 0);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const key = await subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
      return new Uint8Array(await subtle.sign("HMAC", key, msg));
    } catch (err) {
      console.warn("totp subtle", err);
    }
  }
  return hmacSha1Sync(keyBytes, msg);
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
