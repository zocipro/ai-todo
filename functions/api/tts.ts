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

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    return json({ error: `MiMo TTS 请求失败（${response.status}）`, detail }, 502);
  }

  const data = await response.json().catch(() => null);

  // Extract audio data from response
  // MiMo returns audio in choices[0].message.audio.data (base64)
  const audioData = data?.choices?.[0]?.message?.audio?.data;
  const audioTranscript = data?.choices?.[0]?.message?.audio?.transcript;

  if (!audioData) {
    return json({
      error: "MiMo TTS 未返回音频数据。",
      detail: data,
    }, 502);
  }

  return json({
    audio: audioData,
    format: "wav",
    transcript: audioTranscript || text,
  });
};
