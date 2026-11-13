/**
 * Sign-in screen. Exactly one button; signed-out or denied users see only
 * this screen. Denied shows "This account isn't allowed" + sign-out.
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/theme/theme';
import type { Theme } from '../src/theme/tokens';
import { useAuthStore } from '../src/store/auth';
import { AppButton } from '../src/components/AppButton';
import { InlineBanner } from '../src/components/InlineBanner';

export default function SignInScreen() {
  const theme: Theme = useTheme();
  const insets = useSafeAreaInsets();
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.error);
  const user = useAuthStore((state) => state.user);
  const signIn = useAuthStore((state) => state.signIn);
  const signOut = useAuthStore((state) => state.signOut);
  const retryVerify = useAuthStore((state) => state.retryVerify);

  const denied = status === 'denied';
  const errorState = status === 'error';
  const busy = status === 'verifying' || status === 'loading';

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 64,
            paddingBottom: insets.bottom + 32,
            paddingHorizontal: theme.spacing.xl,
          },
        ]}>
        <View
          style={[
            styles.logo,
            {
              backgroundColor: theme.colors.primary,
              borderRadius: theme.radii.xl,
            },
          ]}
          accessibilityLabel="Notice Tracker logo">
          <Ionicons name="notifications" size={34} color={theme.colors.onPrimary} accessibilityElements={[]} importantForAccessibility="no" />
        </View>

        <Text
          style={{
            color: theme.colors.text,
            fontSize: theme.type.display.fontSize,
            lineHeight: theme.type.display.lineHeight,
            fontWeight: '700',
            textAlign: 'center',
            marginTop: theme.spacing.lg,
          }}>
          Notice Tracker
        </Text>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: theme.type.body.fontSize,
            textAlign: 'center',
            marginTop: theme.spacing.sm,
          }}>
          University notices and deadlines, tracked for you.
        </Text>

        <View style={{ marginTop: 48, width: '100%', gap: theme.spacing.md }}>
          {denied ? (
            <>
              <InlineBanner
                variant="error"
                title="This account isn't allowed"
                message={
                  user?.email
                    ? `Signed in as ${user.email}. Only the owner account can use this app.`
                    : 'Only the owner account can use this app.'
                }
              />
              <AppButton label="Sign out" variant="secondary" icon="log-out-outline" onPress={() => void signOut()} />
            </>
          ) : errorState ? (
            <>
              <InlineBanner
                variant="warning"
                title="Couldn't finish signing in"
                message={error ?? 'Check your connection and try again.'}
              />
              <AppButton label="Try again" icon="refresh-outline" onPress={() => void retryVerify()} />
              <AppButton
                label="Sign out"
                variant="secondary"
                onPress={() => void signOut()}
              />
            </>
          ) : (
            <>
              {status === 'signedOut' && error ? (
                <InlineBanner
                  variant="error"
                  title="Sign-in didn't complete"
                  message={error}
                />
              ) : null}
              <AppButton
                label="Sign in with Google"
                icon="logo-google"
                loading={busy}
                disabled={busy}
                onPress={() => void signIn()}
              />
            </>
          )}

          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.type.caption.fontSize,
              textAlign: 'center',
              marginTop: theme.spacing.md,
            }}>
            Your university credentials are never used in this app. It only reads
            notices from your own private tracker database.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
