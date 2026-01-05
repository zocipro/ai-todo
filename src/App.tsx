import { FormEvent, useEffect, useState } from "react";

type Filter = "all" | "active" | "done";

type Todo = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
};

const STORAGE_KEY = "ai-todo-items";
const API_KEY_STORAGE = "ai-todo-api-key";

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

const normalizeSuggestion = (value: string) =>
  value.replace(/^[\s\-•\d\.\)\(]+/, "").replace(/\s+/g, " ").trim();

export default function App() {
  const [todos, setTodos] = useState<Todo[]>(() => loadTodos());
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [aiInput, setAiInput] = useState("");
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiStatus, setAiStatus] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  useEffect(() => {
    if (typeof localStorage === "undefined") {
      return;
    }
    const savedKey = localStorage.getItem(API_KEY_STORAGE);
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

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

  const buildTodos = (items: string[]) => {
    const existing = new Set(todos.map((todo) => todo.text));
    const now = Date.now();
    return items
      .map((item) => normalizeSuggestion(item))
      .filter(Boolean)
      .filter((item) => !existing.has(item))
      .map((text, index) => ({
        id: createId(),
        text,
        done: false,
        createdAt: now + index,
      }));
  };

  const handleAiGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = aiInput.trim();
    if (!prompt || aiLoading) {
      return;
    }
    setAiLoading(true);
    setAiError("");
    setAiStatus("正在生成任务建议...");

    try {
      const trimmedKey = apiKey.trim();
      const payload: Record<string, unknown> = { prompt };
      if (trimmedKey) {
        payload.apiKey = trimmedKey;
      }

      const response = await fetch("/api/ai-todo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          typeof data?.error === "string" ? data.error : "AI 生成失败，请稍后重试。";
        throw new Error(message);
      }

      const tasks: unknown[] = Array.isArray(data?.tasks) ? data.tasks : [];
      const cleaned = Array.from(
        new Set(
          tasks
            .filter((task: unknown): task is string => typeof task === "string")
            .map((task) => normalizeSuggestion(task))
            .filter(Boolean)
        )
      ).slice(0, 12);

      if (cleaned.length === 0) {
        setAiSuggestions([]);
        setAiStatus("未生成有效任务，请换个描述再试。");
        return;
      }

      setAiSuggestions(cleaned);
      setAiStatus(`已生成 ${cleaned.length} 条建议。`);
    } catch (error) {
      setAiSuggestions([]);
      setAiStatus("");
      setAiError(error instanceof Error ? error.message : "AI 生成失败，请稍后重试。");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiClearInput = () => {
    setAiInput("");
    setAiError("");
    setAiStatus("");
  };

  const handleAddSuggestion = (task: string) => {
    const nextTodos = buildTodos([task]);
    if (nextTodos.length === 0) {
      setAiStatus("该任务已在清单中。");
      return;
    }
    setTodos((prev) => [...nextTodos, ...prev]);
    setAiSuggestions((prev) => prev.filter((item) => item !== task));
    setAiStatus("已添加 1 条到待办。");
  };

  const handleAddAllSuggestions = () => {
    const nextTodos = buildTodos(aiSuggestions);
    if (nextTodos.length === 0) {
      setAiStatus("建议已存在于清单中。");
      return;
    }
    setTodos((prev) => [...nextTodos, ...prev]);
    setAiSuggestions([]);
    setAiStatus(`已添加 ${nextTodos.length} 条到待办。`);
  };

  const handleClearSuggestions = () => {
    setAiSuggestions([]);
    setAiStatus("");
  };

  const handleSaveApiKey = () => {
    if (typeof localStorage === "undefined") {
      return;
    }
    const trimmed = apiKey.trim();
    if (!trimmed) {
      localStorage.removeItem(API_KEY_STORAGE);
      setApiKeyStatus("已清除 API Key。");
      return;
    }
    localStorage.setItem(API_KEY_STORAGE, trimmed);
    setApiKey(trimmed);
    setApiKeyStatus("API Key 已保存在本机浏览器中。");
  };

  const handleClearApiKey = () => {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(API_KEY_STORAGE);
    }
    setApiKey("");
    setApiKeyStatus("已清除 API Key。");
  };

  const emptyMessage =
    totalCount === 0
      ? "还没有任务。先在上方添加第一件事项。"
      : filter === "active"
        ? "进行中的任务已全部完成。"
        : "还没有已完成的任务。";

  const aiInputReady = aiInput.trim().length > 0;
  const hasLocalKey = apiKey.trim().length > 0;

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
        <div className="ai-panel">
          <div className="ai-header">
            <div>
              <h2>AI 任务助手</h2>
              <p>描述你的目标，AI 会拆解成可执行的待办清单。</p>
            </div>
            <span className="ai-badge">豆包大模型</span>
          </div>

          <div className="ai-key">
            <div className="ai-key-header">
              <span>API Key</span>
              <span className={`ai-key-indicator ${hasLocalKey ? "ready" : ""}`}>
                {hasLocalKey ? "已保存" : "未保存"}
              </span>
            </div>
            <div className="ai-key-row">
              <input
                type="password"
                name="api-key"
                placeholder="粘贴豆包 API Key"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                autoComplete="off"
                aria-label="豆包 API Key"
              />
              <button type="button" onClick={handleSaveApiKey}>
                保存
              </button>
              <button type="button" className="ghost" onClick={handleClearApiKey}>
                清除
              </button>
            </div>
            <p className="ai-key-help">
              密钥仅保存在本机浏览器中，未填写时将使用服务器环境变量。
            </p>
            {apiKeyStatus ? <span className="ai-key-status">{apiKeyStatus}</span> : null}
          </div>

          <form className="ai-form" onSubmit={handleAiGenerate}>
            <textarea
              name="ai-task"
              placeholder="例如：筹备下周的产品发布会"
              value={aiInput}
              onChange={(event) => setAiInput(event.target.value)}
              maxLength={240}
              rows={3}
              aria-label="AI 任务描述"
            />
            <div className="ai-actions">
              <button type="submit" disabled={!aiInputReady || aiLoading}>
                {aiLoading ? "生成中..." : "AI 生成清单"}
              </button>
              <button type="button" className="ghost" onClick={handleAiClearInput}>
                清空输入
              </button>
              <span className="ai-status" role="status" aria-live="polite">
                {aiStatus}
              </span>
            </div>
          </form>

          {aiError ? (
            <div className="ai-error" role="alert">
              {aiError}
            </div>
          ) : null}

          {aiSuggestions.length > 0 ? (
            <div className="ai-suggestions">
              <div className="ai-suggestions-header">
                <span>AI 建议清单</span>
                <div className="ai-suggestions-actions">
                  <button type="button" onClick={handleAddAllSuggestions}>
                    全部添加
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={handleClearSuggestions}
                  >
                    清空建议
                  </button>
                </div>
              </div>
              <ul>
                {aiSuggestions.map((task) => (
                  <li key={task} className="ai-suggestion">
                    <span>{task}</span>
                    <button type="button" onClick={() => handleAddSuggestion(task)}>
                      添加
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

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
