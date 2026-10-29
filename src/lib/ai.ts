import "server-only";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("GROQ_API_KEY is not set. Create a free key at https://console.groq.com/keys and add it to your env.");
  }
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function chat(messages: ChatMessage[], { json = false } = {}): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new AiNotConfiguredError();

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: json ? 0.4 : 0.7,
      max_completion_tokens: 4096,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `Groq request failed (${res.status})`);
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
