import { DragEvent, FormEvent, useEffect, useRef, useState } from "react";

type Filter = "all" | "active" | "done";
type Priority = "high" | "medium" | "low";
type Theme = "dark" | "light";

const TAG_OPTIONS = ["工作", "生活", "学习", "健康", "其他"] as const;
type Tag = (typeof TAG_OPTIONS)[number];

type Todo = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  priority: Priority;
  tag: Tag;
  dueDate: string | null;
};

const STORAGE_KEY = "ai-todo-items";
const API_KEY_STORAGE = "ai-todo-api-key";
const MIMO_KEY_STORAGE = "ai-todo-mimo-key";
const TTS_STYLE_STORAGE = "ai-todo-tts-style";
const THEME_STORAGE = "ai-todo-theme";

const TTS_STYLES = [
  { value: "", label: "自然朗读" },
  { value: "温柔轻声", label: "温柔轻声" },
  { value: "激昂慷慨如演讲", label: "激昂演讲" },
  { value: "活泼可爱", label: "活泼可爱" },
  { value: "沉稳冷静", label: "沉稳冷静" },
  { value: "困倦略带沙哑", label: "慵懒沙哑" },
] as const;

const PRIORITY_LABELS: Record<Priority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

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

const migrateTodo = (raw: Todo): Todo => ({
  ...raw,
  priority: raw.priority || "medium",
  tag: raw.tag || "其他",
  dueDate: raw.dueDate ?? null,
});

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
    return parsed.filter(isTodo).map(migrateTodo);
  } catch {
    return [];
  }
};

const getPreferredTheme = (): Theme => {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(THEME_STORAGE);
    if (stored === "dark" || stored === "light") {
      return stored;
    }
  }
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
};

const formatDate = (value: number) => {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
  }).format(new Date(value));
};

const formatDueDate = (dateStr: string) => {
  const date = new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(date);
};

const isOverdue = (dateStr: string | null, done: boolean) => {
  if (!dateStr || done) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + "T00:00:00");
  return due < today;
};

const isDueToday = (dateStr: string | null, done: boolean) => {
  if (!dateStr || done) return false;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return dateStr === todayStr;
};

const normalizeSuggestion = (value: string) =>
  value.replace(/^[\s\-•\d\.\)\(]+/, "").replace(/\s+/g, " ").trim();

const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Icons
const SunIcon = () => (
  <svg className="icon-sun" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z" />
  </svg>
);

const MoonIcon = () => (
  <svg className="icon-moon" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z" />
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const DragIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 16, height: 16 }}>
    <circle cx="9" cy="6" r="1.5" />
    <circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" />
    <circle cx="15" cy="18" r="1.5" />
  </svg>
);

const SpeakerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 16, height: 16 }}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

export default function App() {
  const [todos, setTodos] = useState<Todo[]>(() => loadTodos());
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [tagFilter, setTagFilter] = useState<Tag | "all">("all");
  const [inputPriority, setInputPriority] = useState<Priority>("medium");
  const [inputTag, setInputTag] = useState<Tag>("其他");
  const [inputDueDate, setInputDueDate] = useState("");
  const [aiInput, setAiInput] = useState("");
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiStatus, setAiStatus] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState("");
  const [theme, setTheme] = useState<Theme>(() => getPreferredTheme());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showAddOptions, setShowAddOptions] = useState(false);
  const [mimoKey, setMimoKey] = useState("");
  const [mimoKeyStatus, setMimoKeyStatus] = useState("");
  const [ttsStyle, setTtsStyle] = useState("");
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null);
  const [ttsError, setTtsError] = useState("");
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const [ttsPlayingId, setTtsPlayingId] = useState<string | null>(null);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_STORAGE, theme);
  }, [theme]);

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
    const savedMimoKey = localStorage.getItem(MIMO_KEY_STORAGE);
    if (savedMimoKey) {
      setMimoKey(savedMimoKey);
    }
    const savedStyle = localStorage.getItem(TTS_STYLE_STORAGE);
    if (savedStyle !== null) {
      setTtsStyle(savedStyle);
    }
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const totalCount = todos.length;
  const completedCount = todos.filter((todo) => todo.done).length;
  const remainingCount = totalCount - completedCount;
  const overdueCount = todos.filter((t) => isOverdue(t.dueDate, t.done)).length;

  const visibleTodos = todos.filter((todo) => {
    if (filter === "active" && todo.done) return false;
    if (filter === "done" && !todo.done) return false;
    if (tagFilter !== "all" && todo.tag !== tagFilter) return false;
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
      priority: inputPriority,
      tag: inputTag,
      dueDate: inputDueDate || null,
    };
    setTodos((prev) => [nextTodo, ...prev]);
    setInput("");
    setInputDueDate("");
    setShowAddOptions(false);
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

  // Drag and drop
  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) return;

    // Map visible indices to actual todo indices
    const visibleIds = visibleTodos.map((t) => t.id);
    const fromId = visibleIds[dragItem.current];
    const toId = visibleIds[dragOverItem.current];

    setTodos((prev) => {
      const items = [...prev];
      const fromIdx = items.findIndex((t) => t.id === fromId);
      const toIdx = items.findIndex((t) => t.id === toId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = items.splice(fromIdx, 1);
      items.splice(toIdx, 0, moved);
      return items;
    });

    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
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
        priority: "medium" as Priority,
        tag: "其他" as Tag,
        dueDate: null,
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
      const rawText = await response.text();
      let data: { tasks?: unknown; error?: unknown } | null = null;
      if (rawText) {
        try {
          data = JSON.parse(rawText);
        } catch {
          data = null;
        }
      }

      if (!response.ok) {
        const baseMessage =
          typeof data?.error === "string" ? data.error : `请求失败（${response.status}）`;
        const hint =
          response.status === 404
            ? "未检测到后端 /api/ai-todo，请使用 wrangler pages dev 或部署到 Cloudflare Pages。"
            : "";
        throw new Error(hint ? `${baseMessage} ${hint}` : baseMessage);
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

  // TTS handlers
  const handleSaveMimoKey = () => {
    if (typeof localStorage === "undefined") return;
    const trimmed = mimoKey.trim();
    if (!trimmed) {
      localStorage.removeItem(MIMO_KEY_STORAGE);
      setMimoKeyStatus("已清除 MiMo API Key。");
      return;
    }
    localStorage.setItem(MIMO_KEY_STORAGE, trimmed);
    setMimoKey(trimmed);
    setMimoKeyStatus("MiMo API Key 已保存。");
  };

  const handleClearMimoKey = () => {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(MIMO_KEY_STORAGE);
    }
    setMimoKey("");
    setMimoKeyStatus("已清除 MiMo API Key。");
  };

  const handleTtsStyleChange = (style: string) => {
    setTtsStyle(style);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(TTS_STYLE_STORAGE, style);
    }
  };

  const handleTtsStop = () => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    setTtsPlayingId(null);
  };

  const handleTtsSpeak = async (todoId: string, text: string) => {
    // If already playing this one, stop it
    if (ttsPlayingId === todoId) {
      handleTtsStop();
      return;
    }
    // Stop any current playback
    handleTtsStop();

    setTtsLoadingId(todoId);
    setTtsError("");

    try {
      const payload: Record<string, unknown> = { text };
      const trimmedKey = mimoKey.trim();
      if (trimmedKey) {
        payload.apiKey = trimmedKey;
      }
      if (ttsStyle) {
        payload.style = ttsStyle;
      }

      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const msg = typeof data?.error === "string" ? data.error : `语音合成失败（${response.status}）`;
        const hint = typeof data?.hint === "string" ? `\n${data.hint}` : "";
        throw new Error(msg + hint);
      }

      if (!data?.audio) {
        throw new Error("未收到音频数据。");
      }

      // Play base64 wav audio
      const audioSrc = `data:audio/wav;base64,${data.audio}`;
      const audio = new Audio(audioSrc);
      ttsAudioRef.current = audio;
      setTtsPlayingId(todoId);

      audio.onended = () => {
        setTtsPlayingId(null);
        ttsAudioRef.current = null;
      };
      audio.onerror = () => {
        setTtsPlayingId(null);
        ttsAudioRef.current = null;
        setTtsError("音频播放失败。");
      };

      await audio.play();
    } catch (error) {
      setTtsError(error instanceof Error ? error.message : "语音合成失败。");
    } finally {
      setTtsLoadingId(null);
    }
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
        : filter === "done"
          ? "还没有已完成的任务。"
          : "没有匹配的任务。";

  const aiInputReady = aiInput.trim().length > 0;
  const hasLocalKey = apiKey.trim().length > 0;
  const hasMimoKey = mimoKey.trim().length > 0;

  return (
    <>
      <div className="bg-animated" />

      <nav className="navbar">
        <div className="nav-container">
          <div className="nav-logo">
            <svg viewBox="0 0 64 64" fill="none">
              <rect width="64" height="64" rx="14" fill="currentColor" opacity="0.15" />
              <path
                d="M18 34l10 10 18-22"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>AI 待办</span>
          </div>
          <div className="nav-right">
            <button
              className="theme-toggle"
              onClick={() => setSettingsOpen(true)}
              aria-label="设置"
            >
              <SettingsIcon />
            </button>
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label="切换主题"
            >
              <SunIcon />
              <MoonIcon />
            </button>
          </div>
        </div>
      </nav>

      {/* 设置弹窗 */}
      {settingsOpen ? (
        <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>设置</h2>
              <button
                className="modal-close"
                onClick={() => setSettingsOpen(false)}
                aria-label="关闭设置"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="modal-body">
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

              {/* TTS 语音合成设置 */}
              <div className="ai-panel tts-panel">
                <div className="ai-header">
                  <div>
                    <h2>语音合成</h2>
                    <p>点击任务旁的喇叭图标，AI 会朗读任务内容。</p>
                  </div>
                  <span className="ai-badge tts-badge">MiMo TTS</span>
                </div>

                <div className="ai-key">
                  <div className="ai-key-header">
                    <span>MiMo API Key</span>
                    <span className={`ai-key-indicator ${hasMimoKey ? "ready" : ""}`}>
                      {hasMimoKey ? "已保存" : "未保存"}
                    </span>
                  </div>
                  <div className="ai-key-row">
                    <input
                      type="password"
                      name="mimo-api-key"
                      placeholder="粘贴 MiMo API Key"
                      value={mimoKey}
                      onChange={(e) => setMimoKey(e.target.value)}
                      autoComplete="off"
                      aria-label="MiMo API Key"
                    />
                    <button type="button" onClick={handleSaveMimoKey}>
                      保存
                    </button>
                    <button type="button" className="ghost" onClick={handleClearMimoKey}>
                      清除
                    </button>
                  </div>
                  <p className="ai-key-help">
                    从 platform.xiaomimimo.com 获取 API Key，未填写时使用服务器环境变量。
                  </p>
                  {mimoKeyStatus ? <span className="ai-key-status">{mimoKeyStatus}</span> : null}
                </div>

                <div className="tts-style-section">
                  <label>朗读风格</label>
                  <div className="tts-style-selector">
                    {TTS_STYLES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        className={`tag-btn ${ttsStyle === s.value ? "selected" : ""}`}
                        onClick={() => handleTtsStyleChange(s.value)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="page">
        <section className="workspace">
          <div className="workspace-header">
            <div className="stats-row">
              <div className="stat-inline">
                <span>任务</span>
                <strong>{totalCount}</strong>
              </div>
              <div className="stat-inline">
                <span>已完成</span>
                <strong>{completedCount}</strong>
              </div>
              <div className="stat-inline">
                <span>剩余</span>
                <strong>{remainingCount}</strong>
              </div>
              {overdueCount > 0 ? (
                <div className="stat-inline stat-overdue">
                  <span>逾期</span>
                  <strong>{overdueCount}</strong>
                </div>
              ) : null}
            </div>
          </div>

          <form className="input-row" onSubmit={handleSubmit}>
            <input
              type="text"
              name="task"
              placeholder="添加今天想完成的任务"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onFocus={() => setShowAddOptions(true)}
              maxLength={120}
              aria-label="新任务"
            />
            <button type="submit">添加</button>
          </form>

          {showAddOptions ? (
            <div className="add-options">
              <div className="add-option-group">
                <label>优先级</label>
                <div className="priority-selector">
                  {(["high", "medium", "low"] as Priority[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`priority-btn priority-${p} ${inputPriority === p ? "selected" : ""}`}
                      onClick={() => setInputPriority(p)}
                    >
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="add-option-group">
                <label>标签</label>
                <div className="tag-selector">
                  {TAG_OPTIONS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`tag-btn ${inputTag === t ? "selected" : ""}`}
                      onClick={() => setInputTag(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="add-option-group">
                <label>截止日期</label>
                <input
                  type="date"
                  value={inputDueDate}
                  min={getTodayStr()}
                  onChange={(e) => setInputDueDate(e.target.value)}
                  className="date-input"
                />
              </div>
              <button
                type="button"
                className="add-options-close"
                onClick={() => setShowAddOptions(false)}
              >
                收起选项
              </button>
            </div>
          ) : null}

          <div className="filters">
            <div className="filter-group">
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
            <div className="filter-group">
              <button
                type="button"
                className={tagFilter === "all" ? "active" : ""}
                onClick={() => setTagFilter("all")}
              >
                全部标签
              </button>
              {TAG_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={tagFilter === t ? "active" : ""}
                  onClick={() => setTagFilter(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <ul className="list">
            {visibleTodos.length === 0 ? (
              <li className="empty">{emptyMessage}</li>
            ) : (
              visibleTodos.map((todo, index) => (
                <li
                  key={todo.id}
                  className={`todo ${isOverdue(todo.dueDate, todo.done) ? "todo-overdue" : ""} ${isDueToday(todo.dueDate, todo.done) ? "todo-due-today" : ""}`}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragEnter={() => handleDragEnter(index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleDragOver}
                >
                  <span className="drag-handle">
                    <DragIcon />
                  </span>
                  <span className={`priority-dot priority-${todo.priority}`} title={`优先级：${PRIORITY_LABELS[todo.priority]}`} />
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
                    <div className="todo-meta">
                      <span className={`tag-pill tag-${todo.tag}`}>{todo.tag}</span>
                      {todo.dueDate ? (
                        <span className={`due-date ${isOverdue(todo.dueDate, todo.done) ? "overdue" : ""} ${isDueToday(todo.dueDate, todo.done) ? "due-today" : ""}`}>
                          {isOverdue(todo.dueDate, todo.done) ? "已逾期 " : isDueToday(todo.dueDate, todo.done) ? "今天 " : ""}
                          {formatDueDate(todo.dueDate)}
                        </span>
                      ) : null}
                      <span>添加于 {formatDate(todo.createdAt)}</span>
                    </div>
                  </div>
                  <div className="todo-actions">
                    <button
                      type="button"
                      className={`tts-btn ${ttsPlayingId === todo.id ? "playing" : ""}`}
                      onClick={() => handleTtsSpeak(todo.id, todo.text)}
                      disabled={ttsLoadingId === todo.id}
                      aria-label={ttsPlayingId === todo.id ? "停止朗读" : `朗读 ${todo.text}`}
                      title={ttsPlayingId === todo.id ? "停止" : "朗读"}
                    >
                      {ttsLoadingId === todo.id ? (
                        <span className="tts-loading" />
                      ) : ttsPlayingId === todo.id ? (
                        <StopIcon />
                      ) : (
                        <SpeakerIcon />
                      )}
                    </button>
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

          {ttsError ? (
            <div className="tts-error" role="alert">
              {ttsError}
              <button type="button" onClick={() => setTtsError("")}>关闭</button>
            </div>
          ) : null}

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
    </>
  );
}
