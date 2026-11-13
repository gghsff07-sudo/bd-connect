/**
 * Push notifications: FCM token registration, Android channels, foreground
 * display and deep linking into notice/{id} from every app state.
 *
 * Coverage matrix (tap on a notification):
 *  - App foreground, notifee-displayed  -> notifee.onForegroundEvent
 *  - App background, notifee-displayed  -> onBackgroundEvent stores a pending
 *                                          id; the AppState listener flushes
 *                                          it when the app comes forward
 *  - App background/killed, tray-shown  -> onNotificationOpenedApp /
 *                                          getInitialNotification (FCM)
 *  - Cold start, notifee-displayed      -> notifee.getInitialNotification
 *
 * The backend sends messages with a `notification` payload plus
 * `data: { kind, noticeId }`. On Android the system tray auto-displays
 * notification payloads while the app is backgrounded/killed — the backend
 * should set `android.channel_id` to `notices` or `reminders` in its FCM
 * requests so those use the right channel. Data-only messages (if the
 * backend ever sends them) are displayed here via the background handler.
 */
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getInitialNotification,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  setBackgroundMessageHandler,
  getToken,
  type RemoteMessage,
} from '@react-native-firebase/messaging';
import {
  AndroidImportance,
  AuthorizationStatus,
  EventType,
  type Event as NotifeeEvent,
} from '@notifee/react-native';
import notifee from '@notifee/react-native';
import { router } from 'expo-router';
import { useUiStore, type NotificationPermissionStatus } from '../store/ui';
import { logger } from '../utils/logger';
import { registerDeviceToken } from './dataSync';
import { messaging } from './firebase';

export const CHANNEL_NOTICES = 'notices';
export const CHANNEL_REMINDERS = 'reminders';

const PENDING_NAV_KEY = 'notifications.pendingNoticeId';
const NUDGE_SHOWN_KEY = 'notifications.nudgeShown';

// --------------------------------------------------------------------------
// Module-scope background handlers (required by FCM/notifee to be registered
// at import time, outside any component).
// --------------------------------------------------------------------------

/** Display data-only pushes received while the app is backgrounded/killed. */
setBackgroundMessageHandler(messaging(), async (remoteMessage) => {
  logger.info('Background FCM message', remoteMessage.data);
  try {
    await createChannels();
    await displayNotification(remoteMessage);
  } catch (error) {
    logger.error('Failed to display background notification', error);
  }
});

/** Notifee events while the app is backgrounded (headless context). */
notifee.onBackgroundEvent(async ({ type, detail }: NotifeeEvent) => {
  if (type !== EventType.PRESS) return;
  const noticeId = noticeIdFromData(detail.notification?.data);
  if (noticeId) {
    // We cannot navigate from a headless context; stash the target and let
    // the AppState listener in the UI pick it up once the app foregrounds.
    try {
      await AsyncStorage.setItem(PENDING_NAV_KEY, noticeId);
    } catch (error) {
      logger.warn('Could not store pending navigation', error);
    }
  }
});

// --------------------------------------------------------------------------
// Channels, permissions, tokens
// --------------------------------------------------------------------------

/** Two high-importance channels per the push contract. */
export async function createChannels(): Promise<void> {
  await notifee.createChannels([
    {
      id: CHANNEL_NOTICES,
      name: 'Notices',
      importance: AndroidImportance.HIGH,
      description: 'New notices, status changes and deadline changes',
    },
    {
      id: CHANNEL_REMINDERS,
      name: 'Reminders',
      importance: AndroidImportance.HIGH,
      description: 'Deadline reminders',
    },
  ]);
}

function mapAuthorizationStatus(status: AuthorizationStatus): NotificationPermissionStatus {
  switch (status) {
    case AuthorizationStatus.AUTHORIZED:
    case AuthorizationStatus.PROVISIONAL:
      return 'granted';
    case AuthorizationStatus.DENIED:
      // On Android a denial is final: the fix is system settings.
      return 'blocked';
    default:
      return 'notDetermined';
  }
}

export async function getNotificationPermission(): Promise<NotificationPermissionStatus> {
  const settings = await notifee.getNotificationSettings();
  return mapAuthorizationStatus(settings.authorizationStatus);
}

export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  const settings = await notifee.requestPermission();
  return mapAuthorizationStatus(settings.authorizationStatus);
}

export async function openNotificationSettings(): Promise<void> {
  await notifee.openNotificationSettings();
}

/** Whether the "enable notifications" nudge has already been shown once. */
export async function shouldShowPermissionNudge(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(NUDGE_SHOWN_KEY)) === null;
  } catch {
    return false;
  }
}

export async function markPermissionNudgeShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(NUDGE_SHOWN_KEY, '1');
  } catch (error) {
    logger.warn('Could not persist nudge flag', error);
  }
}

/** Refresh the cached permission status in the UI store (safe anywhere). */
export async function refreshPermissionStatus(): Promise<void> {
  try {
    const status = await getNotificationPermission();
    useUiStore.getState().setNotifPermission(status);
  } catch (error) {
    logger.warn('Could not read notification permission', error);
  }
}

/** (Re-)register the FCM token for this device. Safe to call repeatedly. */
export async function refreshTokenRegistration(uid: string): Promise<void> {
  const token = await getToken(messaging());
  await registerDeviceToken(uid, token);
}

// --------------------------------------------------------------------------
// Display + navigation
// --------------------------------------------------------------------------

function noticeIdFromData(data?: Record<string, unknown> | null): string | null {
  const id = data?.noticeId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function kindToChannelId(kind: unknown): string {
  return kind === 'reminder' ? CHANNEL_REMINDERS : CHANNEL_NOTICES;
}

function titleFor(remoteMessage: RemoteMessage): string {
  return remoteMessage.notification?.title ?? 'Notice';
}

function bodyFor(remoteMessage: RemoteMessage): string {
  return remoteMessage.notification?.body ?? '';
}

async function displayNotification(remoteMessage: RemoteMessage): Promise<string | undefined> {
  const noticeId = noticeIdFromData(remoteMessage.data);
  return notifee.displayNotification({
    // Reuse the notice id so a newer push replaces the older tray entry.
    ...(noticeId ? { id: noticeId } : {}),
    title: titleFor(remoteMessage),
    body: bodyFor(remoteMessage),
    data: { ...(remoteMessage.data ?? {}) },
    android: {
      channelId: kindToChannelId(remoteMessage.data?.kind),
      smallIcon: 'ic_launcher',
      pressAction: { id: 'default', launchActivity: 'default' },
    },
  });
}

let lastNavNoticeId: string | null = null;
let lastNavAt = 0;

/**
 * Navigate to a notice from any event source; duplicates within a short
 * window are ignored (several handlers can fire for the same tap).
 */
export function openNotice(noticeId: string | null | undefined): void {
  if (!noticeId) return;
  const now = Date.now();
  if (noticeId === lastNavNoticeId && now - lastNavAt < 2500) return;
  lastNavNoticeId = noticeId;
  lastNavAt = now;
  logger.info('Deep linking to notice', noticeId);
  router.push(`/notice/${noticeId}`);
}

/** Flush a navigation stashed by the background event handler. */
export function listenForPendingNavigation(): () => void {
  const subscription = AppState.addEventListener('change', async (state) => {
    if (state !== 'active') return;
    try {
      const pending = await AsyncStorage.getItem(PENDING_NAV_KEY);
      if (pending) {
        await AsyncStorage.removeItem(PENDING_NAV_KEY);
        openNotice(pending);
      }
    } catch (error) {
      logger.warn('Could not flush pending navigation', error);
    }
  });
  return () => subscription.remove();
}

// Wrapper so the flush listener can be tracked like the other unsubs.
function listenForPendingNavigationSafe(): () => void {
  try {
    return listenForPendingNavigation();
  } catch (error) {
    logger.warn('Could not attach pending-navigation listener', error);
    return () => undefined;
  }
}

/**
 * Wire up everything that should run while the owner is signed in.
 * Returns a cleanup function for the root layout.
 */
export function initNotificationHandling(uid: string): () => void {
  const unsubs: (() => void)[] = [];
  let disposed = false;

  const track = (unsub: () => void) => {
    if (disposed) {
      try {
        unsub();
      } catch {
        /* ignore */
      }
    } else {
      unsubs.push(unsub);
    }
  };

  // Foreground message: in-app banner + notifee notification (spec section 6).
  track(
    onMessage(messaging(), async (remoteMessage) => {
      logger.info('Foreground FCM message', remoteMessage.data);
      useUiStore.getState().showBanner({
        title: titleFor(remoteMessage),
        body: bodyFor(remoteMessage),
        noticeId: noticeIdFromData(remoteMessage.data),
      });
      try {
        await createChannels();
        await displayNotification(remoteMessage);
      } catch (error) {
        logger.error('Failed to display foreground notification', error);
      }
    }),
  );

  // Tap on a tray-shown notification while the app is backgrounded.
  track(
    onNotificationOpenedApp(messaging(), (remoteMessage) => {
      openNotice(noticeIdFromData(remoteMessage.data));
    }),
  );

  // Tap on a notifee-displayed notification while the app is foregrounded.
  track(
    notifee.onForegroundEvent(({ type, detail }: NotifeeEvent) => {
      if (type === EventType.PRESS) {
        openNotice(noticeIdFromData(detail.notification?.data));
      }
    }),
  );

  // Cold start: the notification tap that launched the app.
  void (async () => {
    try {
      const fcmInitial = await getInitialNotification(messaging());
      const fromFcm = noticeIdFromData(fcmInitial?.data);
      if (fromFcm) {
        openNotice(fromFcm);
        return;
      }
      const notifeeInitial = await notifee.getInitialNotification();
      openNotice(noticeIdFromData(notifeeInitial?.notification?.data));
    } catch (error) {
      logger.warn('Could not read initial notification', error);
    }
  })();

  // Token registration + refresh.
  void (async () => {
    try {
      await createChannels();
      const token = await getToken(messaging());
      if (disposed) return;
      await registerDeviceToken(uid, token);
      track(
        onTokenRefresh(messaging(), async (newToken) => {
          try {
            await registerDeviceToken(uid, newToken, token);
          } catch (error) {
            logger.error('Token refresh registration failed', error);
          }
        }),
      );
    } catch (error) {
      logger.error('FCM token registration failed', error);
    }
  })();

  // Background-tap navigation flush.
  track(listenForPendingNavigationSafe());

  return () => {
    disposed = true;
    unsubs.forEach((unsub) => {
      try {
        unsub();
      } catch {
        /* ignore */
      }
    });
  };
}
