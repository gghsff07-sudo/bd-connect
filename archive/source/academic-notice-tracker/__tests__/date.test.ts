/**
 * Date formatting tests, including the spec's example line
 * "Fri 14 Nov, 5:00 PM · in 2 days".
 */
import {
  atTimeOfDay,
  formatDeadlineLine,
  formatHHmm,
  formatLastSynced,
  formatTimestamp,
  isPast,
  isWithinNextDays,
  parseHHmm,
} from '../src/utils/date';

describe('formatDeadlineLine', () => {
  it('returns a placeholder for null deadlines', () => {
    expect(formatDeadlineLine(null)).toBe('No deadline');
  });

  it('formats the spec example: date, time and relative distance', () => {
    const deadline = new Date(2025, 10, 14, 17, 0); // Fri 14 Nov 2025, 17:00
    const now = new Date(2025, 10, 12, 9, 0); // Wed 12 Nov 2025, 09:00
    expect(formatDeadlineLine(deadline, now)).toBe('Fri 14 Nov, 5:00 PM · in 2 days');
  });

  it('says "ago" for past deadlines', () => {
    const deadline = new Date(2025, 10, 10, 9, 0);
    const now = new Date(2025, 10, 12, 9, 0);
    expect(formatDeadlineLine(deadline, now)).toBe('Mon 10 Nov, 9:00 AM · 2 days ago');
  });

  it('uses sub-day units close to the deadline', () => {
    const now = new Date(2025, 10, 14, 15, 0);
    const deadline = new Date(2025, 10, 14, 17, 0);
    expect(formatDeadlineLine(deadline, now)).toBe('Fri 14 Nov, 5:00 PM · in 2 hours');
  });
});

describe('formatTimestamp', () => {
  it('formats dates and tolerates null', () => {
    expect(formatTimestamp(new Date(2025, 10, 14, 17, 0))).toBe('14 Nov 2025, 5:00 PM');
    expect(formatTimestamp(null)).toBe('—');
  });
});

describe('formatLastSynced', () => {
  it('describes recency', () => {
    const now = new Date(2025, 10, 12, 9, 0);
    expect(formatLastSynced(new Date(2025, 10, 12, 8, 55), now)).toBe('5 minutes ago');
    expect(formatLastSynced(null, now)).toBe('never');
  });
});

describe('HH:mm helpers', () => {
  it('parses HH:mm strings strictly', () => {
    expect(parseHHmm('07:30')).toBe(450);
    expect(parseHHmm('7:30')).toBe(450);
    expect(parseHHmm('23:59')).toBe(1439);
    expect(parseHHmm('00:00')).toBe(0);
    expect(parseHHmm('24:00')).toBeNull();
    expect(parseHHmm('12:60')).toBeNull();
    expect(parseHHmm('noon')).toBeNull();
    expect(parseHHmm('')).toBeNull();
  });

  it('formats minutes since midnight with padding', () => {
    expect(formatHHmm(450)).toBe('07:30');
    expect(formatHHmm(0)).toBe('00:00');
    expect(formatHHmm(1439)).toBe('23:59');
  });

  it('builds a Date at the given wall-clock time on a base day', () => {
    const base = new Date(2025, 10, 12, 15, 45);
    const result = atTimeOfDay(base, '09:15');
    expect(result).toEqual(new Date(2025, 10, 12, 9, 15));
    expect(atTimeOfDay(base, 'junk')).toBeNull();
  });
});

describe('window helpers', () => {
  const now = new Date(2025, 10, 12, 9, 0);

  it('isWithinNextDays includes the boundary and excludes beyond it', () => {
    expect(isWithinNextDays(new Date(2025, 10, 12, 9, 0), now, 7)).toBe(true);
    expect(isWithinNextDays(new Date(2025, 10, 19, 9, 0), now, 7)).toBe(true);
    expect(isWithinNextDays(new Date(2025, 10, 19, 9, 1), now, 7)).toBe(false);
    expect(isWithinNextDays(new Date(2025, 10, 12, 8, 59), now, 7)).toBe(false);
  });

  it('isPast compares strictly', () => {
    expect(isPast(new Date(2025, 10, 12, 8, 59), now)).toBe(true);
    expect(isPast(now, now)).toBe(false);
    expect(isPast(new Date(2025, 10, 12, 9, 1), now)).toBe(false);
  });
});
