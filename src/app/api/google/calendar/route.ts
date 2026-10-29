import { fetchCalendarSummary } from "@/lib/google/calendar";
import { withGoogle } from "@/lib/google/route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  return withGoogle((auth) => fetchCalendarSummary(auth));
}
