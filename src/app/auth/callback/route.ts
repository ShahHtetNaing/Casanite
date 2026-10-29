import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/config";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const { session } = data;
  if (!isOwnerEmail(session.user.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=forbidden`);
  }

  // Supabase only exposes Google's refresh token right after sign-in; persist
  // it so the Fit/Calendar API routes can mint access tokens later.
  if (session.provider_refresh_token) {
    await supabase.from("google_tokens").upsert({
      user_id: session.user.id,
      refresh_token: session.provider_refresh_token,
    });
  }

  return NextResponse.redirect(`${origin}/`);
}
