/**
 * UI-only state (Zustand). Notice data lives in store/data.ts and is fed
 * exclusively by Firestore live listeners.
 */
import { create } from 'zustand';

export type HomeTabId = 'open' | 'closing' | 'closed';

export type NotificationPermissionStatus =
  | 'granted'
  | 'denied'
  | 'blocked'
  | 'notDetermined'
  | 'unknown';

export interface InAppBanner {
  key: number;
  title: string;
  body: string;
  noticeId: string | null;
}

interface UiState {
  /** Home segmented control selection; persists across visits, not restarts. */
  homeTab: HomeTabId;
  searchQuery: string;
  /** Foreground push message banner (shown by the root layout host). */
  banner: InAppBanner | null;
  /** Whether the "enable notifications" nudge should be shown. */
  showPermissionNudge: boolean;
  notifPermission: NotificationPermissionStatus;
  setHomeTab: (tab: HomeTabId) => void;
  setSearchQuery: (query: string) => void;
  showBanner: (banner: Omit<InAppBanner, 'key'>) => void;
  dismissBanner: () => void;
  setShowPermissionNudge: (show: boolean) => void;
  setNotifPermission: (status: NotificationPermissionStatus) => void;
}

let bannerKey = 0;

export const useUiStore = create<UiState>((set) => ({
  homeTab: 'open',
  searchQuery: '',
  banner: null,
  showPermissionNudge: false,
  notifPermission: 'unknown',
  setHomeTab: (tab) => set({ homeTab: tab }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  showBanner: (banner) => set({ banner: { ...banner, key: ++bannerKey } }),
  dismissBanner: () => set({ banner: null }),
  setShowPermissionNudge: (show) => set({ showPermissionNudge: show }),
  setNotifPermission: (status) => set({ notifPermission: status }),
}));
