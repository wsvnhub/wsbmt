// Xác thực admin không cần quản lý user: 1 mật khẩu (ADMIN_PASSWORD) đổi lấy
// 1 session cookie được ký HMAC-SHA256. Bí mật (AUTH_SECRET) chỉ nằm ở server,
// không bao giờ gửi ra client, nên token không thể bị giả mạo.
//
// Dùng Web Crypto (crypto.subtle) để chạy được cả trên Edge middleware lẫn
// Node route handler mà không cần thêm dependency.

export const SESSION_COOKIE = "admin_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 giờ

const encoder = new TextEncoder();

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET chưa được cấu hình trong .env");
  }
  return secret;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(input: string): Uint8Array {
  let s = input.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Tạo token phiên: base64url(payload).base64url(hmac) */
export async function createSessionToken(
  ttlSeconds: number = SESSION_TTL_SECONDS
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({ exp })));
  const key = await importKey();
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(payload))
  );
  return `${payload}.${bytesToBase64Url(sig)}`;
}

/** Kiểm tra chữ ký + hạn dùng của token. */
export async function verifySessionToken(
  token: string | undefined | null
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, sigB64] = parts;

  let sig: Uint8Array;
  try {
    sig = base64UrlToBytes(sigB64);
  } catch {
    return false;
  }

  const key = await importKey();
  // crypto.subtle.verify so sánh HMAC ở thời gian hằng -> chống timing attack.
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sig,
    encoder.encode(payload)
  );
  if (!valid) return false;

  try {
    const data = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
    if (typeof data.exp !== "number") return false;
    if (Math.floor(Date.now() / 1000) > data.exp) return false;
  } catch {
    return false;
  }
  return true;
}

/** So sánh mật khẩu ở thời gian hằng (qua HMAC, không lộ độ dài). */
export async function verifyPassword(input: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    throw new Error("ADMIN_PASSWORD chưa được cấu hình trong .env");
  }
  if (typeof input !== "string" || input.length === 0) return false;

  const key = await importKey();
  const a = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(input))
  );
  const b = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(expected))
  );

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
