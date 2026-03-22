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
  return context.next();
};
