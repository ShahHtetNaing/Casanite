import "server-only";
import { NextResponse } from "next/server";
import type { Auth } from "googleapis";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/config";
import { getGoogleAuth, GoogleNotConnectedError, isInvalidGrant } from "./oauth";

export async function withGoogle<T>(fn: (auth: Auth.OAuth2Client) => Promise<T>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!isOwnerEmail(user.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const auth = await getGoogleAuth(supabase, user.id);
    return NextResponse.json(await fn(auth));
  } catch (err) {
    if (err instanceof GoogleNotConnectedError || isInvalidGrant(err)) {
      return NextResponse.json(
        { error: "not_connected", message: new GoogleNotConnectedError().message },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : "Google API request failed";
    console.error("[google]", message);
    return NextResponse.json({ error: "google_error", message }, { status: 502 });
  }
}
