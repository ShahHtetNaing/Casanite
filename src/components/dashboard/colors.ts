const STYLES = {
  cyan: { text: "text-blue-600 dark:text-blue-300", border: "border-blue-400/40", bg: "bg-blue-400/10", dot: "bg-blue-400" },
  fuchsia: { text: "text-violet-600 dark:text-violet-300", border: "border-violet-400/40", bg: "bg-violet-400/10", dot: "bg-violet-400" },
  violet: { text: "text-violet-600 dark:text-violet-300", border: "border-violet-400/40", bg: "bg-violet-400/10", dot: "bg-violet-400" },
  lime: { text: "text-emerald-600 dark:text-emerald-300", border: "border-emerald-400/40", bg: "bg-emerald-400/10", dot: "bg-emerald-400" },
  amber: { text: "text-amber-600 dark:text-amber-300", border: "border-amber-400/40", bg: "bg-amber-400/10", dot: "bg-amber-400" },
  sky: { text: "text-sky-600 dark:text-sky-300", border: "border-sky-400/40", bg: "bg-sky-400/10", dot: "bg-sky-400" },
  emerald: { text: "text-emerald-600 dark:text-emerald-300", border: "border-emerald-400/40", bg: "bg-emerald-400/10", dot: "bg-emerald-400" },
  rose: { text: "text-rose-600 dark:text-rose-300", border: "border-rose-400/40", bg: "bg-rose-400/10", dot: "bg-rose-400" },
} as const;

export function colorStyle(color: string) {
  return STYLES[color as keyof typeof STYLES] ?? STYLES.cyan;
}
