import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/config";
import { GeminiNotConfiguredError } from "@/lib/gemini";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function ownerRoute(fn: (supabase: Supabase, userId: string) => Promise<unknown>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!isOwnerEmail(user.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await fn(supabase, user.id));
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) {
      return NextResponse.json({ error: "gemini_not_configured", message: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Request failed";
    console.error("[api]", message);
    return NextResponse.json({ error: "server_error", message }, { status: 500 });
  }
}
