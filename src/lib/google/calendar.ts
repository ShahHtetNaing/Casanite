import "server-only";
import { google, type calendar_v3 } from "googleapis";
import type { Auth } from "googleapis";
import { DOCTOR_KEYWORDS, GUITAR_ALERT } from "@/lib/config";
import type { CalendarEventLite, CalendarSummary } from "@/lib/types";

function toLite(e: calendar_v3.Schema$Event): CalendarEventLite {
  return {
    id: e.id ?? crypto.randomUUID(),
    summary: e.summary ?? "(untitled)",
    location: e.location ?? null,
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? null,
    allDay: !e.start?.dateTime,
    htmlLink: e.htmlLink ?? null,
  };
}

function matches(e: CalendarEventLite, keywords: string[]) {
  const haystack = `${e.summary} ${e.location ?? ""}`.toLowerCase();
  return keywords.some((k) => haystack.includes(k));
}

export const isDoctorAppointment = (e: CalendarEventLite) => matches(e, DOCTOR_KEYWORDS);
export const isGuitarClass = (e: CalendarEventLite) => matches(e, GUITAR_ALERT.keywords);

export async function fetchCalendarSummary(auth: Auth.OAuth2Client, daysAhead = 60): Promise<CalendarSummary> {
  const calendar = google.calendar({ version: "v3", auth });
  const now = Date.now();
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: new Date(now - 2 * 3_600_000).toISOString(),
    timeMax: new Date(now + daysAhead * 86_400_000).toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  const events = (res.data.items ?? []).filter((e) => e.status !== "cancelled").map(toLite);
  return {
    appointments: events.filter(isDoctorAppointment).slice(0, 10),
    guitarClasses: events.filter(isGuitarClass).slice(0, 5),
  };
}
