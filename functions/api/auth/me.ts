import { json, type AuthUser } from "../../auth-utils";

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
};

export const onRequestGet: PagesFunction<Env, string, { user: AuthUser | null }> = async ({
  data,
}) => {
  if (!data.user) {
    return json({ error: "未登录。" }, 401);
  }
  return json({ user: data.user });
};
