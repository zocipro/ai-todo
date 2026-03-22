import { json, type AuthUser } from "../../auth-utils";

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
};

// DELETE /api/todos/:id
export const onRequestDelete: PagesFunction<Env, string, { user: AuthUser | null }> = async ({
  params,
  data,
  env,
}) => {
  if (!data.user) return json({ error: "未登录。" }, 401);

  const id = params.id as string;
  await env.DB.prepare("DELETE FROM todos WHERE id = ? AND user_id = ?")
    .bind(id, data.user.id)
    .run();

  return json({ ok: true });
};
