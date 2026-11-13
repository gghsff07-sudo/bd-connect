/**
 * React hooks over the data store. Screens read through these; the actual
 * Firestore listeners are owned by services/dataSync via the root layout,
 * so each listener is attached exactly once for the whole session.
 */
import { useEffect, useMemo, useState } from 'react';
import { useDataStore } from '../../store/data';
import type { Notice, NoticeUserState, Source } from '../../utils/types';
import { selectSyncHealth, type SyncHealth } from './selectors';

/** All notices as an array (fresh from the store). */
export function useNotices(): {
  notices: Notice[];
  userState: Record<string, NoticeUserState>;
  sources: Source[];
} {
  const noticeMap = useDataStore((state) => state.notices);
  const userState = useDataStore((state) => state.userState);
  const sourceMap = useDataStore((state) => state.sources);

  const notices = useMemo(() => Object.values(noticeMap), [noticeMap]);
  const sources = useMemo(
    () => Object.values(sourceMap).sort((a, b) => a.name.localeCompare(b.name)),
    [sourceMap],
  );
  return { notices, userState, sources };
}

/** A single notice and its user state. */
export function useNotice(id: string | undefined): {
  notice: Notice | undefined;
  state: NoticeUserState | undefined;
} {
  const notice = useDataStore((state) => (id ? state.notices[id] : undefined));
  const state = useDataStore((state) => (id ? state.userState[id] : undefined));
  return { notice, state };
}

/**
 * A ticking "now" so time-based filtering (7-day window, past deadlines)
 * stays correct while a screen is open. Default tick: once per minute.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Sync health for the Home header. */
export function useSyncHealth(now: Date): SyncHealth {
  const { sources } = useNotices();
  return useMemo(() => selectSyncHealth(sources, now), [sources, now]);
}
