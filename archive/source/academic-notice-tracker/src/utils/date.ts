/**
 * Date helpers. All formatting goes through date-fns; the device's local
 * time zone is used for display (deadlines are stored as UTC timestamps
 * and the backend parses source text as Asia/Colombo time).
 *
 * Every function that depends on "now" takes an optional `now` argument
 * so it stays deterministic and unit-testable.
 */
import {
  format,
  formatDistanceStrict,
  isValid,
  addDays as dateFnsAddDays,
  addHours as dateFnsAddHours,
} from 'date-fns';

/** "Fri 14 Nov, 5:00 PM" — the human date part of a deadline line. */
export function formatDeadlineDate(deadline: Date): string {
  return format(deadline, 'EEE d MMM, h:mm a');
}

/** "in 2 days" / "2 days ago" / "in 30 minutes". Null when no deadline. */
export function formatDeadlineRelative(
  deadline: Date | null,
  now: Date = new Date(),
): string | null {
  if (!deadline) return null;
  return formatDistanceStrict(deadline, now, { addSuffix: true, roundingMethod: 'floor' });
}

/** "No deadline" | "Fri 14 Nov, 5:00 PM · in 2 days" | "… · 2 days ago". */
export function formatDeadlineLine(deadline: Date | null, now: Date = new Date()): string {
  if (!deadline || !isValid(deadline)) return 'No deadline';
  const date = formatDeadlineDate(deadline);
  const relative = formatDeadlineRelative(deadline, now);
  return relative ? `${date} · ${relative}` : date;
}

/** "14 Nov 2025, 5:00 PM" — first seen / last updated / quiet meta. */
export function formatTimestamp(date: Date | null): string {
  if (!date || !isValid(date)) return '—';
  return format(date, 'd MMM yyyy, h:mm a');
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago". */
export function formatLastSynced(date: Date | null, now: Date = new Date()): string {
  if (!date || !isValid(date)) return 'never';
  return formatDistanceStrict(date, now, { addSuffix: true, roundingMethod: 'floor' });
}

/** True when `date` falls in [now, now + days] (inclusive bounds). */
export function isWithinNextDays(date: Date, now: Date, days: number): boolean {
  const end = dateFnsAddDays(now, days).getTime();
  const t = date.getTime();
  return t >= now.getTime() && t <= end;
}

export function isPast(date: Date, now: Date): boolean {
  return date.getTime() < now.getTime();
}

/** Minutes since midnight, e.g. '07:30' -> 450. Null when invalid. */
export function parseHHmm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 450 -> '07:30'. */
export function formatHHmm(minutesSinceMidnight: number): string {
  const m = ((minutesSinceMidnight % 1440) + 1440) % 1440;
  const hours = Math.floor(m / 60);
  const minutes = m % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Convert a wall-clock HH:mm on `base` day into a Date (local time zone). */
export function atTimeOfDay(base: Date, hhmm: string): Date | null {
  const minutes = parseHHmm(hhmm);
  if (minutes === null) return null;
  const result = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  result.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return result;
}

export function addDays(date: Date, amount: number): Date {
  return dateFnsAddDays(date, amount);
}

export function addHours(date: Date, amount: number): Date {
  return dateFnsAddHours(date, amount);
}
