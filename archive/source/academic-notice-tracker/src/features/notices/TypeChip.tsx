/**
 * Notice type chip (Exam registration, Submission, …).
 */
import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../theme/theme';
import type { Theme } from '../../theme/tokens';
import { NOTICE_TYPE_LABELS, type NoticeType } from '../../utils/types';

const ICONS: Record<NoticeType, keyof typeof Ionicons.glyphMap> = {
  exam_registration: 'clipboard-outline',
  semester_registration: 'school-outline',
  submission: 'cloud-upload-outline',
  result: 'stats-chart-outline',
  other: 'documents-outline',
};

export interface TypeChipProps {
  type: NoticeType;
  style?: ViewStyle;
}

export const TypeChip = React.memo(function TypeChip({ type, style }: TypeChipProps) {
  const theme: Theme = useTheme();
  const label = NOTICE_TYPE_LABELS[type];

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: theme.colors.surfaceAlt,
          paddingVertical: 2,
          paddingHorizontal: theme.spacing.sm,
        },
        style,
      ]}
      accessibilityLabel={`Type: ${label}`}>
      <Ionicons
        name={ICONS[type]}
        size={12}
        color={theme.colors.textSecondary}
        importantForAccessibility="no"
        accessibilityElements={[]}
      />
      <Text
        style={{
          color: theme.colors.textSecondary,
          fontSize: theme.type.caption.fontSize,
          fontWeight: '500',
        }}>
        {label}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
  },
});
