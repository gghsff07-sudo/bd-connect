/**
 * Friendly per-tab empty state.
 */
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../theme/theme';
import type { Theme } from '../../theme/tokens';

export interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
}

export function EmptyState({ icon, title, message }: EmptyStateProps) {
  const theme: Theme = useTheme();
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={40} color={theme.colors.textMuted} accessibilityElements={[]} importantForAccessibility="no" />
      <Text
        style={{
          color: theme.colors.text,
          fontSize: theme.type.heading.fontSize,
          fontWeight: '600',
          textAlign: 'center',
          marginTop: theme.spacing.md,
        }}>
        {title}
      </Text>
      <Text
        style={{
          color: theme.colors.textSecondary,
          fontSize: theme.type.body.fontSize,
          textAlign: 'center',
          marginTop: theme.spacing.xs,
        }}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    gap: 4,
  },
});
