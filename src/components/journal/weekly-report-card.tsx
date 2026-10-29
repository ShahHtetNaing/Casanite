import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import type { WeeklyReport } from "@/lib/types";
import { RankBadge, formatWeek } from "./report-view";

export function WeeklyReportCard({ report }: { report: WeeklyReport | null }) {
  if (!report) {
    return (
      <Link href="/journal" className="neon-panel flex items-center gap-3 p-4 transition-colors hover:bg-accent/50">
        <BookOpen className="size-5 text-blue-500" />
        <div className="flex-1">
          <p className="text-sm font-semibold">Weekly Quest Report</p>
          <p className="text-xs text-muted-foreground">No report yet. Open the Journal to generate this week&apos;s report.</p>
        </div>
        <ArrowRight className="size-4 text-muted-foreground" />
      </Link>
    );
  }
  const { report: r } = report;
  return (
    <Link href="/journal" className="neon-panel flex items-start gap-4 p-4 transition-colors hover:bg-accent/50">
      <RankBadge rank={r.rank} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Weekly Quest Report · {formatWeek(report.week_start, report.week_end)}
        </p>
        <p className="truncate font-semibold">{r.title}</p>
        <p className="line-clamp-2 text-sm text-muted-foreground">{r.streak_message || r.summary}</p>
        {r.focus_areas[0] && (
          <p className="mt-1 text-xs">
            <span className="font-medium text-violet-600 dark:text-violet-300">Next focus:</span> {r.focus_areas[0]}
          </p>
        )}
      </div>
      <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
