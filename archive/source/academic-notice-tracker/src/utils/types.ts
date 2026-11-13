/**
 * Domain types for the Academic Notice Tracker app.
 *
 * These mirror the Firestore contract in the build plan (section 5).
 * The app is read-only on `notices` and `sources`; it writes only its own
 * state under `users/{uid}/...`.
 */

export type NoticeType =
  | 'exam_registration'
  | 'semester_registration'
  | 'submission'
  | 'result'
  | 'other';

export type NoticeStatus =
  | 'open'
  | 'closing'
  | 'closed'
  | 'extended'
  | 'postponed'
  | 'info';

export interface Notice {
  id: string;
  type: NoticeType;
  title: string;
  status: NoticeStatus;
  /** Parsed deadline, already converted to a Date. Null when unparseable. */
  deadline: Date | null;
  /** Original wording, e.g. "next Friday 5 PM". */
  deadlinePhrase: string | null;
  /** Extraction confidence 0..1, null when missing. */
  confidence: number | null;
  /** True when confidence is low or the date could not be parsed. */
  needsVerify: boolean;
  /** Sender or source name, e.g. "Registrar / Gmail". */
  source: string;
  /** URL to the original message; empty string when absent. */
  sourceLink: string;
  /** Cleaned original text. */
  rawText: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface Source {
  name: string;
  lastPolledAt: Date | null;
  ok: boolean;
  lastError: string | null;
}

/** Per-notice user state, stored in users/{uid}/state/{noticeId}. */
export interface NoticeUserState {
  noticeId: string;
  done: boolean;
  snoozedUntil: Date | null;
  pinned: boolean;
  updatedAt: Date | null;
}

export interface QuietHours {
  /** 'HH:mm', 24-hour. Enforced by the backend; the app only edits it. */
  start: string;
  end: string;
}

export interface Prefs {
  reminderOffsetsHours: number[];
  quietHours: QuietHours;
  mutedTypes: NoticeType[];
}

export const DEFAULT_REMINDER_OFFSETS: number[] = [72, 24, 3];

export const DEFAULT_PREFS: Prefs = {
  reminderOffsetsHours: [...DEFAULT_REMINDER_OFFSETS],
  quietHours: { start: '22:00', end: '07:00' },
  mutedTypes: [],
};

export const NOTICE_TYPES: NoticeType[] = [
  'exam_registration',
  'semester_registration',
  'submission',
  'result',
  'other',
];

export const NOTICE_STATUSES: NoticeStatus[] = [
  'open',
  'closing',
  'closed',
  'extended',
  'postponed',
  'info',
];

export const NOTICE_TYPE_LABELS: Record<NoticeType, string> = {
  exam_registration: 'Exam registration',
  semester_registration: 'Semester registration',
  submission: 'Submission',
  result: 'Result',
  other: 'Other',
};

export const NOTICE_STATUS_LABELS: Record<NoticeStatus, string> = {
  open: 'Open',
  closing: 'Closing',
  closed: 'Closed',
  extended: 'Extended',
  postponed: 'Postponed',
  info: 'Info',
};

/** FCM data payload kinds produced by the backend. */
export type PushKind = 'new' | 'status_change' | 'deadline_change' | 'reminder';

/**
 * Coerce an unknown Firestore value into a NoticeType.
 * Unknown or missing values become 'other' so the app never crashes
 * on a malformed document.
 */
export function toNoticeType(value: unknown): NoticeType {
  return typeof value === 'string' && value in NOTICE_TYPE_LABELS
    ? (value as NoticeType)
    : 'other';
}

/**
 * Coerce an unknown Firestore value into a NoticeStatus.
 * Unknown or missing values become 'info' (informational, still visible
 * on the Open tab so nothing active is ever hidden).
 */
export function toNoticeStatus(value: unknown): NoticeStatus {
  return typeof value === 'string' && value in NOTICE_STATUS_LABELS
    ? (value as NoticeStatus)
    : 'info';
}

/** Confidence label: Low below 0.7, High at 0.9 or above, Medium between. */
export function confidenceLabel(confidence: number | null): 'Low' | 'Medium' | 'High' | 'Unknown' {
  if (confidence === null || !Number.isFinite(confidence)) return 'Unknown';
  if (confidence < 0.7) return 'Low';
  if (confidence >= 0.9) return 'High';
  return 'Medium';
}
