import { json, type AuthUser } from "../auth-utils";

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
};

type TodoRow = {
  id: string;
  user_id: string;
  text: string;
  done: number;
  priority: string;
  tag: string;
  due_date: string | null;
  created_at: number;
};

function rowToTodo(row: TodoRow) {
  return {
    id: row.id,
    text: row.text,
    done: row.done === 1,
    priority: row.priority,
    tag: row.tag,
    dueDate: row.due_date,
    createdAt: row.created_at,
  };
}

// GET /api/todos — list all todos for the authenticated user
export const onRequestGet: PagesFunction<Env, string, { user: AuthUser | null }> = async ({
  data,
  env,
}) => {
  if (!data.user) return json({ error: "未登录。" }, 401);

  const { results } = await env.DB.prepare(
    "SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC"
  )
    .bind(data.user.id)
    .all<TodoRow>();

  return json({ todos: (results || []).map(rowToTodo) });
};

// POST /api/todos — bulk upsert todos (for sync)
export const onRequestPost: PagesFunction<Env, string, { user: AuthUser | null }> = async ({
  request,
  data,
  env,
}) => {
  if (!data.user) return json({ error: "未登录。" }, 401);

  try {
    const body = await request.json().catch(() => null);
    const todos = Array.isArray(body?.todos) ? body.todos : [];

    if (todos.length > 0) {
      const stmts = todos.map((t: any) =>
        env.DB.prepare(
          `INSERT OR REPLACE INTO todos (id, user_id, text, done, priority, tag, due_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          String(t.id),
          data.user!.id,
          String(t.text || ""),
          t.done ? 1 : 0,
          String(t.priority || "medium"),
          String(t.tag || "其他"),
          t.dueDate || t.due_date || null,
          typeof t.createdAt === "number" ? t.createdAt : Date.now()
        )
      );
      await env.DB.batch(stmts);
    }

    // Return the full updated list
    const { results } = await env.DB.prepare(
      "SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC"
    )
      .bind(data.user.id)
      .all<TodoRow>();

    return json({ todos: (results || []).map(rowToTodo) });
  } catch (e: any) {
    return json({ error: "同步失败。", detail: e?.message }, 500);
  }
};
