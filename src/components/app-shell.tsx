"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { LayoutDashboard, LogOut, Moon, ScanLine, Sun, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/character", label: "Character", icon: UserRound },
  { href: "/body-scan", label: "Body Scan", icon: ScanLine },
];

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <Image
        src="/avatar.jpg"
        alt="Shah Htet Naing"
        width={36}
        height={36}
        className="size-9 rounded-full object-cover ring-2 ring-primary/30"
        priority
      />
      <span className="leading-tight">
        <span className="block text-sm font-semibold">Shah Htet Naing</span>
        <span className="block text-[11px] text-muted-foreground">Casanite</span>
      </span>
    </Link>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = !mounted || resolvedTheme !== "light";
  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? <Sun /> : <Moon />}
      <span className="md:inline hidden">{dark ? "Light mode" : "Dark mode"}</span>
    </Button>
  );
}

function SignOut({ className }: { className?: string }) {
  return (
    <form action="/auth/signout" method="post">
      <Button type="submit" variant="ghost" size="sm" className={className} aria-label="Sign out">
        <LogOut />
        <span className="md:inline hidden">Sign out</span>
      </Button>
    </form>
  );
}

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="min-h-screen bg-background md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-6 border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground md:flex">
        <Brand />
        <nav className="grid gap-1" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                active(href)
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto grid gap-1 [&_button]:w-full [&_button]:justify-start">
          <ThemeToggle />
          <SignOut />
        </div>
      </aside>

      <div className="min-w-0">
        <div className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/90 px-4 py-2 backdrop-blur md:hidden">
          <Brand />
          <div className="ml-auto flex items-center">
            <ThemeToggle />
            <SignOut />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-b px-4 py-2 md:hidden" aria-label="Main mobile">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm",
                active(href) ? "bg-accent font-medium" : "text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>

        <main className="mx-auto grid max-w-7xl gap-5 p-4 md:p-8">
          <header className="flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {actions}
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
