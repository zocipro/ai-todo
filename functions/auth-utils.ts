// JWT and password hashing utilities using Web Crypto API
// Compatible with Cloudflare Workers runtime (no Node.js built-ins)

export type AuthUser = { id: string; email: string };

// --- Base64url helpers ---

function toBase64url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeJSON(obj: object): string {
  return toBase64url(new TextEncoder().encode(JSON.stringify(obj)));
}

// --- JWT ---

export async function signJWT(
  payload: { id: string; email: string },
  secret: string,
  expiresInHours = 72
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInHours * 3600 };

  const headerB64 = encodeJSON(header);
  const payloadB64 = encodeJSON(fullPayload);
  const data = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return `${data}.${toBase64url(sig)}`;
}

export async function verifyJWT(token: string, secret: string): Promise<AuthUser | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const data = `${parts[0]}.${parts[1]}`;
    const sig = fromBase64url(parts[2]);
    const valid = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(data));
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromBase64url(parts[1])));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return { id: payload.id, email: payload.email };
  } catch {
    return null;
  }
}

// --- Password Hashing (PBKDF2) ---

export async function hashPassword(
  password: string,
  existingSalt?: string
): Promise<{ hash: string; salt: string }> {
  const saltBytes = existingSalt
    ? fromBase64url(existingSalt)
    : crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );

  return {
    hash: toBase64url(hashBuffer),
    salt: existingSalt || toBase64url(saltBytes),
  };
}

// --- Timing-safe comparison ---

export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);

  // Import both as HMAC keys with a fixed key to get constant-time comparison
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(32),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign("HMAC", key, aBuf),
    crypto.subtle.sign("HMAC", key, bBuf),
  ]);

  const viewA = new Uint8Array(sigA);
  const viewB = new Uint8Array(sigB);
  if (viewA.length !== viewB.length) return false;
  let diff = 0;
  for (let i = 0; i < viewA.length; i++) diff |= viewA[i] ^ viewB[i];
  return diff === 0;
}

// --- Rate limiting ---

const RATE_LIMIT_WINDOW = 900; // 15 minutes in seconds
const MAX_ATTEMPTS_PER_IP = 20; // per IP in the window
const MAX_ATTEMPTS_PER_EMAIL = 5; // per email (account lockout)

export async function checkRateLimit(
  db: D1Database,
  ip: string,
  email: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - RATE_LIMIT_WINDOW;

  try {
    // Check IP-based rate limit
    const ipCount = await db
      .prepare("SELECT COUNT(*) as cnt FROM login_attempts WHERE ip = ? AND attempted_at > ?")
      .bind(ip, windowStart)
      .first<{ cnt: number }>();

    if (ipCount && ipCount.cnt >= MAX_ATTEMPTS_PER_IP) {
      return { allowed: false, retryAfter: RATE_LIMIT_WINDOW };
    }

    // Check email-based lockout (only failed attempts)
    if (email) {
      const emailCount = await db
        .prepare(
          "SELECT COUNT(*) as cnt FROM login_attempts WHERE email = ? AND attempted_at > ? AND success = 0"
        )
        .bind(email, windowStart)
        .first<{ cnt: number }>();

      if (emailCount && emailCount.cnt >= MAX_ATTEMPTS_PER_EMAIL) {
        return { allowed: false, retryAfter: RATE_LIMIT_WINDOW };
      }
    }

    return { allowed: true };
  } catch {
    // If the table doesn't exist yet, allow the request (graceful degradation)
    return { allowed: true };
  }
}

export async function recordLoginAttempt(
  db: D1Database,
  ip: string,
  email: string,
  success: boolean
): Promise<void> {
  try {
    await db
      .prepare("INSERT INTO login_attempts (ip, email, attempted_at, success) VALUES (?, ?, unixepoch(), ?)")
      .bind(ip, email, success ? 1 : 0)
      .run();

    // Clean up old records (older than 1 hour) periodically
    if (Math.random() < 0.05) {
      const cutoff = Math.floor(Date.now() / 1000) - 3600;
      await db.prepare("DELETE FROM login_attempts WHERE attempted_at < ?").bind(cutoff).run();
    }
  } catch {
    // Non-critical — don't break auth if logging fails
  }
}

// --- Helpers ---

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "密码至少需要 8 个字符。";
  if (!/[a-zA-Z]/.test(password) && !/[\u4e00-\u9fff]/.test(password))
    return "密码需要包含至少一个字母。";
  if (!/[0-9]/.test(password) && !/[^a-zA-Z0-9\s]/.test(password))
    return "密码需要包含至少一个数字或特殊字符。";
  return null;
}

export function getClientIP(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
