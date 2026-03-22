import { FormEvent, useState } from "react";
import { setAuth, type AuthUser } from "./auth";

type Props = {
  onSuccess: (user: AuthUser) => void;
  onClose?: () => void;
  mandatory?: boolean;
};

export default function AuthModal({ onSuccess, onClose, mandatory }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const url = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || `请求失败（${res.status}）`);
        return;
      }

      if (data?.token && data?.user) {
        setAuth(data.token, data.user);
        onSuccess(data.user);
      }
    } catch {
      setError("网络错误，请检查连接后重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayClick = () => {
    if (!mandatory && onClose) onClose();
  };

  return (
    <div className="auth-overlay" onClick={handleOverlayClick}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        {!mandatory && onClose ? (
          <button className="auth-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        ) : null}

        {mandatory ? (
          <div className="auth-mandatory-hint">请先登录或注册以继续使用</div>
        ) : null}

        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            登录
          </button>
          <button
            className={`auth-tab ${mode === "register" ? "active" : ""}`}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            注册
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="auth-email">邮箱</label>
            <input
              id="auth-email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-password">密码</label>
            <input
              id="auth-password"
              type="password"
              placeholder={mode === "register" ? "至少 6 个字符" : "输入密码"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === "register" ? 6 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? "请稍候..."
              : mode === "login"
                ? "登录"
                : "注册"}
          </button>
        </form>

        <p className="auth-hint">
          {mode === "login" ? "还没有账号？" : "已有账号？"}
          <button
            className="auth-link"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "去注册" : "去登录"}
          </button>
        </p>
      </div>
    </div>
  );
}
