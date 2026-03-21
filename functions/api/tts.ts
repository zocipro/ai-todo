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
    if (typeof parsed?.error?.message === "string") return parsed.error.message;
    if (typeof parsed?.error === "string") return parsed.error;
    if (typeof parsed?.message === "string") return parsed.message;
  } catch {
    // not JSON
  }
  if (status === 401) return "API Key 无效或已过期，请检查 MiMo API Key。";
  if (status === 403) return "无权访问该模型，请确认 API Key 权限。";
  if (status === 404) return "API 端点不存在，请检查模型名称或 API 地址。";
  if (status === 429) return "请求过于频繁，请稍后重试。";
  if (status >= 500) return `MiMo 服务端错误（${status}），请稍后重试。`;
  return body.slice(0, 300) || `上游返回 ${status}`;
};

const authHeaders = (apiKey: string) => ({
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
});

/**
 * Strategy 1: OpenAI-compatible /audio/speech endpoint
 * Used by dedicated TTS models (like openai tts-1)
 */
async function tryAudioSpeech(
  baseUrl: string,
  apiKey: string,
  model: string,
  text: string,
  style: string,
): Promise<Response | null> {
  const url = `${baseUrl}/audio/speech`;
  const input = style ? `[${style}] ${text}` : text;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        model,
        input,
        voice: "mimo_default",
        response_format: "wav",
      }),
    });
  } catch {
    return null;
  }

  // If 404 or 405, this endpoint doesn't exist - try next strategy
  if (resp.status === 404 || resp.status === 405) {
    return null;
  }

  return resp;
}

/**
 * Strategy 2: chat/completions with audio modality
 * Used by multimodal models (like GPT-4o audio)
 */
async function tryChatCompletionsAudio(
  baseUrl: string,
  apiKey: string,
  model: string,
  text: string,
  style: string,
): Promise<Response | null> {
  const url = `${baseUrl}/chat/completions`;
  const systemPrompt = style
    ? `请用以下风格朗读：${style}`
    : "请自然地朗读以下文本。";

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        modalities: ["text", "audio"],
        audio: { voice: "mimo_default", format: "wav" },
      }),
    });
  } catch {
    return null;
  }

  return resp;
}

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

  // --- Strategy 1: /audio/speech (standard TTS endpoint) ---
  const speechResp = await tryAudioSpeech(baseUrl, apiKey, model, text, style);

  if (speechResp && speechResp.ok) {
    const contentType = speechResp.headers.get("content-type") || "";

    // If response is audio binary, convert to base64
    if (contentType.includes("audio/") || contentType.includes("octet-stream")) {
      const arrayBuf = await speechResp.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      return json({ audio: base64, format: "wav", transcript: text });
    }

    // If response is JSON, try to extract audio
    if (contentType.includes("json")) {
      const data = await speechResp.json().catch(() => null);
      const audioData = data?.audio || data?.data;
      if (audioData) {
        return json({ audio: audioData, format: "wav", transcript: text });
      }
    }
  }

  // If /audio/speech returned an auth/rate error, report it directly
  if (speechResp && !speechResp.ok && speechResp.status !== 404 && speechResp.status !== 405) {
    const rawBody = await speechResp.text().catch(() => "");
    const detail = parseUpstreamError(speechResp.status, rawBody);
    return json({
      error: `MiMo TTS 请求失败（${speechResp.status}）：${detail}`,
      hint: `请求地址：${baseUrl}/audio/speech`,
    }, 502);
  }

  // --- Strategy 2: chat/completions with audio modality ---
  const chatResp = await tryChatCompletionsAudio(baseUrl, apiKey, model, text, style);

  if (!chatResp) {
    return json({
      error: "无法连接 MiMo API，请检查网络或 API 地址。",
      hint: `尝试的地址：${baseUrl}/audio/speech 和 ${baseUrl}/chat/completions`,
    }, 502);
  }

  if (!chatResp.ok) {
    const rawBody = await chatResp.text().catch(() => "");
    const detail = parseUpstreamError(chatResp.status, rawBody);
    return json({
      error: `MiMo TTS 请求失败（${chatResp.status}）：${detail}`,
      hint: `请求地址：${baseUrl}/chat/completions`,
    }, 502);
  }

  const data = await chatResp.json().catch(() => null);

  // Extract audio: choices[0].message.audio.data (OpenAI GPT-4o audio format)
  const audioData = data?.choices?.[0]?.message?.audio?.data;
  const audioTranscript = data?.choices?.[0]?.message?.audio?.transcript;

  if (audioData) {
    return json({ audio: audioData, format: "wav", transcript: audioTranscript || text });
  }

  // Some APIs return audio differently
  const altAudio = data?.audio || data?.data;
  if (altAudio) {
    return json({ audio: altAudio, format: "wav", transcript: text });
  }

  const choiceContent = data?.choices?.[0]?.message?.content;
  return json({
    error: "MiMo TTS 未返回音频数据，请确认模型名称和 API 格式是否正确。",
    hint: choiceContent
      ? `模型返回了文本而非音频："${String(choiceContent).slice(0, 120)}"`
      : `两种调用方式均未成功。请确认文档中的正确请求格式。`,
  }, 502);
};
