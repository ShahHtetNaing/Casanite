export const OWNER_EMAIL = "shahhtetnaing@gmail.com";
export const APP_TIMEZONE = "Asia/Singapore";

export const EXP_PER_TASK = 10;
export const EXP_PER_LEVEL = 100;

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/fitness.activity.read",
  "https://www.googleapis.com/auth/fitness.sleep.read",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export const GUITAR_ALERT = {
  weekday: 6,
  cutoffHour: 10,
  keywords: ["guitar"],
  defaultLocation: "Tampines",
};

export const DOCTOR_KEYWORDS = [
  "doctor",
  "dr.",
  "dr ",
  "clinic",
  "polyclinic",
  "hospital",
  "dental",
  "dentist",
  "appointment",
  "checkup",
  "check-up",
  "physio",
  "specialist",
];

export function isOwnerEmail(email: string | null | undefined) {
  return !!email && email.toLowerCase() === OWNER_EMAIL;
}
