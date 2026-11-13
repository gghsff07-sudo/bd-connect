/**
 * Theme-aware button with a minimum 44pt touch target.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../theme/theme';
import type { Theme } from '../theme/tokens';

export interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  style,
}: AppButtonProps) {
  const theme: Theme = useTheme();
  const c = theme.colors;

  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const bg = isPrimary ? c.primary : isDanger ? c.dangerSoft : c.surfaceAlt;
  const fg = isPrimary ? c.onPrimary : isDanger ? c.dangerOnSoft : c.textSecondary;
  const border = isPrimary ? 'transparent' : c.border;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: border,
          borderRadius: theme.radii.md,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={17}
              color={fg}
              importantForAccessibility="no"
              accessibilityElements={[]}
            />
          ) : null}
          <Text
            style={{
              color: fg,
              fontSize: theme.type.body.fontSize,
              fontWeight: '600',
            }}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
});
