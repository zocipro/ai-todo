import { hashPassword, signJWT, json, type AuthUser } from "../../auth-utils";

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
      return json({ error: "数据库未配置。请在 wrangler.jsonc 中绑定 D1 数据库。" }, 500);
    }
    if (!env.JWT_SECRET) {
      return json({ error: "JWT_SECRET 未配置。请在 .dev.vars 或 Cloudflare 控制台中设置。" }, 500);
    }

    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return json({ error: "请输入邮箱和密码。" }, 400);
    }

    // Look up user
    const row = await env.DB.prepare(
      "SELECT id, email, password_hash, salt FROM users WHERE email = ?"
    )
      .bind(email)
      .first<{ id: string; email: string; password_hash: string; salt: string }>();

    if (!row) {
      return json({ error: "邮箱或密码错误。" }, 401);
    }

    // Verify password
    const { hash } = await hashPassword(password, row.salt);
    if (hash !== row.password_hash) {
      return json({ error: "邮箱或密码错误。" }, 401);
    }

    // Generate JWT
    const token = await signJWT({ id: row.id, email: row.email }, env.JWT_SECRET);

    return json({ token, user: { id: row.id, email: row.email } });
  } catch (e: any) {
    const detail = e?.message || String(e);
    const msg = detail.includes("no such table")
      ? "数据库表不存在，请先执行 schema.sql 建表。"
      : `登录失败：${detail}`;
    return json({ error: msg }, 500);
  }
};
