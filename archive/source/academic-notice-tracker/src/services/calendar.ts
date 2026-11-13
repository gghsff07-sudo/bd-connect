/**
 * Optional "Add to calendar" action (expo-calendar, "Calendar Next" API).
 * Creates a timed event at the parsed deadline in a writable calendar —
 * on Android there is no single default calendar, so a primary writable
 * calendar is chosen, falling back to any writable one.
 */
import { getCalendars, requestCalendarPermissions, type ExpoCalendar } from 'expo-calendar';
import { addHours } from '../utils/date';
import type { Notice } from '../utils/types';

export type CalendarResult = 'added' | 'denied' | 'no-deadline' | 'no-calendar' | 'error';

export async function addNoticeToCalendar(notice: Notice): Promise<CalendarResult> {
  if (!notice.deadline) return 'no-deadline';
  try {
    const permission = await requestCalendarPermissions();
    if (!permission.granted) return 'denied';

    const calendars = await getCalendars();
    const target = pickCalendar(calendars);
    if (!target) return 'no-calendar';

    await target.createEvent({
      title: notice.title,
      startDate: notice.deadline,
      endDate: addHours(notice.deadline, 1),
      notes: buildNotes(notice),
      // timeZone omitted: the event is created in the device time zone.
    });
    return 'added';
  } catch {
    return 'error';
  }
}

function pickCalendar(calendars: ExpoCalendar[]): ExpoCalendar | undefined {
  const writable = calendars.filter((calendar) => calendar.allowsModifications);
  return writable.find((calendar) => calendar.isPrimary) ?? writable[0];
}

function buildNotes(notice: Notice): string {
  const lines = [`Source: ${notice.source}`];
  if (notice.sourceLink) lines.push(notice.sourceLink);
  if (notice.deadlinePhrase) lines.push(`Stated deadline: "${notice.deadlinePhrase}"`);
  if (notice.rawText) lines.push('', truncate(notice.rawText, 600));
  return lines.join('\n');
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
