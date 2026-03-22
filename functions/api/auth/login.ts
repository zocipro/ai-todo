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
    return json({ error: "登录失败，请稍后再试。", detail: e?.message }, 500);
  }
};
