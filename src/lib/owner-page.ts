import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/config";

export async function requireOwnerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isOwnerEmail(user.email)) redirect("/login?error=forbidden");
  const extras = await supabase.rpc("bootstrap_extras");
  if (extras.error) console.error("[bootstrap_extras]", extras.error.message);
  return { supabase, user };
}
