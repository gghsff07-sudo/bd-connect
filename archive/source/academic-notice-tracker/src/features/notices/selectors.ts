/**
 * Pure selectors for the Home tabs and Done list.
 *
 * Tab semantics (build plan section 7, plus the owner's decision that
 * postponed/info notices stay visible):
 *
 *  Open         every active status (open, extended, closing, postponed,
 *               info), not done, not snoozed. Sorted by updatedAt, newest
 *               first.
 *  Closing soon deadline within the next 7 days, not done, not snoozed,
 *               status not closed (closed notices live on the Closed tab).
 *               Sorted by deadline, soonest first.
 *  Closed       status closed OR deadline in the past (done/snooze do not
 *               filter this tab). Sorted by deadline, newest first.
 *  Done         marked done. Sorted by the state's updatedAt, newest first.
 *
 * Pinned items come first in every tab. All functions take `now` so they
 * stay deterministic under test.
 */
import {
  NOTICE_TYPE_LABELS,
  type Notice,
  type NoticeUserState,
  type Source,
} from '../../utils/types';
import { isPast, isWithinNextDays } from '../../utils/date';

export type TabKey = 'open' | 'closing' | 'closed';

export type UserStateMap = Record<string, NoticeUserState>;

const ACTIVE_STATUSES = new Set(['open', 'extended', 'closing', 'postponed', 'info']);

export function isActiveStatus(status: Notice['status']): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function isSnoozed(state: NoticeUserState | undefined, now: Date): boolean {
  return state?.snoozedUntil != null && state.snoozedUntil.getTime() > now.getTime();
}

export function isDone(state: NoticeUserState | undefined): boolean {
  return state?.done === true;
}

export function isPinned(state: NoticeUserState | undefined): boolean {
  return state?.pinned === true;
}

/** True when the notice should appear on the Closed tab. */
export function isClosedNotice(notice: Notice, now: Date): boolean {
  if (notice.status === 'closed') return true;
  return notice.deadline !== null && isPast(notice.deadline, now);
}

/** Comparator: pinned first, then by the given key (desc unless stated). */
function comparePinnedFirst(
  a: Notice,
  b: Notice,
  userState: UserStateMap,
  compareUnderlying: (a: Notice, b: Notice) => number,
): number {
  const pinnedDiff = Number(isPinned(userState[b.id])) - Number(isPinned(userState[a.id]));
  if (pinnedDiff !== 0) return pinnedDiff;
  return compareUnderlying(a, b);
}

function timeOrNull(date: Date | null): number | null {
  return date ? date.getTime() : null;
}

function compareByDateDesc(key: 'updatedAt' | 'deadline' | 'createdAt'): (a: Notice, b: Notice) => number {
  return (a, b) => (timeOrNull(b[key]) ?? -Infinity) - (timeOrNull(a[key]) ?? -Infinity);
}

function compareByDeadlineAsc(a: Notice, b: Notice): number {
  // Nulls sort last (undefined deadlines at the bottom).
  return (timeOrNull(a.deadline) ?? Infinity) - (timeOrNull(b.deadline) ?? Infinity);
}

/** Home tab: active notices, not done, not snoozed. */
export function selectOpenTab(
  notices: Notice[],
  userState: UserStateMap,
  now: Date,
): Notice[] {
  return notices
    .filter(
      (notice) =>
        isActiveStatus(notice.status) &&
        !isDone(userState[notice.id]) &&
        !isSnoozed(userState[notice.id], now),
    )
    .sort((a, b) =>
      comparePinnedFirst(a, b, userState, compareByDateDesc('updatedAt')),
    );
}

/** Home tab: deadline within the next 7 days. */
export function selectClosingSoonTab(
  notices: Notice[],
  userState: UserStateMap,
  now: Date,
): Notice[] {
  return notices
    .filter(
      (notice) =>
        notice.deadline !== null &&
        isWithinNextDays(notice.deadline, now, 7) &&
        notice.status !== 'closed' &&
        !isDone(userState[notice.id]) &&
        !isSnoozed(userState[notice.id], now),
    )
    .sort((a, b) => comparePinnedFirst(a, b, userState, compareByDeadlineAsc));
}

/** Home tab: closed or past-deadline notices. */
export function selectClosedTab(
  notices: Notice[],
  userState: UserStateMap,
  now: Date,
): Notice[] {
  return notices
    .filter((notice) => isClosedNotice(notice, now))
    .sort((a, b) =>
      comparePinnedFirst(a, b, userState, (x, y) => {
        // Deadline newest first; notices without a deadline go last.
        const xd = timeOrNull(x.deadline);
        const yd = timeOrNull(y.deadline);
        if (xd === null && yd === null) return compareByDateDesc('updatedAt')(x, y);
        if (xd === null) return 1;
        if (yd === null) return -1;
        return yd - xd;
      }),
    );
}

/** Done tab: marked done, newest action first. */
export function selectDoneList(notices: Notice[], userState: UserStateMap): Notice[] {
  return notices
    .filter((notice) => isDone(userState[notice.id]))
    .sort((a, b) => {
      const pinnedDiff = Number(isPinned(userState[b.id])) - Number(isPinned(userState[a.id]));
      if (pinnedDiff !== 0) return pinnedDiff;
      const aTime = timeOrNull(userState[a.id]?.updatedAt ?? null) ?? timeOrNull(a.updatedAt) ?? 0;
      const bTime = timeOrNull(userState[b.id]?.updatedAt ?? null) ?? timeOrNull(b.updatedAt) ?? 0;
      return bTime - aTime;
    });
}

export function selectForTab(
  tab: TabKey,
  notices: Notice[],
  userState: UserStateMap,
  now: Date,
): Notice[] {
  switch (tab) {
    case 'open':
      return selectOpenTab(notices, userState, now);
    case 'closing':
      return selectClosingSoonTab(notices, userState, now);
    case 'closed':
      return selectClosedTab(notices, userState, now);
  }
}

/** Search filter: matches the title or the notice type label, case-insensitively. */
export function applySearch(notices: Notice[], query: string): Notice[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return notices;
  return notices.filter((notice) => {
    if (notice.title.toLowerCase().includes(needle)) return true;
    const typeLabel = NOTICE_TYPE_LABELS[notice.type].toLowerCase();
    return typeLabel.includes(needle);
  });
}

export interface SyncHealth {
  /** Newest lastPolledAt across sources; null when nothing has polled yet. */
  lastPolledAt: Date | null;
  /** Older than 2 hours, or no source has ever polled. */
  stale: boolean;
  /** Sources currently failing. */
  failing: Source[];
}

/** Stale-sync / failing-source computation for the Home header banner. */
export function selectSyncHealth(sources: Source[], now: Date): SyncHealth {
  let lastPolledAt: Date | null = null;
  for (const source of sources) {
    if (source.lastPolledAt && (!lastPolledAt || source.lastPolledAt > lastPolledAt)) {
      lastPolledAt = source.lastPolledAt;
    }
  }
  const failing = sources.filter((source) => !source.ok);
  const stale =
    lastPolledAt === null ? sources.length > 0 : now.getTime() - lastPolledAt.getTime() > 2 * 60 * 60 * 1000;
  return { lastPolledAt, stale, failing };
}
