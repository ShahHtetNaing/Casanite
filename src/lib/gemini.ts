import "server-only";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiNotConfiguredError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set. Create a free key at https://aistudio.google.com/apikey and add it to your env.");
  }
}

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };
export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

export async function generate({
  system,
  contents,
  schema,
}: {
  system: string;
  contents: GeminiContent[];
  schema?: Record<string, unknown>;
}): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiNotConfiguredError();

  const res = await fetch(`${ENDPOINT}/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents,
      generationConfig: schema
        ? { responseMimeType: "application/json", responseSchema: schema, temperature: 0.4 }
        : { temperature: 0.7 },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `Gemini request failed (${res.status})`);
  const text = (body?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("");
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

export async function generateJson<T>(args: Parameters<typeof generate>[0]): Promise<T> {
  return JSON.parse(await generate(args)) as T;
}
