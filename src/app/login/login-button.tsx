"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startGoogleSignIn } from "@/lib/auth-client";

export function LoginButton() {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const { error } = await startGoogleSignIn();
    if (error) setLoading(false);
  }

  return (
    <Button onClick={signIn} disabled={loading} size="lg" className="neon-button w-full">
      <LogIn className="size-4" />
      {loading ? "Connecting…" : "Sign in with Google"}
    </Button>
  );
}
