/**
 * Notice/user data store (Zustand).
 *
 * The store is written to exclusively by the Firestore live listeners in
 * services/dataSync.ts and by optimistic local patches when the owner
 * changes state (done / snooze / pin). Screens never write directly.
 */
import { create } from 'zustand';
import {
  DEFAULT_PREFS,
  type Notice,
  type NoticeUserState,
  type Prefs,
  type Source,
} from '../utils/types';

export type DataStatus = 'idle' | 'loading' | 'ready' | 'error';

interface DataState {
  status: DataStatus;
  /** Human-readable error for the listener failure, null otherwise. */
  error: string | null;
  notices: Record<string, Notice>;
  sources: Record<string, Source>;
  userState: Record<string, NoticeUserState>;
  prefs: Prefs;
  prefsLoaded: boolean;

  setStatus: (status: DataStatus) => void;
  setError: (error: string | null) => void;
  setNotices: (notices: Notice[]) => void;
  setSources: (sources: Source[]) => void;
  setUserState: (states: NoticeUserState[]) => void;
  patchUserState: (noticeId: string, patch: Partial<NoticeUserState>) => void;
  setPrefs: (prefs: Prefs | null) => void;
  reset: () => void;
}

export const useDataStore = create<DataState>((set) => ({
  status: 'idle',
  error: null,
  notices: {},
  sources: {},
  userState: {},
  prefs: DEFAULT_PREFS,
  prefsLoaded: false,

  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setNotices: (notices) =>
    set(() => ({
      notices: Object.fromEntries(notices.map((n) => [n.id, n])),
    })),
  setSources: (sources) =>
    set(() => ({
      sources: Object.fromEntries(sources.map((s) => [s.name, s])),
    })),
  setUserState: (states) =>
    set(() => ({
      userState: Object.fromEntries(states.map((s) => [s.noticeId, s])),
    })),
  patchUserState: (noticeId, patch) =>
    set((state) => {
      const existing = state.userState[noticeId];
      const next: NoticeUserState = {
        noticeId,
        done: patch.done ?? existing?.done ?? false,
        snoozedUntil: patch.snoozedUntil !== undefined ? patch.snoozedUntil : existing?.snoozedUntil ?? null,
        pinned: patch.pinned ?? existing?.pinned ?? false,
        updatedAt: patch.updatedAt ?? existing?.updatedAt ?? null,
      };
      return { userState: { ...state.userState, [noticeId]: next } };
    }),
  setPrefs: (prefs) =>
    set(() => ({
      prefs: prefs ?? DEFAULT_PREFS,
      prefsLoaded: true,
    })),
  reset: () =>
    set({
      status: 'idle',
      error: null,
      notices: {},
      sources: {},
      userState: {},
      prefs: DEFAULT_PREFS,
      prefsLoaded: false,
    }),
}));
