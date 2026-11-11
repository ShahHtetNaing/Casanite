import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/config";
import { LoginButton } from "./login-button";

const ERRORS: Record<string, string> = {
  forbidden: "This Google account is not authorized to use Casanite.",
  auth_failed: "Authentication failed. Try again.",
  missing_code: "OAuth response was incomplete. Try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && isOwnerEmail(user.email)) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="neon-panel w-full max-w-sm p-8">
        <p className="app-eyebrow">Private workspace</p>
        <h1 className="app-title mt-5">Casanite</h1>
        <p className="app-subtitle mt-3">Health, fitness and productivity in one place.</p>
        {error && (
          <p role="alert" className="mt-5 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-300">
            {ERRORS[error] ?? "Something went wrong."}
          </p>
        )}
        <div className="mt-6">
          <LoginButton />
        </div>
        <p className="mt-6 text-xs text-muted-foreground">Google sign-in only · single-owner access</p>
      </div>
    </main>
  );
}
