/**
 * Selector tests: sorting, the 7-day window, done and snooze filtering,
 * the Closed rules, search, and sync health.
 */
import {
  applySearch,
  selectClosedTab,
  selectClosingSoonTab,
  selectDoneList,
  selectOpenTab,
  selectSyncHealth,
  type UserStateMap,
} from '../src/features/notices/selectors';
import type { Notice, NoticeUserState, Source } from '../src/utils/types';

const NOW = new Date(2025, 10, 12, 9, 0); // Wed 12 Nov 2025, 09:00

function hoursFromNow(hours: number): Date {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000);
}

function makeNotice(id: string, overrides: Partial<Notice> = {}): Notice {
  return {
    id,
    type: 'other',
    title: `Notice ${id}`,
    status: 'open',
    deadline: null,
    deadlinePhrase: null,
    confidence: 0.95,
    needsVerify: false,
    source: 'Test source',
    sourceLink: '',
    rawText: '',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeState(noticeId: string, overrides: Partial<NoticeUserState> = {}): NoticeUserState {
  return {
    noticeId,
    done: false,
    snoozedUntil: null,
    pinned: false,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('selectOpenTab', () => {
  it('includes every active status', () => {
    const statuses = ['open', 'extended', 'closing', 'postponed', 'info'] as const;
    const notices = statuses.map((status, i) => makeNotice(`n${i}`, { status }));
    const result = selectOpenTab(notices, {}, NOW);
    expect(result).toHaveLength(5);
  });

  it('excludes closed, done and snoozed notices', () => {
    const notices = [
      makeNotice('closed', { status: 'closed' }),
      makeNotice('done'),
      makeNotice('snoozed'),
      makeNotice('awake'),
    ];
    const userState: UserStateMap = {
      done: makeState('done', { done: true }),
      snoozed: makeState('snoozed', { snoozedUntil: hoursFromNow(5) }),
    };
    const result = selectOpenTab(notices, userState, NOW);
    expect(result.map((n) => n.id)).toEqual(['awake']);
  });

  it('re-includes notices whose snooze has expired', () => {
    const notices = [makeNotice('old-snooze')];
    const userState: UserStateMap = {
      'old-snooze': makeState('old-snooze', { snoozedUntil: hoursFromNow(-1) }),
    };
    expect(selectOpenTab(notices, userState, NOW)).toHaveLength(1);
  });

  it('sorts by updatedAt newest first with pinned items leading', () => {
    const notices = [
      makeNotice('old', { updatedAt: new Date(2025, 10, 1) }),
      makeNotice('pinned-old', { updatedAt: new Date(2025, 10, 2) }),
      makeNotice('new', { updatedAt: new Date(2025, 10, 10) }),
    ];
    const userState: UserStateMap = {
      'pinned-old': makeState('pinned-old', { pinned: true }),
    };
    const ids = selectOpenTab(notices, userState, NOW).map((n) => n.id);
    expect(ids).toEqual(['pinned-old', 'new', 'old']);
  });
});

describe('selectClosingSoonTab', () => {
  it('keeps deadlines inside the next 7 days and drops the rest', () => {
    const notices = [
      makeNotice('in-6-days', { deadline: hoursFromNow(24 * 6) }),
      makeNotice('in-7-days-edge', { deadline: hoursFromNow(24 * 7 - 1) }),
      makeNotice('beyond-7-days', { deadline: hoursFromNow(24 * 8) }),
      makeNotice('past', { deadline: hoursFromNow(-2) }),
      makeNotice('no-deadline', { deadline: null }),
    ];
    const ids = selectClosingSoonTab(notices, {}, NOW).map((n) => n.id);
    expect(ids).toEqual(['in-6-days', 'in-7-days-edge']);
  });

  it('excludes closed, done and snoozed notices', () => {
    const notices = [
      makeNotice('closed', { status: 'closed', deadline: hoursFromNow(24) }),
      makeNotice('done', { deadline: hoursFromNow(24) }),
      makeNotice('snoozed', { deadline: hoursFromNow(24) }),
      makeNotice('kept', { deadline: hoursFromNow(24) }),
    ];
    const userState: UserStateMap = {
      done: makeState('done', { done: true }),
      snoozed: makeState('snoozed', { snoozedUntil: hoursFromNow(2) }),
    };
    expect(selectClosingSoonTab(notices, userState, NOW).map((n) => n.id)).toEqual(['kept']);
  });

  it('sorts by deadline soonest first with pinned items leading', () => {
    const notices = [
      makeNotice('later', { deadline: hoursFromNow(24 * 5) }),
      makeNotice('sooner', { deadline: hoursFromNow(24) }),
      makeNotePinned(),
    ];
    function makeNotePinned(): Notice {
      return makeNotice('pinned-later', { deadline: hoursFromNow(24 * 6) });
    }
    const userState: UserStateMap = {
      'pinned-later': makeState('pinned-later', { pinned: true }),
    };
    const ids = selectClosingSoonTab(notices, userState, NOW).map((n) => n.id);
    expect(ids).toEqual(['pinned-later', 'sooner', 'later']);
  });
});

describe('selectClosedTab', () => {
  it('contains status-closed notices and past deadlines, regardless of done', () => {
    const notices = [
      makeNotice('status-closed', { status: 'closed' }),
      makeNotice('past-deadline', { deadline: hoursFromNow(-1) }),
      makeNotice('closed-and-done', { status: 'closed' }),
      makeNotice('still-open', { deadline: hoursFromNow(24) }),
    ];
    const userState: UserStateMap = {
      'closed-and-done': makeState('closed-and-done', { done: true }),
    };
    const ids = selectClosedTab(notices, userState, NOW).map((n) => n.id);
    expect(ids).toContain('status-closed');
    expect(ids).toContain('past-deadline');
    expect(ids).toContain('closed-and-done');
    expect(ids).not.toContain('still-open');
  });

  it('sorts by deadline newest first; notices without deadlines go last', () => {
    const notices = [
      makeNotice('no-deadline', { status: 'closed', deadline: null }),
      makeNotice('oldest', { deadline: hoursFromNow(-24 * 10) }),
      makeNotice('newest', { deadline: hoursFromNow(-1) }),
    ];
    const ids = selectClosedTab(notices, {}, NOW).map((n) => n.id);
    expect(ids).toEqual(['newest', 'oldest', 'no-deadline']);
  });
});

describe('selectDoneList', () => {
  it('lists only done notices, newest action first', () => {
    const notices = [makeNotice('a'), makeNotice('b'), makeNotice('c')];
    const userState: UserStateMap = {
      a: makeState('a', { done: true, updatedAt: new Date(2025, 10, 10) }),
      b: makeState('b', { done: false, updatedAt: new Date(2025, 10, 11) }),
      c: makeState('c', { done: true, updatedAt: new Date(2025, 10, 11) }),
    };
    const ids = selectDoneList(notices, userState).map((n) => n.id);
    expect(ids).toEqual(['c', 'a']);
  });
});

describe('applySearch', () => {
  it('matches titles case-insensitively and by type label', () => {
    const notices = [
      makeNotice('1', { title: 'EN4251 Exam registration opens' }),
      makeNotice('2', { title: 'Library closure', type: 'exam_registration' }),
      makeNotice('3', { title: 'Semester 6 results released' }),
    ];
    expect(applySearch(notices, 'exam').map((n) => n.id)).toEqual(['1', '2']);
    expect(applySearch(notices, 'RESULTS').map((n) => n.id)).toEqual(['3']);
    expect(applySearch(notices, '').map((n) => n.id)).toEqual(['1', '2', '3']);
    expect(applySearch(notices, 'zzz')).toHaveLength(0);
  });
});

describe('selectSyncHealth', () => {
  const source = (name: string, overrides: Partial<Source> = {}): Source => ({
    name,
    lastPolledAt: null,
    ok: true,
    lastError: null,
    ...overrides,
  });

  it('is fresh when polled recently', () => {
    const health = selectSyncHealth([source('moodle', { lastPolledAt: hoursFromNow(-1) })], NOW);
    expect(health.stale).toBe(false);
    expect(health.failing).toHaveLength(0);
  });

  it('is stale when the newest poll is older than 2 hours', () => {
    const health = selectSyncHealth(
      [source('moodle', { lastPolledAt: hoursFromNow(-3) }), source('gmail', { lastPolledAt: hoursFromNow(-5) })],
      NOW,
    );
    expect(health.stale).toBe(true);
    expect(health.lastPolledAt?.getTime()).toBe(hoursFromNow(-3).getTime());
  });

  it('is fresh while the newest poll is within 2 hours', () => {
    const health = selectSyncHealth(
      [source('moodle', { lastPolledAt: hoursFromNow(-1) }), source('gmail', { lastPolledAt: hoursFromNow(-3) })],
      NOW,
    );
    expect(health.stale).toBe(false);
    expect(health.lastPolledAt?.getTime()).toBe(hoursFromNow(-1).getTime());
  });

  it('is stale when sources exist but never polled', () => {
    const health = selectSyncHealth([source('moodle')], NOW);
    expect(health.stale).toBe(true);
    expect(health.lastPolledAt).toBeNull();
  });

  it('reports failing sources', () => {
    const health = selectSyncHealth(
      [source('moodle'), source('tecmis', { ok: false, lastError: 'HTTP 500' })],
      NOW,
    );
    expect(health.failing.map((s) => s.name)).toEqual(['tecmis']);
  });

  it('is not stale with no sources at all', () => {
    const health = selectSyncHealth([], NOW);
    expect(health.stale).toBe(false);
  });
});
