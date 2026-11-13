/**
 * Settings row with a label, optional description and a Switch.
 */
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '../theme/theme';
import type { Theme } from '../theme/tokens';

export interface SwitchRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function SwitchRow({ label, description, value, onValueChange }: SwitchRowProps) {
  const theme: Theme = useTheme();
  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.md,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
        },
      ]}>
      <View style={styles.text}>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: theme.type.body.fontSize,
            fontWeight: '500',
          }}>
          {label}
        </Text>
        {description ? (
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.type.caption.fontSize,
              marginTop: 2,
            }}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: theme.colors.primary, false: theme.colors.surfaceAlt }}
        thumbColor={value ? theme.colors.onPrimary : theme.colors.textMuted}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
  },
});
