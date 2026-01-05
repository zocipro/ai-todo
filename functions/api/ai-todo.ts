type Env = {
  DOUBAO_API_KEY?: string;
  DOUBAO_API_BASE_URL?: string;
  DOUBAO_MODEL?: string;
  ARK_API_KEY?: string;
};

const DEFAULT_MODEL = "doubao-seed-1-8-251228";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });

const normalizeTask = (value: string) =>
  value.replace(/^[\s\-•\d\.\)\(]+/, "").replace(/\s+/g, " ").trim();

const pickTasks = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.tasks)) {
      return record.tasks.filter((item): item is string => typeof item === "string");
    }
  }
  return [];
};

const extractTasks = (content: string) => {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    const tasks = pickTasks(parsed);
    if (tasks.length > 0) {
      return tasks;
    }
  } catch {
  }

  const match = trimmed.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      const tasks = pickTasks(parsed);
      if (tasks.length > 0) {
        return tasks;
      }
    } catch {
    }
  }

  return trimmed
    .split("\n")
    .map((line) => normalizeTask(line))
    .filter(Boolean);
};

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
    temperature: 0.4,
    max_tokens: 512,
    messages: [
      {
        role: "system",
        content:
          "你是一名任务拆解助手，请根据用户描述输出 4-8 条中文待办项。只输出 JSON 数组，例如：[\"任务1\",\"任务2\"]，不要输出其它文字。",
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
    return json({ error: "豆包接口请求失败。", detail }, 502);
  }

  const data = await response.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    return json({ error: "豆包返回内容为空。", detail: data }, 502);
  }

  const tasks = extractTasks(content)
    .map(normalizeTask)
    .filter(Boolean)
    .slice(0, 12);

  return json({ tasks });
};
