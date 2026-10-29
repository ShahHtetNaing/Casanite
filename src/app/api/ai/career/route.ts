import { ownerRoute } from "@/lib/owner-route";
import { chat, chatJson, type ChatMessage } from "@/lib/ai";
import type { CareerEntry, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

type ChatTurn = { role: "user" | "model"; text: string };

const ANALYSIS_SHAPE = `{
  "rarity_score": integer 0-100 (how rare this skill combination is for the person's age),
  "rarity_label": "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary",
  "summary": string,
  "strengths": string[],
  "improvements": string[],
  "next_certifications": [{ "name": string, "why": string }],
  "project_ideas": [{ "title": string, "why": string }]
}`;

function age(birth: string | null) {
  if (!birth) return null;
  const b = new Date(birth);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a;
}

function profileText(profile: Profile | null, entries: CareerEntry[]) {
  const lines = [
    `Name: ${profile?.full_name ?? "Unknown"}`,
    `Age: ${age(profile?.birth_date ?? null) ?? "unknown"}`,
    `Headline: ${profile?.headline ?? ""}`,
    `Location: ${profile?.location ?? ""}`,
    `Skills: ${(profile?.skills ?? []).join(", ")}`,
    `Goals: ${profile?.goals_text ?? ""}`,
  ];
  for (const e of entries) {
    const when = [e.start_date, e.end_date ?? (e.status === "in_progress" ? "present" : null)].filter(Boolean).join(" – ");
    lines.push(
      `[${e.category}] ${e.title}${e.organization ? ` @ ${e.organization}` : ""} (${e.status}${when ? `, ${when}` : ""})${e.description ? `: ${e.description}` : ""}`,
    );
  }
  return lines.join("\n");
}

const SYSTEM =
  "You are an expert IT and cybersecurity career consultant. Be specific, honest and actionable. " +
  "Base everything on the provided profile; do not invent credentials. Prefer certifications and projects that build on what the person already has.";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { mode?: "analyze" | "chat"; messages?: ChatTurn[] };
  return ownerRoute(async (supabase) => {
    const [{ data: profile }, { data: entries, error }] = await Promise.all([
      supabase.from("profile").select("*").maybeSingle(),
      supabase.from("career_entries").select("*").order("category").order("sort_order"),
    ]);
    if (error) throw new Error(error.message);
    const context = profileText(profile as Profile | null, (entries ?? []) as CareerEntry[]);

    if (body.mode === "chat") {
      const turns = (body.messages ?? []).slice(-20).filter((m) => m.text?.trim());
      if (!turns.length || turns[turns.length - 1].role !== "user") throw new Error("Send a question first.");
      const messages: ChatMessage[] = [
        { role: "system", content: SYSTEM + " Answer concisely in Markdown." },
        { role: "user", content: `My profile:\n${context}` },
        { role: "assistant", content: "Got it. What would you like advice on?" },
        ...turns.map((t) => ({ role: t.role === "model" ? ("assistant" as const) : ("user" as const), content: t.text.slice(0, 4000) })),
      ];
      return { reply: await chat(messages) };
    }

    const analysis = await chatJson(
      SYSTEM,
      `Evaluate this profile. Rate how rare the skill combination is for someone of this age (0-100), ` +
        `list strengths, ways to improve, the next 3-5 IT/cybersecurity certifications to pursue (in order), ` +
        `and 3-5 portfolio project ideas.\n\n${context}`,
      ANALYSIS_SHAPE,
    );
    return { analysis };
  });
}
