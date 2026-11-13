/**
 * Authentication: Google Sign-In exchanged for a Firebase credential, plus
 * the owner gate. Exactly one account is allowed; the Firestore rules
 * enforce it server-side and the app checks it client-side too.
 */
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential, signOut } from '@react-native-firebase/auth';
import { collection, getDocs, limit, query } from '@react-native-firebase/firestore';
import { GOOGLE_WEB_CLIENT_ID, OWNER_EMAIL } from '../utils/env';
import { logger } from '../utils/logger';
import { auth, db } from './firebase';

export type VerifyResult = 'allowed' | 'denied' | 'unreachable';

let googleConfigured = false;

/** Configure Google Sign-In with the web client id (idempotent). */
export function configureGoogleSignIn(): void {
  if (googleConfigured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
  googleConfigured = true;
}

/**
 * Run the Google account picker and sign in to Firebase with the returned
 * id token. Returns 'cancelled' when the user backs out of the picker.
 * Throws on real failures.
 */
export async function googleSignIn(): Promise<'signed-in' | 'cancelled'> {
  configureGoogleSignIn();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (response.type !== 'success') {
    logger.info('Google sign-in was cancelled or had no saved credential');
    return 'cancelled';
  }
  const idToken = response.data.idToken;
  if (!idToken) {
    throw new Error('Google returned no id token');
  }
  const credential = GoogleAuthProvider.credential(idToken);
  await signInWithCredential(auth(), credential);
  return 'signed-in';
}

/** Sign out of both Firebase and Google (clears the cached account). */
export async function signOutEverywhere(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch (err) {
    // Signing out of Google is best-effort; Firebase sign-out is what matters.
    logger.warn('GoogleSignin.signOut failed', err);
  }
  await signOut(auth());
}

function isOwner(email: string | null): boolean {
  if (!email || !OWNER_EMAIL) return false;
  return email.trim().toLowerCase() === OWNER_EMAIL;
}

/**
 * Check whether the signed-in account may use this app.
 *
 * 1. Local check against EXPO_PUBLIC_OWNER_EMAIL (same value as OWNER_EMAIL
 *    in firestore.rules). A mismatch -> 'denied'.
 * 2. Probe read against Firestore. 'permission-denied' -> 'denied'
 *    (covers a mismatched/undeployed rules email). Network errors ->
 *    'unreachable' so the caller can offer a retry.
 */
export async function verifyOwnerAccess(email: string | null): Promise<VerifyResult> {
  if (!isOwner(email)) {
    logger.warn('Signed-in email is not the configured owner');
    return 'denied';
  }
  try {
    await getDocs(query(collection(db(), 'notices'), limit(1)));
    return 'allowed';
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    if (code.includes('permission-denied')) {
      logger.warn('Firestore denied the probe read; account is not the owner per rules');
      return 'denied';
    }
    logger.warn('Firestore probe read failed', err);
    return 'unreachable';
  }
}
