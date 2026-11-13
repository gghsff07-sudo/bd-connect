/**
 * Accessible segmented control for the three Home tabs.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/theme';
import type { Theme } from '../theme/tokens';

export interface SegmentedControlOption<K extends string> {
  value: K;
  label: string;
}

export interface SegmentedControlProps<K extends string> {
  options: SegmentedControlOption<K>[];
  value: K;
  onChange: (value: K) => void;
}

export function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<K>) {
  const theme: Theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.track,
        {
          backgroundColor: theme.colors.surfaceAlt,
          borderRadius: theme.radii.md,
          padding: 3,
        },
      ]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              {
                borderRadius: theme.radii.sm,
                backgroundColor: selected ? theme.colors.surface : 'transparent',
                minHeight: 36,
              },
            ]}>
            <Text
              numberOfLines={1}
              style={{
                color: selected ? theme.colors.primaryOnSoft : theme.colors.textSecondary,
                fontSize: theme.type.label.fontSize,
                fontWeight: selected ? '600' : '500',
                paddingHorizontal: theme.spacing.sm,
              }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
