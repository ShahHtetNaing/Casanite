import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { OWNER_EMAIL } from "@/lib/config";
import { generateWeeklyReport } from "@/lib/weekly-review";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron calls this on Sunday night with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 500 });
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw new Error(error.message);
    const owner = data.users.find((u) => u.email?.toLowerCase() === OWNER_EMAIL);
    if (!owner) throw new Error("Owner account not found");
    const report = await generateWeeklyReport(admin, owner.id, "current", "scheduled");
    return NextResponse.json({ ok: true, week_start: report.week_start });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Weekly review failed";
    console.error("[journal cron]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
