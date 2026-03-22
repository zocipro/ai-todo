import { verifyJWT, type AuthUser } from "./auth-utils";

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  DOUBAO_API_KEY?: string;
  DOUBAO_API_BASE_URL?: string;
  DOUBAO_MODEL?: string;
  ARK_API_KEY?: string;
  MIMO_API_KEY?: string;
};

// Extend the data object to carry auth info
type DataWithUser = { user: AuthUser | null };

// Security headers added to all responses
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' https://*.volces.com https://*.volcengineapi.com https://*.xiaomimomo.com; frame-ancestors 'none';",
};

export const onRequest: PagesFunction<Env, string, DataWithUser> = async (context) => {
  const authHeader = context.request.headers.get("Authorization");
  let user: AuthUser | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const secret = context.env.JWT_SECRET;
    if (secret) {
      user = await verifyJWT(token, secret);
    }
  }

  context.data.user = user;
  const response = await context.next();

  // Apply security headers to every response
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  return response;
};
