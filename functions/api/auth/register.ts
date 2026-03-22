import { hashPassword, signJWT, json, validateEmail, type AuthUser } from "../../auth-utils";

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
};

export const onRequestPost: PagesFunction<Env, string, { user: AuthUser | null }> = async ({
  request,
  env,
}) => {
  try {
    if (!env.DB) {
      return json({ error: "数据库未配置。请在 wrangler.jsonc 中绑定 D1 数据库，并执行 schema.sql 建表。" }, 500);
    }
    if (!env.JWT_SECRET) {
      return json({ error: "JWT_SECRET 未配置。请在 .dev.vars 或 Cloudflare 控制台中设置。" }, 500);
    }

    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !validateEmail(email)) {
      return json({ error: "请输入有效的邮箱地址。" }, 400);
    }
    if (password.length < 6) {
      return json({ error: "密码至少需要 6 个字符。" }, 400);
    }

    // Check if email already exists
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
      .bind(email)
      .first();
    if (existing) {
      return json({ error: "该邮箱已被注册。" }, 409);
    }

    // Hash password and create user
    const { hash, salt } = await hashPassword(password);
    const id = crypto.randomUUID();

    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, salt) VALUES (?, ?, ?, ?)"
    )
      .bind(id, email, hash, salt)
      .run();

    // Generate JWT
    const token = await signJWT({ id, email }, env.JWT_SECRET);

    return json({ token, user: { id, email } });
  } catch (e: any) {
    const detail = e?.message || String(e);
    const msg = detail.includes("no such table")
      ? "数据库表不存在，请先执行 schema.sql 建表。"
      : `注册失败：${detail}`;
    return json({ error: msg }, 500);
  }
};
