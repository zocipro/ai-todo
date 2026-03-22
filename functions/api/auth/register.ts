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
    return json({ error: "注册失败，请稍后再试。", detail: e?.message }, 500);
  }
};
