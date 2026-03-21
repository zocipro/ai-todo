type Env = {
  MIMO_API_KEY?: string;
  MIMO_API_BASE_URL?: string;
  MIMO_TTS_MODEL?: string;
};

const DEFAULT_MODEL = "mimo-v2-tts";
const DEFAULT_BASE_URL = "https://api.xiaomimimo.com/v1";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const parseUpstreamError = (status: number, body: string): string => {
  try {
    const parsed = JSON.parse(body);
    // OpenAI-compatible error format
    if (typeof parsed?.error?.message === "string") {
      return parsed.error.message;
    }
    if (typeof parsed?.error === "string") {
      return parsed.error;
    }
    if (typeof parsed?.message === "string") {
      return parsed.message;
    }
  } catch {
    // not JSON
  }

  if (status === 401) return "API Key 无效或已过期，请检查 MiMo API Key。";
  if (status === 403) return "无权访问该模型，请确认 API Key 权限。";
  if (status === 404) return "API 端点不存在，请检查 MIMO_API_BASE_URL 配置。";
  if (status === 429) return "请求过于频繁，请稍后重试。";
  if (status >= 500) return `MiMo 服务端错误（${status}），请稍后重试。`;

  return body.slice(0, 200) || `上游返回 ${status}`;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const style = typeof body?.style === "string" ? body.style.trim() : "";
  const providedKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";

  if (!text) {
    return json({ error: "请提供要朗读的文本。" }, 400);
  }

  const apiKey = providedKey || env.MIMO_API_KEY;
  if (!apiKey) {
    return json({ error: "请在设置中填写 MiMo API Key 或配置 MIMO_API_KEY 环境变量。" }, 400);
  }

  const model = env.MIMO_TTS_MODEL || DEFAULT_MODEL;
  const baseUrl = (env.MIMO_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;

  // MiMo-V2-TTS uses chat/completions with audio modality (OpenAI-compatible)
  const systemPrompt = style
    ? `请用以下风格朗读：${style}`
    : "请自然地朗读以下文本。";

  const payload = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    modalities: ["text", "audio"],
    audio: {
      voice: "mimo_default",
      format: "wav",
    },
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知网络错误";
    return json({
      error: `无法连接 MiMo API：${msg}`,
      hint: `请检查 API 地址是否可达：${url}`,
    }, 502);
  }

  if (!response.ok) {
    const rawBody = await response.text().catch(() => "");
    const detail = parseUpstreamError(response.status, rawBody);
    return json({
      error: `MiMo TTS 请求失败（${response.status}）：${detail}`,
      upstream_status: response.status,
    }, 502);
  }

  const data = await response.json().catch(() => null);

  // Extract audio data from response
  // MiMo returns audio in choices[0].message.audio.data (base64)
  const audioData = data?.choices?.[0]?.message?.audio?.data;
  const audioTranscript = data?.choices?.[0]?.message?.audio?.transcript;

  if (!audioData) {
    // Try to provide useful debug info
    const keys = data ? Object.keys(data) : [];
    const choiceContent = data?.choices?.[0]?.message?.content;
    return json({
      error: "MiMo TTS 未返回音频数据，请确认模型是否支持 audio modality。",
      hint: choiceContent
        ? `模型返回了文本而非音频："${String(choiceContent).slice(0, 100)}"`
        : `响应结构：{ ${keys.join(", ")} }`,
    }, 502);
  }

  return json({
    audio: audioData,
    format: "wav",
    transcript: audioTranscript || text,
  });
};
