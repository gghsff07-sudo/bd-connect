/**
 * Auth gate state machine (Zustand).
 *
 * A single onAuthStateChanged listener drives everything:
 *   loading -> signedOut                 (no persisted session)
 *   loading -> verifying -> allowed      (owner email + Firestore read OK)
 *                      -> denied         (not the owner email, or Firestore
 *                                        denied the read)
 *                      -> error          (network error during verification,
 *                                        retryable)
 */
import { create } from 'zustand';
import { auth, onAuthStateChanged } from '../services/firebase';
import { logger } from '../utils/logger';
import {
  googleSignIn,
  signOutEverywhere,
  verifyOwnerAccess,
  type VerifyResult,
} from '../services/auth';

export type AuthStatus =
  | 'loading'
  | 'signedOut'
  | 'verifying'
  | 'allowed'
  | 'denied'
  | 'error';

export interface AuthUser {
  uid: string;
  email: string | null;
}

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
  /** Attach the auth listener once (called from the root layout). */
  init: () => void;
  signIn: () => Promise<void>;
  retryVerify: () => Promise<void>;
  signOut: () => Promise<void>;
}

let unsubscribeAuth: (() => void) | null = null;
let verifyInFlight = false;

async function runVerification(
  email: string | null,
  set: (partial: Partial<AuthState>) => void,
) {
  if (verifyInFlight) return;
  verifyInFlight = true;
  set({ status: 'verifying', error: null });
  try {
    const result: VerifyResult = await verifyOwnerAccess(email);
    if (result === 'allowed') {
      set({ status: 'allowed', error: null });
    } else if (result === 'denied') {
      set({ status: 'denied', error: null });
    } else {
      set({
        status: 'error',
        error: 'Could not reach the database. Check your connection and try again.',
      });
    }
  } catch (err) {
    logger.error('Owner verification failed', err);
    set({
      status: 'error',
      error: 'Something went wrong while checking access. Try again.',
    });
  } finally {
    verifyInFlight = false;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  error: null,

  init: () => {
    if (unsubscribeAuth) return;
    unsubscribeAuth = onAuthStateChanged(auth(), async (user) => {
      if (!user) {
        set({ status: 'signedOut', user: null, error: null });
        return;
      }
      const authUser: AuthUser = { uid: user.uid, email: user.email ?? null };
      set({ user: authUser });
      await runVerification(user.email ?? null, set);
    });
  },

  signIn: async () => {
    set({ status: 'verifying', error: null });
    try {
      const result = await googleSignIn();
      if (result === 'cancelled') {
        // No auth change will fire; restore the signed-out (or existing) state.
        if (!auth().currentUser) {
          set({ status: 'signedOut', error: null });
        }
        return;
      }
      // onAuthStateChanged fires and completes verification.
    } catch (err) {
      logger.error('Google sign-in failed', err);
      set({
        status: get().user ? 'error' : 'signedOut',
        error:
          err instanceof Error && err.message
            ? `Sign-in failed: ${err.message}`
            : 'Sign-in failed. Please try again.',
      });
    }
  },

  retryVerify: async () => {
    const user = get().user;
    if (!user) return;
    await runVerification(user.email, set);
  },

  signOut: async () => {
    try {
      await signOutEverywhere();
    } catch (err) {
      logger.error('Sign-out failed', err);
    }
    // onAuthStateChanged sets status to signedOut.
  },
}));
