/**
 * React Native Firebase singletons (v27 modular API) and conversion helpers.
 *
 * Instances are created lazily so that importing this module never touches
 * native code (important for unit tests and module initialization order).
 *
 * No secrets live in the app: the Android build reads google-services.json
 * (injected at build time by the config plugin) and access to Firestore is
 * granted per-account by the security rules.
 */
import {
  getAuth,
  onAuthStateChanged,
  signInWithCredential,
  signOut,
  GoogleAuthProvider,
  type Auth,
  type User,
} from '@react-native-firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  query,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  type Firestore,
  type DocumentData,
} from '@react-native-firebase/firestore';
import { getMessaging, type Messaging } from '@react-native-firebase/messaging';

let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;
let messagingInstance: Messaging | null = null;

/** Default Firebase Auth instance (lazily created). */
export function auth(): Auth {
  authInstance ??= getAuth();
  return authInstance;
}

/** Default Firestore instance (lazily created). */
export function db(): Firestore {
  firestoreInstance ??= getFirestore();
  return firestoreInstance;
}

/** Default Messaging instance (lazily created). */
export function messaging(): Messaging {
  messagingInstance ??= getMessaging();
  return messagingInstance;
}

export {
  onAuthStateChanged,
  signInWithCredential,
  signOut,
  GoogleAuthProvider,
  collection,
  doc,
  query,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
};
export type { User, DocumentData };

/** Convert a Date (or null) into a Firestore Timestamp; null stays null. */
export function toTimestampOrNull(date: Date | null): Timestamp | null {
  return date ? Timestamp.fromDate(date) : null;
}

/**
 * Convert a Firestore value (Timestamp | Date | anything) into a Date,
 * returning null for null/undefined/malformed values. Never throws.
 */
export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const candidate = value as { toDate?: () => Date };
  if (typeof candidate.toDate === 'function') {
    try {
      const date = candidate.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    } catch {
      return null;
    }
  }
  return null;
}
