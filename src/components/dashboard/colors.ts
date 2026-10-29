const STYLES = {
  cyan: { text: "text-cyan-300", border: "border-cyan-400/40", bg: "bg-cyan-400/10", dot: "bg-cyan-400" },
  fuchsia: { text: "text-fuchsia-300", border: "border-fuchsia-400/40", bg: "bg-fuchsia-400/10", dot: "bg-fuchsia-400" },
  violet: { text: "text-violet-300", border: "border-violet-400/40", bg: "bg-violet-400/10", dot: "bg-violet-400" },
  lime: { text: "text-lime-300", border: "border-lime-400/40", bg: "bg-lime-400/10", dot: "bg-lime-400" },
  amber: { text: "text-amber-300", border: "border-amber-400/40", bg: "bg-amber-400/10", dot: "bg-amber-400" },
  sky: { text: "text-sky-300", border: "border-sky-400/40", bg: "bg-sky-400/10", dot: "bg-sky-400" },
  emerald: { text: "text-emerald-300", border: "border-emerald-400/40", bg: "bg-emerald-400/10", dot: "bg-emerald-400" },
  rose: { text: "text-rose-300", border: "border-rose-400/40", bg: "bg-rose-400/10", dot: "bg-rose-400" },
} as const;

export function colorStyle(color: string) {
  return STYLES[color as keyof typeof STYLES] ?? STYLES.cyan;
}
