import {
  hashPassword,
  signJWT,
  json,
  timingSafeEqual,
  checkRateLimit,
  recordLoginAttempt,
  getClientIP,
  type AuthUser,
} from "../../auth-utils";

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
};

export const onRequestPost: PagesFunction<Env, string, { user: AuthUser | null }> = async ({
  request,
  env,
}) => {
  try {
    if (!env.DB || !env.JWT_SECRET) {
      return json({ error: "服务配置异常，请联系管理员。" }, 500);
    }

    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return json({ error: "请输入邮箱和密码。" }, 400);
    }

    // Rate limit check
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(env.DB, ip, email);
    if (!rateCheck.allowed) {
      return json(
        { error: "登录尝试次数过多，请 15 分钟后再试。" },
        429
      );
    }

    // Look up user
    const row = await env.DB.prepare(
      "SELECT id, email, password_hash, salt FROM users WHERE email = ?"
    )
      .bind(email)
      .first<{ id: string; email: string; password_hash: string; salt: string }>();

    if (!row) {
      // Record failed attempt, then do a dummy hash to prevent timing attacks
      await recordLoginAttempt(env.DB, ip, email, false);
      await hashPassword("dummy-password-for-timing", "dW1tbXktc2FsdA");
      return json({ error: "邮箱或密码错误。" }, 401);
    }

    // Verify password with timing-safe comparison
    const { hash } = await hashPassword(password, row.salt);
    const passwordMatch = await timingSafeEqual(hash, row.password_hash);

    if (!passwordMatch) {
      await recordLoginAttempt(env.DB, ip, email, false);
      return json({ error: "邮箱或密码错误。" }, 401);
    }

    // Success — record and clear lockout concern
    await recordLoginAttempt(env.DB, ip, email, true);

    // Generate JWT
    const token = await signJWT({ id: row.id, email: row.email }, env.JWT_SECRET);

    return json({ token, user: { id: row.id, email: row.email } });
  } catch {
    return json({ error: "登录失败，请稍后再试。" }, 500);
  }
};
