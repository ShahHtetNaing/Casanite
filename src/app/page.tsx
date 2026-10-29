import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/config";
import { loadDashboardData } from "@/lib/dashboard-data";
import { Dashboard } from "@/components/dashboard/dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isOwnerEmail(user.email)) redirect("/login?error=forbidden");

  const data = await loadDashboardData(supabase);

  return <Dashboard initialData={data} userEmail={user.email ?? ""} />;
}
