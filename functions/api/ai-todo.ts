type Env = {
  DOUBAO_API_KEY?: string;
  DOUBAO_API_BASE_URL?: string;
  DOUBAO_MODEL?: string;
  ARK_API_KEY?: string;
};

const DEFAULT_MODEL = "doubao-seed-2-0-lite-260215";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });

const VALID_PRIORITIES = ["high", "medium", "low"];
const VALID_TAGS = ["工作", "生活", "学习", "健康", "其他"];

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const providedKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  const providedModel = typeof body?.model === "string" ? body.model.trim() : "";

  if (!prompt) {
    return json({ error: "请提供有效的任务描述。" }, 400);
  }

  const apiKey = providedKey || env.DOUBAO_API_KEY || env.ARK_API_KEY;
  if (!apiKey) {
    return json({ error: "请在页面填写 API Key 或配置 DOUBAO_API_KEY。" }, 400);
  }

  const model = providedModel || env.DOUBAO_MODEL || DEFAULT_MODEL;
  const baseUrl = (env.DOUBAO_API_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3")
    .replace(/\/+$/, "");

  const payload = {
    model,
    max_tokens: 256,
    reasoning_effort: "low",
    messages: [
      {
        role: "system",
        content: `你是一个智能待办助手。用户会输入一段随意的、可能不通顺的自然语言，你需要：
1. 理解用户意图，整理成一个简洁通顺的任务标题（不超过30字）
2. 判断优先级：high（紧急/重要/deadline很近）、medium（普通）、low（不急/随便）
3. 判断标签：工作、生活、学习、健康、其他

只输出 JSON，格式：{"title":"任务标题","priority":"medium","tag":"其他"}
不要输出任何其它文字。`,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
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
    let errorMsg = `豆包接口请求失败（${response.status}）`;
    try {
      const err = JSON.parse(detail);
      if (err?.error?.message) errorMsg += `：${err.error.message}`;
    } catch {}
    return json({ error: errorMsg, detail }, 502);
  }

  const data = await response.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    return json({ error: "豆包返回内容为空。", detail: data }, 502);
  }

  // Parse structured response
  let parsed: { title?: string; priority?: string; tag?: string } = {};
  try {
    const trimmed = content.trim();
    // Try direct parse first, then extract JSON from text
    const jsonStr = trimmed.startsWith("{") ? trimmed : trimmed.match(/\{[\s\S]*\}/)?.[0];
    if (jsonStr) {
      parsed = JSON.parse(jsonStr);
    }
  } catch {
    // Fallback: use input as title
  }

  const title = typeof parsed.title === "string" && parsed.title.trim()
    ? parsed.title.trim()
    : prompt;
  const priority = VALID_PRIORITIES.includes(parsed.priority || "") ? parsed.priority! : "medium";
  const tag = VALID_TAGS.includes(parsed.tag || "") ? parsed.tag! : "其他";

  return json({ title, priority, tag });
};
