/**
 * Inline banner used for offline, stale-sync, source errors, the push
 * in-app banner and the permission nudge.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../theme/theme';
import type { Theme } from '../theme/tokens';

export type BannerVariant = 'warning' | 'error' | 'info' | 'neutral';

export interface InlineBannerProps {
  variant: BannerVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  onPress?: () => void;
  /** Renders as a compact single-line row (used inside headers). */
  compact?: boolean;
}

export function InlineBanner({
  variant,
  icon,
  title,
  message,
  actionLabel,
  onAction,
  onPress,
  compact = false,
}: InlineBannerProps) {
  const theme: Theme = useTheme();
  const c = theme.colors;

  const tone =
    variant === 'warning'
      ? { bg: c.warningBg, border: c.warningBorder, text: c.warningText }
      : variant === 'error'
        ? { bg: c.dangerSoft, border: c.dangerOnSoft, text: c.dangerOnSoft }
        : variant === 'info'
          ? { bg: c.statusInfo.bg, border: c.statusInfo.border, text: c.statusInfo.text }
          : { bg: c.neutralBg, border: c.neutralBorder, text: c.textSecondary };

  const resolvedIcon = icon ?? (variant === 'warning'
    ? 'warning-outline'
    : variant === 'error'
      ? 'alert-circle-outline'
      : variant === 'info'
        ? 'information-circle-outline'
        : 'cloud-offline-outline');

  const inner = (
    <View
      style={[
        styles.row,
        {
          backgroundColor: tone.bg,
          borderColor: tone.border,
          borderRadius: theme.radii.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: compact ? theme.spacing.sm : theme.spacing.md,
        },
      ]}>
      <Ionicons
        name={resolvedIcon}
        size={18}
        color={tone.text}
        importantForAccessibility="no"
        accessibilityElements={[]}
      />
      <View style={styles.text}>
        <Text
          style={{
            color: tone.text,
            fontSize: theme.type.label.fontSize,
            fontWeight: '600',
          }}>
          {title}
        </Text>
        {message ? (
          <Text
            style={{
              color: tone.text,
              fontSize: theme.type.caption.fontSize,
              marginTop: 2,
            }}>
            {message}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          hitSlop={8}
          style={({ pressed }) => [
            styles.action,
            { borderColor: tone.border, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text
            style={{
              color: tone.text,
              fontSize: theme.type.label.fontSize,
              fontWeight: '600',
            }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}${message ? `. ${message}` : ''}`}
        onPress={onPress}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
  },
  action: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
