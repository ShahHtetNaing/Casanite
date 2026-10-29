"use client";

import { useEffect, useState } from "react";
import { BellRing, Guitar } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CalendarEventLite } from "@/lib/types";
import { getGuitarAlert } from "./guitar-alert";

export function GuitarBanner({ guitarClasses }: { guitarClasses: CalendarEventLite[] }) {
  const [now, setNow] = useState(() => new Date());
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const alert = getGuitarAlert(guitarClasses, now);
  const message = `Guitar class in ${alert.location}${alert.timeLabel ? ` at ${alert.timeLabel}` : ""} — leave before 10:00!`;

  useEffect(() => {
    if (!alert.active || permission !== "granted") return;
    const key = `casanite:guitar-alert:${alert.todayIso}`;
    if (localStorage.getItem(key)) return;
    new Notification("Casanite // Saturday Guitar", { body: message });
    localStorage.setItem(key, "1");
  }, [alert.active, alert.todayIso, permission, message]);

  if (!alert.active) return null;

  return (
    <div className="neon-panel flex flex-wrap items-center gap-3 border-violet-400/60 p-4">
      <Guitar className="size-6 animate-pulse text-violet-600 dark:text-violet-300" />
      <div className="flex-1">
        <p className="text-sm font-bold text-violet-600 dark:text-violet-300">Saturday alert</p>
        <p className="text-sm">{message}</p>
      </div>
      {permission === "default" && (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => setPermission(await Notification.requestPermission())}
        >
          <BellRing /> Enable notifications
        </Button>
      )}
    </div>
  );
}
