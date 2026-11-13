/**
 * Loading placeholder: a pulsing card skeleton shown while the first
 * snapshot loads.
 */
import { useEffect } from 'react';
import { Animated, StyleSheet, View, useAnimatedValue } from 'react-native';
import { useTheme } from '../../theme/theme';
import type { Theme } from '../../theme/tokens';

export function SkeletonCard() {
  const theme: Theme = useTheme();
  const pulse = useAnimatedValue(0.4);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.lg,
        },
      ]}
      accessibilityLabel="Loading notice">
      <View style={styles.row}>
        <Animated.View
          style={[styles.pill, { backgroundColor: theme.colors.skeleton, opacity: pulse }, styles.w90]}
        />
        <Animated.View
          style={[styles.pill, { backgroundColor: theme.colors.skeleton, opacity: pulse }, styles.w64]}
        />
      </View>
      <Animated.View
        style={[
          styles.line,
          { backgroundColor: theme.colors.skeleton, opacity: pulse },
          styles.full,
          { height: 18 },
        ]}
      />
      <Animated.View
        style={[
          styles.line,
          { backgroundColor: theme.colors.skeleton, opacity: pulse },
          styles.w60,
          { height: 14 },
        ]}
      />
      <Animated.View
        style={[
          styles.line,
          { backgroundColor: theme.colors.skeleton, opacity: pulse },
          styles.w40,
          { height: 12 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    height: 22,
    borderRadius: 999,
  },
  line: {
    borderRadius: 6,
  },
  full: {
    alignSelf: 'stretch',
  },
  w90: { width: 90 },
  w64: { width: 64 },
  w60: { width: '60%' },
  w40: { width: '40%' },
});
