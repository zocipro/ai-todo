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
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
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
      ? "No tasks yet. Add your first focus item above."
      : filter === "active"
        ? "All active tasks are complete."
        : "No completed tasks yet.";

  return (
    <div className="page">
      <header className="hero">
        <div>
          <span className="eyebrow">AI Todo</span>
          <h1>Keep your day calm and on track.</h1>
          <p className="subtitle">
            Capture tasks quickly, review them clearly, and keep everything stored
            in your browser.
          </p>
        </div>
        <div className="hero-card">
          <div className="stat">
            <span>Tasks</span>
            <strong>{totalCount}</strong>
          </div>
          <div className="stat">
            <span>Done</span>
            <strong>{completedCount}</strong>
          </div>
          <div className="stat">
            <span>Remaining</span>
            <strong>{remainingCount}</strong>
          </div>
        </div>
      </header>

      <section className="workspace">
        <form className="input-row" onSubmit={handleSubmit}>
          <input
            type="text"
            name="task"
            placeholder="Add a task you want to finish today"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            maxLength={120}
            aria-label="New task"
          />
          <button type="submit">Add task</button>
        </form>

        <div className="filters">
          <button
            type="button"
            className={filter === "all" ? "active" : ""}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={filter === "active" ? "active" : ""}
            aria-pressed={filter === "active"}
            onClick={() => setFilter("active")}
          >
            Active
          </button>
          <button
            type="button"
            className={filter === "done" ? "active" : ""}
            aria-pressed={filter === "done"}
            onClick={() => setFilter("done")}
          >
            Done
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
                    todo.done ? `Mark ${todo.text} as active` : `Mark ${todo.text} as done`
                  }
                />
                <div className="todo-text">
                  <span className={todo.done ? "done" : ""}>{todo.text}</span>
                  <span className="todo-meta">Added {formatDate(todo.createdAt)}</span>
                </div>
                <div className="todo-actions">
                  <button
                    type="button"
                    onClick={() => handleDelete(todo.id)}
                    aria-label={`Delete ${todo.text}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>

        <div className="footer">
          <span>Autosaved locally on this device.</span>
          <button
            className="clear"
            type="button"
            onClick={handleClearCompleted}
            disabled={completedCount === 0}
          >
            Clear completed
          </button>
        </div>
      </section>
    </div>
  );
}
