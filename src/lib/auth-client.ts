import { createClient } from "@/lib/supabase/client";
import { GOOGLE_SCOPES } from "@/lib/config";

export async function startGoogleSignIn() {
  const supabase = createClient();
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      scopes: GOOGLE_SCOPES.join(" "),
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });
}
