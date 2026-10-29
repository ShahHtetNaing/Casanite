import { APP_TIMEZONE, GUITAR_ALERT } from "@/lib/config";
import { zonedParts } from "@/lib/date";
import type { CalendarEventLite } from "@/lib/types";

export interface GuitarAlertInfo {
  active: boolean;
  todayIso: string;
  event: CalendarEventLite | null;
  timeLabel: string | null;
  location: string;
}

export function formatEventTime(iso: string, allDay: boolean) {
  if (allDay) return "All day";
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Active on Saturdays (app timezone) from midnight until the 10:00 cutoff. */
export function getGuitarAlert(guitarClasses: CalendarEventLite[], now = new Date()): GuitarAlertInfo {
  const p = zonedParts(now);
  const active = p.weekday === GUITAR_ALERT.weekday && p.hour < GUITAR_ALERT.cutoffHour;
  const event =
    guitarClasses.find((e) => !e.allDay && zonedParts(new Date(e.start)).isoDate === p.isoDate) ??
    guitarClasses.find((e) => e.allDay && e.start === p.isoDate) ??
    null;
  return {
    active,
    todayIso: p.isoDate,
    event,
    timeLabel: event ? formatEventTime(event.start, event.allDay) : null,
    location: event?.location ?? GUITAR_ALERT.defaultLocation,
  };
}
