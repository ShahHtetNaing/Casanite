"use client";

import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startGoogleSignIn } from "@/lib/auth-client";

export function GoogleStatus({ status, message }: { status: "not_connected" | "error"; message: string }) {
  return (
    <div className="space-y-2 rounded-md border border-amber-400/30 bg-amber-400/5 p-3 text-xs">
      <p className="text-amber-200">{message}</p>
      {status === "not_connected" && (
        <Button size="xs" variant="outline" onClick={() => void startGoogleSignIn()}>
          <Link2 /> Reconnect Google
        </Button>
      )}
    </div>
  );
}
