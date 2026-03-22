import { json, type AuthUser } from "../auth-utils";

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
};

// GET /api/settings — get user settings (API keys, model preferences)
export const onRequestGet: PagesFunction<Env, string, { user: AuthUser | null }> = async ({
  data,
  env,
}) => {
  if (!data.user) return json({ error: "未登录。" }, 401);

  const row = await env.DB.prepare(
    "SELECT settings_json FROM user_settings WHERE user_id = ?"
  )
    .bind(data.user.id)
    .first<{ settings_json: string }>();

  const settings = row ? JSON.parse(row.settings_json) : {};
  return json({ settings });
};

// POST /api/settings — save user settings
export const onRequestPost: PagesFunction<Env, string, { user: AuthUser | null }> = async ({
  request,
  data,
  env,
}) => {
  if (!data.user) return json({ error: "未登录。" }, 401);

  try {
    const body = await request.json().catch(() => null);
    const incoming = body?.settings;
    if (!incoming || typeof incoming !== "object") {
      return json({ error: "无效的设置数据。" }, 400);
    }

    // Merge with existing settings instead of overwriting
    const existing = await env.DB.prepare(
      "SELECT settings_json FROM user_settings WHERE user_id = ?"
    )
      .bind(data.user.id)
      .first<{ settings_json: string }>();

    const merged = existing ? { ...JSON.parse(existing.settings_json), ...incoming } : { ...incoming };

    const settingsJson = JSON.stringify(merged);
    await env.DB.prepare(
      `INSERT OR REPLACE INTO user_settings (user_id, settings_json, updated_at)
       VALUES (?, ?, unixepoch())`
    )
      .bind(data.user.id, settingsJson)
      .run();

    return json({ settings: merged });
  } catch (e: any) {
    return json({ error: "保存设置失败。", detail: e?.message }, 500);
  }
};
