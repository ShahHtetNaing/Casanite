export function insulinUnits(value: string): number | null {
  if (!value.trim()) return null;
  const units = Number(value);
  if (!Number.isFinite(units) || units <= 0 || units > 100 || Math.abs(units * 10 - Math.round(units * 10)) > 1e-8) return null;
  return units;
}

export function medicationTakenAt(day: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const date = new Date(`${day}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return null;
  return new Date(`${day}T${time}:00+08:00`).toISOString();
}

export function medicineFields(name: string, dose: string, day: string, time: string) {
  const medicine_name = name.trim();
  const dose_taken = dose.trim();
  const taken_at = medicationTakenAt(day, time);
  if (!medicine_name || medicine_name.length > 120 || !dose_taken || dose_taken.length > 120 || !taken_at) return null;
  return { medicine_name, dose_taken, day, taken_at };
}
