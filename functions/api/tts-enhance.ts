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
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const SYSTEM_PROMPT = `你是一个语音合成文本标注专家。你的任务是根据用户输入的文本内容，自动添加音频标签进行细粒度控制，让语音合成更加生动自然。

规则：
1. 根据文本的语义、情感、场景，在合适的位置插入音频标签
2. 音频标签使用中文圆括号，例如：（紧张，深呼吸）、（语速加快）、（低声）、（兴奋）
3. 可以使用的标签类型包括但不限于：
   - 情绪：开心、悲伤、生气、紧张、兴奋、害怕、惊讶、无奈、得意
   - 语气：低声、大声、轻声、怒吼、耳语、叹气、苦笑、冷笑
   - 语速：语速加快、语速放慢、急促
   - 动作：深呼吸、咳嗽、叹气、沉默片刻、长叹一口气、清嗓子
   - 状态：有气无力、精神饱满、醉醺醺、困倦、疲惫
4. 保持原文内容不变，只添加标签
5. 标签要自然合理，不要过度标注
6. 直接输出标注后的文本，不要添加任何解释或说明
7. 如果文本本身已经包含音频标签，保留原有标签并在需要的地方补充新标签`;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const providedKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  const providedModel = typeof body?.model === "string" ? body.model.trim() : "";

  if (!text) {
    return json({ error: "请提供要标注的文本。" }, 400);
  }

  const apiKey = providedKey || env.DOUBAO_API_KEY || env.ARK_API_KEY;
  if (!apiKey) {
    return json({ error: "请在设置中填写豆包 API Key 或配置 DOUBAO_API_KEY 环境变量。" }, 400);
  }

  const model = providedModel || env.DOUBAO_MODEL || DEFAULT_MODEL;
  const baseUrl = (env.DOUBAO_API_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3")
    .replace(/\/+$/, "");

  const payload = {
    model,
    temperature: 0.7,
    max_tokens: 2048,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
  };

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知网络错误";
    return json({ error: `无法连接豆包 API：${msg}` }, 502);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return json({ error: `豆包 API 请求失败（${response.status}）`, detail }, 502);
  }

  const data = await response.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    return json({ error: "AI 未返回有效内容。" }, 502);
  }

  return json({ enhanced: content.trim() });
};
