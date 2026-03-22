import { DragEvent, FormEvent, useEffect, useRef, useState } from "react";
import AuthModal from "./AuthModal";
import { authFetch, clearAuth, getToken, getUser, type AuthUser } from "./auth";

type Page = "todo" | "tts";
type Filter = "all" | "active" | "done";
type Priority = "high" | "medium" | "low";
type Theme = "dark" | "light";

const TAG_OPTIONS = ["工作", "生活", "学习", "健康", "其他"] as const;
type Tag = (typeof TAG_OPTIONS)[number];

export type Todo = {
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
const DOUBAO_MODEL_STORAGE = "ai-todo-doubao-model";

const DOUBAO_MODELS = [
  { value: "doubao-seed-2-0-pro-260215", label: "2.0 Pro", desc: "旗舰版，深度推理" },
  { value: "doubao-seed-2-0-lite-260215", label: "2.0 Lite", desc: "均衡性价比" },
  { value: "doubao-seed-2-0-mini-260215", label: "2.0 Mini", desc: "轻量低延迟" },
] as const;

const TTS_STYLES = [
  { value: "", label: "自然朗读" },
  { value: "温柔轻声", label: "温柔轻声" },
  { value: "激昂慷慨如演讲", label: "激昂演讲" },
  { value: "活泼可爱", label: "活泼可爱" },
  { value: "沉稳冷静", label: "沉稳冷静" },
  { value: "困倦略带沙哑", label: "慵懒沙哑" },
] as const;

const TTS_VOICES = [
  { value: "mimo_default", label: "MiMo 默认" },
  { value: "default_zh", label: "中文女声" },
  { value: "default_en", label: "英文女声" },
] as const;

const TTS_STYLE_PRESETS = [
  { category: "语速控制", items: ["变快", "变慢"] },
  { category: "情绪变化", items: ["开心", "悲伤", "生气"] },
  { category: "角色扮演", items: ["孙悟空", "林黛玉"] },
  { category: "风格变化", items: ["悄悄话", "夹子音", "台湾腔", "唱歌"] },
  { category: "方言", items: ["东北话", "四川话", "河南话", "粤语"] },
] as const;

const TTS_VOICE_STORAGE = "ai-todo-tts-voice";

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

// TTS page icon
const MicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const TodoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const WandIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
    <path d="M15 4V2" />
    <path d="M15 16v-2" />
    <path d="M8 9h2" />
    <path d="M20 9h2" />
    <path d="M17.8 11.8L19 13" />
    <path d="M15 9h0" />
    <path d="M17.8 6.2L19 5" />
    <path d="M11 6.2L9.7 5" />
    <path d="M11 11.8L9.7 13" />
    <path d="M8 21l8.5-8.5" />
    <path d="M2.5 15.5l2-2" />
  </svg>
);

export default function App() {
  const [page, setPage] = useState<Page>("todo");
  const [todos, setTodos] = useState<Todo[]>(() => loadTodos());
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [tagFilter, setTagFilter] = useState<Tag | "all">("all");
  const [inputPriority, setInputPriority] = useState<Priority>("medium");
  const [inputTag, setInputTag] = useState<Tag>("其他");
  const [inputDueDate, setInputDueDate] = useState("");
  const [aiSmartLoading, setAiSmartLoading] = useState(false);
  const [aiSmartError, setAiSmartError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState("");
  const [doubaoModel, setDoubaoModel] = useState(() => {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(DOUBAO_MODEL_STORAGE) || "doubao-seed-2-0-lite-260215";
    }
    return "doubao-seed-2-0-lite-260215";
  });
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

  // TTS page states
  const [ttsPageText, setTtsPageText] = useState("");
  const [ttsPageVoice, setTtsPageVoice] = useState(() => {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(TTS_VOICE_STORAGE) || "mimo_default";
    }
    return "mimo_default";
  });
  const [ttsPageStyles, setTtsPageStyles] = useState<string[]>([]);
  const [ttsPageCustomStyle, setTtsPageCustomStyle] = useState("");
  const [ttsPageLoading, setTtsPageLoading] = useState(false);
  const [ttsPageError, setTtsPageError] = useState("");
  const [ttsPagePlaying, setTtsPagePlaying] = useState(false);
  const ttsPageAudioRef = useRef<HTMLAudioElement | null>(null);
  const [ttsPageAudioUrl, setTtsPageAudioUrl] = useState<string | null>(null);
  const [ttsEnhanceLoading, setTtsEnhanceLoading] = useState(false);

  // Auth state
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => getUser());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");

  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_STORAGE, theme);
  }, [theme]);

  // Check token validity on mount & load cloud settings
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    authFetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) {
          setAuthUser(data.user);
          // Load cloud settings
          authFetch("/api/settings")
            .then((r) => (r.ok ? r.json() : null))
            .then((sd) => {
              if (sd?.settings) {
                const s = sd.settings;
                if (s.apiKey) setApiKey(s.apiKey);
                if (s.mimoKey) setMimoKey(s.mimoKey);
                if (s.doubaoModel) setDoubaoModel(s.doubaoModel);
                if (s.ttsStyle !== undefined) setTtsStyle(s.ttsStyle);
              }
            })
            .catch(() => {});
          // Load cloud todos
          authFetch("/api/todos")
            .then((r) => (r.ok ? r.json() : null))
            .then((td) => {
              if (td?.todos && td.todos.length > 0) {
                setTodos(td.todos.map(migrateTodo));
              }
            })
            .catch(() => {});
        } else {
          clearAuth();
          setAuthUser(null);
        }
      })
      .catch(() => {
        clearAuth();
        setAuthUser(null);
      });
  }, []);

  // Save todos to localStorage always; debounce cloud sync when logged in
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));

    if (authUser) {
      const timer = setTimeout(() => {
        authFetch("/api/todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ todos }),
        }).catch(() => {});
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [todos, authUser]);

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
    if (authUser) {
      authFetch(`/api/todos/${id}`, { method: "DELETE" }).catch(() => {});
    }
  };

  const handleClearCompleted = () => {
    if (authUser) {
      const completedIds = todos.filter((t) => t.done).map((t) => t.id);
      completedIds.forEach((id) => {
        authFetch(`/api/todos/${id}`, { method: "DELETE" }).catch(() => {});
      });
    }
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

  const handleAiSmartAdd = async () => {
    const rawText = input.trim();
    if (!rawText || aiSmartLoading) return;

    setAiSmartLoading(true);
    setAiSmartError("");

    try {
      const trimmedKey = apiKey.trim();
      const payload: Record<string, unknown> = { prompt: rawText, model: doubaoModel };
      if (trimmedKey) {
        payload.apiKey = trimmedKey;
      }

      const response = await fetch("/api/ai-todo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (typeof data?.error === "string") {
          throw new Error(data.error);
        }
        const hint = response.status === 404
          ? " 未检测到后端 /api/ai-todo，请使用 wrangler pages dev 或部署到 Cloudflare Pages。"
          : "";
        throw new Error(`请求失败（${response.status}）${hint}`);
      }

      const title = typeof data?.title === "string" ? data.title.trim() : rawText;
      const priority = (["high", "medium", "low"].includes(data?.priority) ? data.priority : "medium") as Priority;
      const tag = (TAG_OPTIONS as readonly string[]).includes(data?.tag) ? (data.tag as Tag) : "其他" as Tag;

      const nextTodo: Todo = {
        id: createId(),
        text: title,
        done: false,
        createdAt: Date.now(),
        priority,
        tag,
        dueDate: inputDueDate || null,
      };
      setTodos((prev) => [nextTodo, ...prev]);
      setInput("");
      setInputDueDate("");
      setShowAddOptions(false);
    } catch (error) {
      setAiSmartError(error instanceof Error ? error.message : "AI 整理失败，请稍后重试。");
    } finally {
      setAiSmartLoading(false);
    }
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
    setApiKeyStatus(authUser ? "API Key 已保存并同步到云端。" : "API Key 已保存在本机浏览器中。");
    syncSettingsToCloud({ apiKey: trimmed });
  };

  const handleDoubaoModelChange = (model: string) => {
    setDoubaoModel(model);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(DOUBAO_MODEL_STORAGE, model);
    }
    syncSettingsToCloud({ doubaoModel: model });
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
    setMimoKeyStatus(authUser ? "MiMo API Key 已保存并同步到云端。" : "MiMo API Key 已保存。");
    syncSettingsToCloud({ mimoKey: trimmed });
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

      const contentType = response.headers.get("content-type") || "";
      let data: Record<string, unknown> | null = null;

      if (contentType.includes("application/json")) {
        data = await response.json().catch(() => null);
      }

      if (!response.ok) {
        // If backend returned non-JSON (e.g. HTML 404/502 from dev server)
        if (!data) {
          if (response.status === 404) {
            throw new Error("TTS 接口不存在。请使用 wrangler pages dev 启动开发服务器，或部署到 Cloudflare Pages。");
          }
          throw new Error(`语音合成失败（${response.status}）。请确认后端 /api/tts 已正确部署。`);
        }
        const msg = typeof data.error === "string" ? data.error : `语音合成失败（${response.status}）`;
        const hint = typeof data.hint === "string" ? ` ${data.hint}` : "";
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

  // Auth handlers
  const handleAuthSuccess = async (user: AuthUser) => {
    setAuthUser(user);
    setShowAuthModal(false);
    setSyncStatus("正在同步...");
    try {
      // Sync local todos to cloud
      const localTodos = loadTodos();
      if (localTodos.length > 0) {
        const res = await authFetch("/api/todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ todos: localTodos }),
        });
        const data = await res.json().catch(() => null);
        if (data?.todos) setTodos(data.todos.map(migrateTodo));
      } else {
        const res = await authFetch("/api/todos");
        const data = await res.json().catch(() => null);
        if (data?.todos) setTodos(data.todos.map(migrateTodo));
      }
      // Sync local settings to cloud
      const settings: Record<string, string> = {};
      const savedKey = localStorage.getItem(API_KEY_STORAGE);
      if (savedKey) settings.apiKey = savedKey;
      const savedMimoKey = localStorage.getItem(MIMO_KEY_STORAGE);
      if (savedMimoKey) settings.mimoKey = savedMimoKey;
      const savedModel = localStorage.getItem(DOUBAO_MODEL_STORAGE);
      if (savedModel) settings.doubaoModel = savedModel;
      const savedStyle = localStorage.getItem(TTS_STYLE_STORAGE);
      if (savedStyle !== null) settings.ttsStyle = savedStyle;
      if (Object.keys(settings).length > 0) {
        await authFetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings }),
        }).catch(() => {});
      }
      setSyncStatus("同步完成");
    } catch {
      setSyncStatus("同步失败，数据已保存在本地");
    }
    setTimeout(() => setSyncStatus(""), 3000);
  };

  const handleLogout = () => {
    clearAuth();
    setAuthUser(null);
    // Keep localStorage data as offline fallback
  };

  // Sync settings to cloud when saving API keys
  const syncSettingsToCloud = (settings: Record<string, string>) => {
    if (!authUser) return;
    authFetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    }).catch(() => {});
  };

  const handleClearApiKey = () => {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(API_KEY_STORAGE);
    }
    setApiKey("");
    setApiKeyStatus("已清除 API Key。");
  };

  // TTS page handlers
  const handleTtsPageVoiceChange = (v: string) => {
    setTtsPageVoice(v);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(TTS_VOICE_STORAGE, v);
    }
  };

  const handleTtsPageStyleToggle = (s: string, category: string) => {
    // Find all items in the same category
    const group = TTS_STYLE_PRESETS.find((g) => g.category === category);
    const siblings = group ? (group.items as readonly string[]) : [];

    setTtsPageStyles((prev) => {
      if (prev.includes(s)) {
        // Deselect
        return prev.filter((x) => x !== s);
      }
      // Remove any other selection from same category, then add this one
      return [...prev.filter((x) => !siblings.includes(x)), s];
    });
  };

  const handleTtsPageStop = () => {
    if (ttsPageAudioRef.current) {
      ttsPageAudioRef.current.pause();
      ttsPageAudioRef.current = null;
    }
    setTtsPagePlaying(false);
  };

  const handleTtsPageSpeak = async () => {
    const text = ttsPageText.trim();
    if (!text || ttsPageLoading) return;

    handleTtsPageStop();
    setTtsPageLoading(true);
    setTtsPageError("");
    setTtsPageAudioUrl(null);

    try {
      // Build the text with style tags and audio tags
      let finalText = text;

      // If style presets or custom style are selected, prepend <style> tag
      const allStyles = [...ttsPageStyles];
      if (ttsPageCustomStyle.trim()) {
        allStyles.push(ttsPageCustomStyle.trim());
      }
      if (allStyles.length > 0) {
        finalText = `<style>${allStyles.join(" ")}</style>${finalText}`;
      }

      const payload: Record<string, unknown> = {
        text: finalText,
        voice: ttsPageVoice,
      };
      const trimmedKey = mimoKey.trim();
      if (trimmedKey) {
        payload.apiKey = trimmedKey;
      }

      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get("content-type") || "";
      let data: Record<string, unknown> | null = null;
      if (contentType.includes("application/json")) {
        data = await response.json().catch(() => null);
      }

      if (!response.ok) {
        if (!data) {
          throw new Error(`语音合成失败（${response.status}）。请确认后端 /api/tts 已正确部署。`);
        }
        const msg = typeof data.error === "string" ? data.error : `语音合成失败（${response.status}）`;
        const hint = typeof data.hint === "string" ? ` ${data.hint}` : "";
        throw new Error(msg + hint);
      }

      if (!data?.audio) {
        throw new Error("未收到音频数据。");
      }

      const audioSrc = `data:audio/wav;base64,${data.audio}`;
      setTtsPageAudioUrl(audioSrc);

      const audio = new Audio(audioSrc);
      ttsPageAudioRef.current = audio;
      setTtsPagePlaying(true);

      audio.onended = () => {
        setTtsPagePlaying(false);
        ttsPageAudioRef.current = null;
      };
      audio.onerror = () => {
        setTtsPagePlaying(false);
        ttsPageAudioRef.current = null;
        setTtsPageError("音频播放失败。");
      };

      await audio.play();
    } catch (error) {
      setTtsPageError(error instanceof Error ? error.message : "语音合成失败。");
    } finally {
      setTtsPageLoading(false);
    }
  };

  const handleTtsPageDownload = () => {
    if (!ttsPageAudioUrl) return;
    const a = document.createElement("a");
    a.href = ttsPageAudioUrl;
    a.download = `tts-${Date.now()}.wav`;
    a.click();
  };

  const handleTtsEnhance = async () => {
    const text = ttsPageText.trim();
    if (!text || ttsEnhanceLoading) return;

    setTtsEnhanceLoading(true);
    setTtsPageError("");

    try {
      const payload: Record<string, unknown> = { text, model: doubaoModel };
      const trimmedKey = apiKey.trim();
      if (trimmedKey) {
        payload.apiKey = trimmedKey;
      }

      const response = await fetch("/api/tts-enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get("content-type") || "";
      let data: Record<string, unknown> | null = null;
      if (contentType.includes("application/json")) {
        data = await response.json().catch(() => null);
      }

      if (!response.ok) {
        if (!data) {
          throw new Error(`AI 标注失败（${response.status}）。请确认后端已正确部署。`);
        }
        const msg = typeof data.error === "string" ? data.error : `AI 标注失败（${response.status}）`;
        throw new Error(msg);
      }

      if (typeof data?.enhanced === "string") {
        setTtsPageText(data.enhanced as string);
      } else {
        throw new Error("AI 未返回有效的标注文本。");
      }
    } catch (error) {
      setTtsPageError(error instanceof Error ? error.message : "AI 标注失败。");
    } finally {
      setTtsEnhanceLoading(false);
    }
  };

  const emptyMessage =
    totalCount === 0
      ? "还没有任务。先在上方添加第一件事项。"
      : filter === "active"
        ? "进行中的任务已全部完成。"
        : filter === "done"
          ? "还没有已完成的任务。"
          : "没有匹配的任务。";

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
          <div className="nav-tabs">
            <button
              className={`nav-tab ${page === "todo" ? "active" : ""}`}
              onClick={() => setPage("todo")}
            >
              <TodoIcon />
              <span>待办</span>
            </button>
            <button
              className={`nav-tab ${page === "tts" ? "active" : ""}`}
              onClick={() => setPage("tts")}
            >
              <MicIcon />
              <span>语音</span>
            </button>
          </div>
          <div className="nav-right">
            {authUser ? (
              <div className="user-info">
                <span className="user-email" title={authUser.email}>
                  {authUser.email.split("@")[0]}
                </span>
                <button className="theme-toggle" onClick={handleLogout} aria-label="退出登录" title="退出登录">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </div>
            ) : (
              <button className="theme-toggle" onClick={() => setShowAuthModal(true)} aria-label="登录">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </button>
            )}
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

      {/* 登录/注册弹窗 */}
      {showAuthModal ? (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
        />
      ) : null}

      {/* 同步状态提示 */}
      {syncStatus ? <div className="sync-toast">{syncStatus}</div> : null}

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
                    <p>在首页输入自然语言，点击「AI 整理」自动生成规范任务。</p>
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
                    {authUser ? "密钥已同步到云端账号，跨设备可用。" : "密钥仅保存在本机浏览器中，登录后可同步到云端。"}未填写时将使用服务器环境变量。
                  </p>
                  {apiKeyStatus ? <span className="ai-key-status">{apiKeyStatus}</span> : null}
                </div>

                <div className="ai-model-section">
                  <label>豆包模型</label>
                  <div className="ai-model-selector">
                    {DOUBAO_MODELS.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        className={`ai-model-btn ${doubaoModel === m.value ? "selected" : ""}`}
                        onClick={() => handleDoubaoModelChange(m.value)}
                        title={m.desc}
                      >
                        <span className="ai-model-label">{m.label}</span>
                        <span className="ai-model-desc">{m.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

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

      {page === "tts" ? (
        <div className="page">
          <section className="workspace tts-workspace">
            <div className="tts-page-header">
              <h2>文字转语音</h2>
              <p>输入文字，选择音色和风格，生成语音。支持风格标签和细粒度音频控制。</p>
            </div>

            {/* MiMo API Key (if not saved) */}
            {!hasMimoKey ? (
              <div className="tts-key-hint">
                请先在 <button type="button" className="link-btn" onClick={() => setSettingsOpen(true)}>设置</button> 中配置 MiMo API Key。
              </div>
            ) : null}

            {/* Voice Selection */}
            <div className="tts-section">
              <label className="tts-section-label">音色选择</label>
              <div className="tts-voice-selector">
                {TTS_VOICES.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    className={`tag-btn ${ttsPageVoice === v.value ? "selected" : ""}`}
                    onClick={() => handleTtsPageVoiceChange(v.value)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Style Presets */}
            <div className="tts-section">
              <label className="tts-section-label">风格预设 <span className="tts-hint">每类选一个，组合使用</span></label>
              {TTS_STYLE_PRESETS.map((group) => (
                <div key={group.category} className="tts-style-group">
                  <span className="tts-style-category">{group.category}</span>
                  <div className="tts-style-items">
                    {group.items.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`tag-btn ${ttsPageStyles.includes(s) ? "selected" : ""}`}
                        onClick={() => handleTtsPageStyleToggle(s, group.category)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Custom Style */}
            <div className="tts-section">
              <label className="tts-section-label">自定义风格 <span className="tts-hint">输入任意风格描述</span></label>
              <input
                type="text"
                className="tts-custom-style"
                placeholder="例如：温柔的妈妈讲故事"
                value={ttsPageCustomStyle}
                onChange={(e) => setTtsPageCustomStyle(e.target.value)}
                maxLength={50}
              />
            </div>

            {/* Text Input */}
            <div className="tts-section">
              <div className="tts-section-label-row">
                <label className="tts-section-label">合成文本 <span className="tts-hint">支持音频标签细粒度控制</span></label>
                <button
                  type="button"
                  className="tts-enhance-btn"
                  onClick={handleTtsEnhance}
                  disabled={!ttsPageText.trim() || ttsEnhanceLoading}
                  title="AI 自动添加音频标签（情绪、语气、动作等）"
                >
                  {ttsEnhanceLoading ? (
                    <><span className="tts-loading" /> AI 标注中...</>
                  ) : (
                    <><WandIcon /> AI 智能标注</>
                  )}
                </button>
              </div>
              <textarea
                className="tts-textarea"
                placeholder={"输入要合成的文字...\n\n音频标签示例：\n（紧张，深呼吸）呼……冷静，冷静。\n（极其疲惫，有气无力）师傅……到地方了叫我一声……"}
                value={ttsPageText}
                onChange={(e) => setTtsPageText(e.target.value)}
                rows={6}
                maxLength={2000}
              />
              <div className="tts-text-meta">
                <span>{ttsPageText.length} / 2000</span>
                {ttsPageStyles.length > 0 || ttsPageCustomStyle.trim() ? (
                  <span className="tts-active-styles">
                    风格：{[...ttsPageStyles, ...(ttsPageCustomStyle.trim() ? [ttsPageCustomStyle.trim()] : [])].join("、")}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="tts-actions">
              <button
                type="button"
                className="tts-speak-btn"
                onClick={handleTtsPageSpeak}
                disabled={!ttsPageText.trim() || ttsPageLoading}
              >
                {ttsPageLoading ? (
                  <><span className="tts-loading" /> 合成中...</>
                ) : (
                  <><SpeakerIcon /> 合成语音</>
                )}
              </button>
              {ttsPagePlaying ? (
                <button type="button" className="tts-stop-btn" onClick={handleTtsPageStop}>
                  <StopIcon /> 停止播放
                </button>
              ) : null}
              {ttsPageAudioUrl ? (
                <button type="button" className="tts-download-btn" onClick={handleTtsPageDownload}>
                  <DownloadIcon /> 下载音频
                </button>
              ) : null}
            </div>

            {/* Error */}
            {ttsPageError ? (
              <div className="tts-error" role="alert">
                {ttsPageError}
                <button type="button" onClick={() => setTtsPageError("")}>关闭</button>
              </div>
            ) : null}

            {/* Usage Tips */}
            <details className="tts-tips">
              <summary>使用技巧</summary>
              <div className="tts-tips-content">
                <h4>风格控制</h4>
                <p>选择上方的风格预设或输入自定义风格，会自动添加 &lt;style&gt; 标签。支持组合多种风格。</p>
                <h4>音频标签细粒度控制</h4>
                <p>直接在文本中使用括号标注语气、情绪等，例如：</p>
                <ul>
                  <li>（紧张，深呼吸）呼……冷静，冷静。</li>
                  <li>（极其疲惫，有气无力）师傅……到地方了叫我一声……</li>
                  <li>如果我当时……（沉默片刻）哪怕再坚持一秒钟……（苦笑）呵，没如果了。</li>
                  <li>（提高音量喊话）大姐！这鱼新鲜着呢！</li>
                </ul>
                <h4>唱歌模式</h4>
                <p>选择「唱歌」风格后直接输入歌词即可。</p>
              </div>
            </details>
          </section>
        </div>
      ) : (
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
              placeholder="随便写点什么，AI 帮你整理成任务"
              value={input}
              onChange={(event) => { setInput(event.target.value); setAiSmartError(""); }}
              onFocus={() => setShowAddOptions(true)}
              maxLength={200}
              aria-label="新任务"
            />
            <button
              type="button"
              className="ai-smart-btn"
              disabled={!input.trim() || aiSmartLoading}
              onClick={handleAiSmartAdd}
              title="AI 整理并创建任务"
            >
              {aiSmartLoading ? "整理中..." : "AI 整理"}
            </button>
            <button type="submit">添加</button>
          </form>
          {aiSmartError ? (
            <div className="ai-smart-error" role="alert">{aiSmartError}</div>
          ) : null}

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
            <span>{authUser ? "已同步到云端。" : "已自动保存在本机浏览器中。"}</span>
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
      )}
    </>
  );
}
