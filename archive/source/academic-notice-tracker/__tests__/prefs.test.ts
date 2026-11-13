/**
 * Prefs mapping and reminder-toggle tests.
 */
import { mapNotice, mapPrefs } from '../src/services/dataSync';
import { toggleReminderOffset } from '../src/features/settings/usePrefs';
import { confidenceLabel } from '../src/utils/types';

describe('toggleReminderOffset', () => {
  it('removes an active offset', () => {
    expect(toggleReminderOffset([72, 24, 3], 24)).toEqual([72, 3]);
  });

  it('adds and sorts a missing offset', () => {
    expect(toggleReminderOffset([72, 3], 24)).toEqual([3, 24, 72]);
  });

  it('allows removing the last standard offset (reminders can be disabled entirely)', () => {
    expect(toggleReminderOffset([24], 24)).toEqual([]);
  });

  it('can remove custom offsets down to empty', () => {
    expect(toggleReminderOffset([48], 48)).toEqual([]);
  });

  it('adds custom offsets alongside standards', () => {
    expect(toggleReminderOffset([72, 24, 3], 12)).toEqual([3, 12, 24, 72]);
  });
});

describe('mapPrefs', () => {
  it('returns null for a missing document (defaults apply)', () => {
    expect(mapPrefs(undefined)).toBeNull();
  });

  it('falls back to defaults for an empty or malformed document', () => {
    const prefs = mapPrefs({});
    expect(prefs?.reminderOffsetsHours).toEqual([72, 24, 3]);
    expect(prefs?.quietHours).toEqual({ start: '22:00', end: '07:00' });
    expect(prefs?.mutedTypes).toEqual([]);
  });

  it('keeps valid values and drops invalid ones', () => {
    const prefs = mapPrefs({
      reminderOffsetsHours: [24, 'bogus', 0, 6],
      quietHours: { start: '21:30', end: 'nope' },
      mutedTypes: ['result', 'unknown_type'],
    });
    expect(prefs?.reminderOffsetsHours).toEqual([24, 6]);
    expect(prefs?.quietHours.start).toBe('21:30');
    expect(prefs?.quietHours.end).toBe('07:00');
    expect(prefs?.mutedTypes).toEqual(['result']);
  });
});

describe('mapNotice robustness', () => {
  it('survives a completely empty document', () => {
    const notice = mapNotice('doc-id', {});
    expect(notice.id).toBe('doc-id');
    expect(notice.title).toBe('Untitled notice');
    expect(notice.deadline).toBeNull();
    expect(notice.type).toBe('other');
    expect(notice.status).toBe('info');
    expect(notice.needsVerify).toBe(true);
    expect(notice.confidence).toBeNull();
    expect(notice.sourceLink).toBe('');
  });

  it('keeps valid fields and clamps confidence', () => {
    const notice = mapNotice('doc-id', {
      title: 'Exam registration',
      type: 'exam_registration',
      status: 'closing',
      confidence: 1.7,
      needsVerify: false,
      deadline: { toDate: () => new Date(2025, 10, 14, 17, 0) },
      deadlinePhrase: 'next Friday 5 PM',
      sourceLink: 'https://example.com',
    });
    expect(notice.confidence).toBe(1);
    expect(notice.deadline).toEqual(new Date(2025, 10, 14, 17, 0));
    expect(notice.deadlinePhrase).toBe('next Friday 5 PM');
    expect(notice.type).toBe('exam_registration');
    expect(notice.status).toBe('closing');
    expect(notice.sourceLink).toBe('https://example.com');
  });

  it('handles an explicitly null deadline', () => {
    const notice = mapNotice('doc-id', { deadline: null, title: 'No date' });
    expect(notice.deadline).toBeNull();
  });
});

describe('confidenceLabel', () => {
  it('buckets confidence values', () => {
    expect(confidenceLabel(null)).toBe('Unknown');
    expect(confidenceLabel(0.5)).toBe('Low');
    expect(confidenceLabel(0.69)).toBe('Low');
    expect(confidenceLabel(0.7)).toBe('Medium');
    expect(confidenceLabel(0.89)).toBe('Medium');
    expect(confidenceLabel(0.9)).toBe('High');
    expect(confidenceLabel(1)).toBe('High');
  });
});
