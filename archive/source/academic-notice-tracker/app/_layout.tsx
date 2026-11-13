/**
 * Root layout: theme, auth gate, data sync + notification lifecycle, and
 * the global overlay banners (offline, in-app push, permission nudge).
 *
 * Importing services/notifications registers the module-scope background
 * handlers required by FCM and notifee.
 */
// The named import below loads the module early enough to register the
// module-scope background handlers required by FCM and notifee.
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { ThemeProvider, useTheme } from '../src/theme/theme';
import type { Theme } from '../src/theme/tokens';
import { useAuthStore } from '../src/store/auth';
import { useDataStore } from '../src/store/data';
import { useUiStore } from '../src/store/ui';
import { startDataSync } from '../src/services/dataSync';
import {
  initNotificationHandling,
  markPermissionNudgeShown,
  openNotice,
  refreshPermissionStatus,
  requestNotificationPermission,
  refreshTokenRegistration,
  shouldShowPermissionNudge,
} from '../src/services/notifications';
import { InlineBanner } from '../src/components/InlineBanner';
import { AppButton } from '../src/components/AppButton';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const theme: Theme = useTheme();
  const status = useAuthStore((state) => state.status);
  const uid = useAuthStore((state) => state.user?.uid);

  // Attach the single auth listener for the whole app.
  useEffect(() => {
    useAuthStore.getState().init();
  }, []);

  // Data + notifications live only while the owner is signed in.
  useEffect(() => {
    if (status === 'allowed' && uid) {
      const stopSync = startDataSync(uid);
      const stopNotifications = initNotificationHandling(uid);
      return () => {
        stopSync();
        stopNotifications();
      };
    }
    return undefined;
  }, [status, uid]);

  // Drop cached data when the session ends (sign out / not allowed).
  useEffect(() => {
    if (status === 'signedOut' || status === 'denied') {
      useDataStore.getState().reset();
    }
  }, [status]);

  // One-time notification permission nudge right after the first sign-in.
  useEffect(() => {
    if (status !== 'allowed' || !uid) return;
    let cancelled = false;
    void (async () => {
      await refreshPermissionStatus();
      if (cancelled) return;
      if (useUiStore.getState().notifPermission === 'granted') return;
      if (await shouldShowPermissionNudge()) {
        if (cancelled) return;
        useUiStore.getState().setShowPermissionNudge(true);
        await markPermissionNudgeShown();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, uid]);

  if (status === 'loading' || status === 'verifying') {
    return (
      <View style={[styles.fill, { backgroundColor: theme.colors.bg }]}>
        <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: theme.type.body.fontSize,
              marginTop: theme.spacing.md,
            }}>
            {status === 'verifying' ? 'Checking access…' : 'Starting up…'}
          </Text>
        </View>
      </View>
    );
  }

  const allowed = status === 'allowed';

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.bg }]}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.bg },
        }}>
        {allowed ? (
          <>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="notice/[id]" />
          </>
        ) : (
          <Stack.Screen name="sign-in" />
        )}
      </Stack>
      <OverlayBanners uid={uid} />
    </View>
  );
}

/** Offline banner, foreground push banner and permission nudge. */
function OverlayBanners({ uid }: { uid: string | undefined }) {
  const theme: Theme = useTheme();
  const insets = useSafeAreaInsets();
  const net = useNetInfo();
  const banner = useUiStore((state) => state.banner);
  const dismissBanner = useUiStore((state) => state.dismissBanner);
  const showNudge = useUiStore((state) => state.showPermissionNudge);

  // Auto-dismiss the in-app push banner after a few seconds.
  useEffect(() => {
    if (!banner) return undefined;
    const timer = setTimeout(() => dismissBanner(), 6000);
    return () => clearTimeout(timer);
  }, [banner, dismissBanner]);

  const offline = net.isConnected === false;
  if (!offline && !banner && !showNudge) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.overlay,
        { top: insets.top + 8, gap: theme.spacing.sm },
      ]}>
      {offline ? (
        <InlineBanner
          variant="neutral"
          title="Offline"
          message="Showing cached notices. Changes sync when you're back online."
        />
      ) : null}
      {showNudge ? <PermissionNudge uid={uid} /> : null}
      {banner ? (
        <InlineBanner
          variant="info"
          icon="notifications"
          title={banner.title}
          message={banner.body}
          onPress={() => {
            dismissBanner();
            openNotice(banner.noticeId);
          }}
        />
      ) : null}
    </View>
  );
}

function PermissionNudge({ uid }: { uid: string | undefined }) {
  const theme: Theme = useTheme();

  const enable = async () => {
    const result = await requestNotificationPermission();
    useUiStore.getState().setNotifPermission(result);
    if (result === 'granted' && uid) {
      try {
        await refreshTokenRegistration(uid);
      } catch {
        // Token registration retries on next app start.
      }
    }
    useUiStore.getState().setShowPermissionNudge(false);
  };

  const notNow = () => {
    useUiStore.getState().setShowPermissionNudge(false);
  };

  return (
    <View
      style={[
        styles.nudge,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.lg,
        },
      ]}>
      <Text
        style={{
          color: theme.colors.text,
          fontSize: theme.type.heading.fontSize,
          fontWeight: '600',
        }}>
        Turn on notifications
      </Text>
      <Text
        style={{
          color: theme.colors.textSecondary,
          fontSize: theme.type.body.fontSize,
          marginTop: 4,
        }}>
        Get a nudge before registration and submission deadlines close.
      </Text>
      <View style={[styles.nudgeActions, { marginTop: theme.spacing.md, gap: theme.spacing.sm }]}>
        <AppButton label="Enable" onPress={() => void enable()} style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Not now"
          onPress={notNow}
          style={({ pressed }) => [
            styles.notNow,
            { borderColor: theme.colors.border, borderRadius: theme.radii.md, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: theme.type.body.fontSize,
              fontWeight: '600',
            }}>
            Not now
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  overlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 10,
  },
  nudge: {
    borderWidth: StyleSheet.hairlineWidth,
    // Shadow for separation over content.
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  nudgeActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notNow: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
