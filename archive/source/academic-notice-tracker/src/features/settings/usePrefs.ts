/**
 * Prefs hook: reads the live Firestore-backed store and writes patches
 * through dataSync (optimistic + queued when offline).
 */
import { useCallback } from 'react';
import { useDataStore } from '../../store/data';
import { useAuthStore } from '../../store/auth';
import { updatePrefs } from '../../services/dataSync';
import type { Prefs } from '../../utils/types';

export function usePrefs() {
  const uid = useAuthStore((state) => state.user?.uid);
  const prefs = useDataStore((state) => state.prefs);
  const prefsLoaded = useDataStore((state) => state.prefsLoaded);

  const update = useCallback(
    async (patch: Partial<Prefs>) => {
      if (!uid) return;
      await updatePrefs(uid, patch);
    },
    [uid],
  );

  return { prefs, prefsLoaded, update };
}

/**
 * Toggle one reminder offset in the list (pure helper, unit-tested).
 * The three standard offsets (72/24/3 hours) are always offered in the UI;
 * the array itself can contain any positive custom values — including none
 * at all, which simply disables reminder pushes.
 */
export function toggleReminderOffset(offsets: number[], hours: number): number[] {
  const without = offsets.filter((value) => value !== hours);
  if (without.length !== offsets.length) return without; // it was present -> removed
  return [...without, hours].sort((a, b) => a - b);
}
