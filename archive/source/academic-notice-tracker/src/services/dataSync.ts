/**
 * Firestore data sync: live listeners for notices, sources, user state and
 * prefs, plus optimistic writes for the owner's own state and settings.
 *
 * The app never writes to `notices` or `sources` (rules deny it). All writes
 * go to `users/{uid}/...` with merge semantics; while offline the Firestore
 * SDK queues them locally and syncs them when connectivity returns.
 */
import {
  collection,
  db,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  toTimestampOrNull,
  toDate,
} from './firebase';
import { useDataStore } from '../store/data';
import { logger } from '../utils/logger';
import { parseHHmm } from '../utils/date';
import {
  DEFAULT_PREFS,
  NOTICE_TYPES,
  toNoticeStatus,
  toNoticeType,
  type Notice,
  type NoticeType,
  type NoticeUserState,
  type Prefs,
  type Source,
} from '../utils/types';

/** Performance cap from the build plan: the 200 newest notices. */
export const NOTICES_LIMIT = 200;

type DocData = Record<string, unknown>;

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Map a Firestore notice document into the app's Notice type.
 * Defensive by design: a malformed or sparse document must never crash
 * the UI (acceptance: null deadline + missing optional fields render fine).
 */
export function mapNotice(id: string, data: DocData): Notice {
  const deadline = toDate(data.deadline);
  const confidenceRaw = data.confidence;
  const confidence =
    typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw))
      : null;
  return {
    id,
    type: toNoticeType(data.type),
    title: asString(data.title, 'Untitled notice'),
    status: toNoticeStatus(data.status),
    deadline,
    deadlinePhrase: asNullableString(data.deadlinePhrase),
    confidence,
    // Caution-first: a document without needsVerify is treated as unverified.
    needsVerify: typeof data.needsVerify === 'boolean' ? data.needsVerify : true,
    source: asString(data.source, 'Unknown source'),
    sourceLink: asString(data.sourceLink, ''),
    rawText: asString(data.rawText, ''),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export function mapSource(name: string, data: DocData): Source {
  return {
    name,
    lastPolledAt: toDate(data.lastPolledAt),
    ok: data.ok === true,
    lastError: asNullableString(data.lastError),
  };
}

export function mapUserState(noticeId: string, data: DocData): NoticeUserState {
  return {
    noticeId,
    done: data.done === true,
    snoozedUntil: toDate(data.snoozedUntil),
    pinned: data.pinned === true,
    updatedAt: toDate(data.updatedAt),
  };
}

/** Map the prefs document; null when it does not exist yet (defaults apply). */
export function mapPrefs(data: DocData | undefined): Prefs | null {
  if (!data) return null;

  const offsets = Array.isArray(data.reminderOffsetsHours)
    ? data.reminderOffsetsHours.filter(
        (value): value is number =>
          typeof value === 'number' && Number.isFinite(value) && value > 0,
      )
    : null;

  const quiet = (data.quietHours ?? {}) as DocData;
  const quietStart =
    typeof quiet.start === 'string' && parseHHmm(quiet.start) !== null ? quiet.start : null;
  const quietEnd =
    typeof quiet.end === 'string' && parseHHmm(quiet.end) !== null ? quiet.end : null;

  const muted = Array.isArray(data.mutedTypes)
    ? data.mutedTypes.filter(
        (value): value is NoticeType =>
          typeof value === 'string' && NOTICE_TYPES.includes(value as NoticeType),
      )
    : [];

  return {
    reminderOffsetsHours: offsets ?? [...DEFAULT_PREFS.reminderOffsetsHours],
    quietHours: {
      start: quietStart ?? DEFAULT_PREFS.quietHours.start,
      end: quietEnd ?? DEFAULT_PREFS.quietHours.end,
    },
    mutedTypes: muted,
  };
}

let stopCurrentSync: (() => void) | null = null;
let currentUid: string | null = null;

/**
 * Attach all live listeners for the signed-in owner. Returns a stop
 * function; the root layout calls it on sign-out/unmount.
 */
export function startDataSync(uid: string): () => void {
  currentUid = uid;
  stopCurrentSync?.();

  const store = useDataStore.getState();
  store.setStatus('loading');
  store.setError(null);

  const fs = db();
  const unsubs: (() => void)[] = [];

  unsubs.push(
    onSnapshot(
      query(collection(fs, 'notices'), orderBy('updatedAt', 'desc'), limit(NOTICES_LIMIT)),
      (snapshot) => {
        const notices = snapshot.docs.map((docSnap) => mapNotice(docSnap.id, docSnap.data()));
        const dataStore = useDataStore.getState();
        dataStore.setNotices(notices);
        dataStore.setStatus('ready');
        dataStore.setError(null);
      },
      (error) => {
        logger.error('notices listener failed', error);
        const dataStore = useDataStore.getState();
        dataStore.setStatus('error');
        dataStore.setError(describeError(error, 'Could not load notices.'));
      },
    ),
  );

  unsubs.push(
    onSnapshot(
      collection(fs, 'sources'),
      (snapshot) => {
        const sources = snapshot.docs.map((docSnap) => mapSource(docSnap.id, docSnap.data()));
        useDataStore.getState().setSources(sources);
      },
      (error) => logger.warn('sources listener failed', error),
    ),
  );

  unsubs.push(
    onSnapshot(
      collection(fs, 'users', uid, 'state'),
      (snapshot) => {
        const states = snapshot.docs.map((docSnap) => mapUserState(docSnap.id, docSnap.data()));
        useDataStore.getState().setUserState(states);
      },
      (error) => logger.warn('user state listener failed', error),
    ),
  );

  unsubs.push(
    onSnapshot(
      doc(fs, 'users', uid, 'settings', 'prefs'),
      (docSnap) => {
        useDataStore.getState().setPrefs(docSnap.exists() ? mapPrefs(docSnap.data()) : null);
      },
      (error) => logger.warn('prefs listener failed', error),
    ),
  );

  stopCurrentSync = () => {
    unsubs.forEach((unsub) => {
      try {
        unsub();
      } catch (err) {
        logger.warn('listener unsubscribe failed', err);
      }
    });
    stopCurrentSync = null;
  };
  return stopCurrentSync;
}

/** Retry after a listener error: detach and re-attach with the same uid. */
export function restartDataSync(): void {
  if (currentUid) startDataSync(currentUid);
}

export function stopDataSync(): void {
  stopCurrentSync?.();
  stopCurrentSync = null;
  currentUid = null;
  useDataStore.getState().reset();
}

function describeError(error: unknown, fallback: string): string {
  const code = (error as { code?: string }).code ?? '';
  if (code.includes('permission-denied')) {
    return 'The database rejected this account. Sign out and sign in with the owner account.';
  }
  return fallback;
}

function stateDoc(uid: string, noticeId: string) {
  return doc(db(), 'users', uid, 'state', noticeId);
}

/** Merge-write one field group of the per-notice state, optimistically. */
async function writeUserState(
  uid: string,
  noticeId: string,
  patch: Partial<Pick<NoticeUserState, 'done' | 'snoozedUntil' | 'pinned'>>,
): Promise<void> {
  useDataStore.getState().patchUserState(noticeId, { ...patch, updatedAt: new Date() });
  try {
    const data: Record<string, unknown> = { ...patch, updatedAt: serverTimestamp() };
    if (patch.snoozedUntil !== undefined) {
      data.snoozedUntil = toTimestampOrNull(patch.snoozedUntil);
    }
    await setDoc(stateDoc(uid, noticeId), data, { merge: true });
  } catch (error) {
    logger.error('Failed to write notice state', { noticeId, error });
  }
}

export function setNoticeDone(uid: string, noticeId: string, done: boolean): Promise<void> {
  return writeUserState(uid, noticeId, { done });
}

export function setNoticeSnoozed(
  uid: string,
  noticeId: string,
  until: Date | null,
): Promise<void> {
  return writeUserState(uid, noticeId, { snoozedUntil: until });
}

export function setNoticePinned(uid: string, noticeId: string, pinned: boolean): Promise<void> {
  return writeUserState(uid, noticeId, { pinned });
}

/** Merge-write the prefs document and update the store optimistically. */
export async function updatePrefs(uid: string, patch: Partial<Prefs>): Promise<void> {
  const current = useDataStore.getState().prefs;
  useDataStore.getState().setPrefs({ ...current, ...patch });
  try {
    await setDoc(
      doc(db(), 'users', uid, 'settings', 'prefs'),
      { ...patch, updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (error) {
    logger.error('Failed to write prefs', error);
  }
}

/** Register this device's FCM token so the backend knows where to push. */
export async function registerDeviceToken(
  uid: string,
  token: string,
  previousToken?: string | null,
): Promise<void> {
  const tokenRef = doc(db(), 'users', uid, 'devices', token);
  const existing = await getDoc(tokenRef);
  await setDoc(
    tokenRef,
    {
      platform: 'android',
      ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
      lastSeenAt: serverTimestamp(),
    },
    { merge: true },
  );
  if (previousToken && previousToken !== token) {
    try {
      await deleteDoc(doc(db(), 'users', uid, 'devices', previousToken));
    } catch (error) {
      logger.warn('Could not delete the previous device token', error);
    }
  }
}
