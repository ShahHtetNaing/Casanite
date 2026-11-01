import "server-only";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
// Groq retires models regularly; fall through this list when one is gone.
const MODELS = [
  ...new Set([process.env.GROQ_MODEL, "openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"].filter(Boolean)),
] as string[];

function isModelUnavailable(status: number, body: { error?: { code?: string; message?: string } }) {
  const e = body?.error;
  return (
    status === 404 ||
    e?.code === "model_not_found" ||
    e?.code === "model_decommissioned" ||
    /does not exist|decommissioned|do not have access/i.test(e?.message ?? "")
  );
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("GROQ_API_KEY is not set. Create a free key at https://console.groq.com/keys and add it to your env.");
  }
}

// Vision-capable models (llama-4-scout/maverick are shut down).
const VISION_MODELS = [
  ...new Set([process.env.GROQ_VISION_MODEL, "qwen/qwen3.8-27b", "meta-models/muse-spark-open"].filter(Boolean)),
] as string[];

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };

export async function chat(messages: ChatMessage[], { json = false, models = MODELS } = {}): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new AiNotConfiguredError();

  let res: Response | undefined;
  let body: { error?: { code?: string; message?: string }; choices?: { message?: { content?: string } }[] } = {};
  for (const model of models) {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: json ? 0.4 : 0.7,
        max_completion_tokens: 8192,
        ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    body = await res.json().catch(() => ({}));
    if (res.ok || !isModelUnavailable(res.status, body)) break;
  }
  if (!res?.ok) throw new Error(body?.error?.message ?? `Groq request failed (${res?.status})`);
  const text: string = body?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("AI returned an empty response");
  return text;
}

export async function chatJson<T>(system: string, user: string, shape: string): Promise<T> {
  const text = await chat(
    [
      { role: "system", content: `${system}\nRespond with a single JSON object only, matching this shape:\n${shape}` },
      { role: "user", content: user },
    ],
    { json: true },
  );
  return JSON.parse(text) as T;
}

/** imageDataUrl: a `data:image/...;base64,` URL (Groq caps base64 images at 4 MB). */
export async function visionJson<T>(system: string, user: string, imageDataUrl: string, shape: string): Promise<T> {
  const text = await chat(
    [
      { role: "system", content: `${system}\nRespond with a single JSON object only, matching this shape:\n${shape}` },
      { role: "user", content: [{ type: "text", text: user }, { type: "image_url", image_url: { url: imageDataUrl } }] },
    ],
    { json: true, models: VISION_MODELS },
  );
  return JSON.parse(text) as T;
}
