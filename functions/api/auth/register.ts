import {
  hashPassword,
  signJWT,
  json,
  validateEmail,
  validatePassword,
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

    if (!email || !validateEmail(email)) {
      return json({ error: "请输入有效的邮箱地址。" }, 400);
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return json({ error: passwordError }, 400);
    }

    // Rate limit check (use IP only, no email for register)
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(env.DB, ip, "");
    if (!rateCheck.allowed) {
      return json({ error: "操作过于频繁，请 15 分钟后再试。" }, 429);
    }

    // Check if email already exists — return generic error to prevent enumeration
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
      .bind(email)
      .first();
    if (existing) {
      // Use same status code as other validation errors to prevent enumeration
      return json({ error: "注册失败，请检查输入信息或稍后再试。" }, 400);
    }

    // Hash password and create user
    const { hash, salt } = await hashPassword(password);
    const id = crypto.randomUUID();

    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, salt) VALUES (?, ?, ?, ?)"
    )
      .bind(id, email, hash, salt)
      .run();

    // Record successful registration as a login attempt for rate limiting
    await recordLoginAttempt(env.DB, ip, email, true);

    // Generate JWT
    const token = await signJWT({ id, email }, env.JWT_SECRET);

    return json({ token, user: { id, email } });
  } catch {
    return json({ error: "注册失败，请稍后再试。" }, 500);
  }
};
