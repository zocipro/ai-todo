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

// --- Helpers ---

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
