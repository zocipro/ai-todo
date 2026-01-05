import { FormEvent, useEffect, useState } from "react";

type Filter = "all" | "active" | "done";

type Todo = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
};

const STORAGE_KEY = "ai-todo-items";

const createId = () => {
  if (globalThis.crypto && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const isTodo = (value: unknown): value is Todo => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.text === "string" &&
    typeof record.done === "boolean" &&
    typeof record.createdAt === "number"
  );
};

const loadTodos = (): Todo[] => {
  if (typeof localStorage === "undefined") {
    return [];
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isTodo);
  } catch {
    return [];
  }
};

const formatDate = (value: number) => {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
  }).format(new Date(value));
};

export default function App() {
  const [todos, setTodos] = useState<Todo[]>(() => loadTodos());
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  const totalCount = todos.length;
  const completedCount = todos.filter((todo) => todo.done).length;
  const remainingCount = totalCount - completedCount;

  const visibleTodos = todos.filter((todo) => {
    if (filter === "active") {
      return !todo.done;
    }
    if (filter === "done") {
      return todo.done;
    }
    return true;
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }
    const nextTodo: Todo = {
      id: createId(),
      text: trimmed,
      done: false,
      createdAt: Date.now(),
    };
    setTodos((prev) => [nextTodo, ...prev]);
    setInput("");
  };

  const handleToggle = (id: string) => {
    setTodos((prev) =>
      prev.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo))
    );
  };

  const handleDelete = (id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id));
  };

  const handleClearCompleted = () => {
    setTodos((prev) => prev.filter((todo) => !todo.done));
  };

  const emptyMessage =
    totalCount === 0
      ? "还没有任务。先在上方添加第一件事项。"
      : filter === "active"
        ? "进行中的任务已全部完成。"
        : "还没有已完成的任务。";

  return (
    <div className="page">
      <header className="hero">
        <div>
          <span className="eyebrow">AI 待办</span>
          <h1>让一天更从容、更有条理。</h1>
          <p className="subtitle">
            快速记录任务，清晰回顾，全部保存在浏览器中。
          </p>
        </div>
        <div className="hero-card">
          <div className="stat">
            <span>任务</span>
            <strong>{totalCount}</strong>
          </div>
          <div className="stat">
            <span>已完成</span>
            <strong>{completedCount}</strong>
          </div>
          <div className="stat">
            <span>剩余</span>
            <strong>{remainingCount}</strong>
          </div>
        </div>
      </header>

      <section className="workspace">
        <form className="input-row" onSubmit={handleSubmit}>
          <input
            type="text"
            name="task"
            placeholder="添加今天想完成的任务"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            maxLength={120}
            aria-label="新任务"
          />
          <button type="submit">添加任务</button>
        </form>

        <div className="filters">
          <button
            type="button"
            className={filter === "all" ? "active" : ""}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            全部
          </button>
          <button
            type="button"
            className={filter === "active" ? "active" : ""}
            aria-pressed={filter === "active"}
            onClick={() => setFilter("active")}
          >
            进行中
          </button>
          <button
            type="button"
            className={filter === "done" ? "active" : ""}
            aria-pressed={filter === "done"}
            onClick={() => setFilter("done")}
          >
            已完成
          </button>
        </div>

        <ul className="list">
          {visibleTodos.length === 0 ? (
            <li className="empty">{emptyMessage}</li>
          ) : (
            visibleTodos.map((todo) => (
              <li key={todo.id} className="todo">
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => handleToggle(todo.id)}
                  aria-label={
                    todo.done
                      ? `将 ${todo.text} 标记为进行中`
                      : `将 ${todo.text} 标记为已完成`
                  }
                />
                <div className="todo-text">
                  <span className={todo.done ? "done" : ""}>{todo.text}</span>
                  <span className="todo-meta">添加于 {formatDate(todo.createdAt)}</span>
                </div>
                <div className="todo-actions">
                  <button
                    type="button"
                    onClick={() => handleDelete(todo.id)}
                    aria-label={`删除 ${todo.text}`}
                  >
                    删除
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>

        <div className="footer">
          <span>已自动保存在本机浏览器中。</span>
          <button
            className="clear"
            type="button"
            onClick={handleClearCompleted}
            disabled={completedCount === 0}
          >
            清除已完成
          </button>
        </div>
      </section>
    </div>
  );
}
