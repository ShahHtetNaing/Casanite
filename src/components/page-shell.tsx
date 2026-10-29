import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function PageShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="cyber-grid min-h-screen">
      <div className="mx-auto grid max-w-7xl gap-4 p-4 md:p-6">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label="Back to dashboard">
            <ArrowLeft /> Dashboard
          </Link>
          <div className="flex-1">
            <h1 className="font-display neon-text text-2xl font-black tracking-[0.2em]">{title}</h1>
            {subtitle && <p className="font-mono text-[11px] text-muted-foreground">{subtitle}</p>}
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
