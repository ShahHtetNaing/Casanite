import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/config";
import { LoginButton } from "./login-button";

const ERRORS: Record<string, string> = {
  forbidden: "ACCESS DENIED // this account is not authorized.",
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
    <main className="cyber-grid flex min-h-screen items-center justify-center p-6">
      <div className="neon-panel w-full max-w-md p-8 text-center">
        <p className="font-mono text-xs tracking-[0.4em] text-cyan-400/70">SYSTEM LOGIN</p>
        <h1 className="font-display neon-text mt-3 text-5xl font-black tracking-widest">
          CASANITE
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Health • Fitness • Productivity — level up every day.
        </p>
        {error && (
          <p className="mt-6 rounded border border-rose-500/50 bg-rose-500/10 p-3 font-mono text-xs text-rose-300">
            {ERRORS[error] ?? "Something went wrong."}
          </p>
        )}
        <div className="mt-8">
          <LoginButton />
        </div>
        <p className="mt-6 font-mono text-[10px] text-muted-foreground">
          Google OAuth only · single-operator access
        </p>
      </div>
    </main>
  );
}
