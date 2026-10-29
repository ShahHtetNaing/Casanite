import { fetchFitSummary } from "@/lib/google/fit";
import { withGoogle } from "@/lib/google/route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  return withGoogle((auth) => fetchFitSummary(auth));
}
