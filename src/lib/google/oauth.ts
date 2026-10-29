import "server-only";
import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";

export class GoogleNotConnectedError extends Error {
  constructor(message = "Google account not connected. Sign out and sign in again to grant access.") {
    super(message);
  }
}

export async function getGoogleAuth(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("google_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.refresh_token) throw new GoogleNotConnectedError();

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: data.refresh_token });
  return auth;
}

export function isInvalidGrant(err: unknown) {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error === "invalid_grant" || /invalid_grant/.test(e?.message ?? "");
}
