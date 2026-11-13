/**
 * Status badge: icon + text + color together (never color alone).
 */
import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../theme/theme';
import type { Palette, Theme } from '../../theme/tokens';
import { NOTICE_STATUS_LABELS, type NoticeStatus } from '../../utils/types';

const ICONS: Record<NoticeStatus, keyof typeof Ionicons.glyphMap> = {
  open: 'lock-open-outline',
  closing: 'hourglass-outline',
  closed: 'lock-closed-outline',
  extended: 'refresh-outline',
  postponed: 'calendar-clear-outline',
  info: 'information-circle-outline',
};

function statusColors(colors: Palette, status: NoticeStatus) {
  switch (status) {
    case 'open':
      return colors.statusOpen;
    case 'closing':
      return colors.statusClosing;
    case 'closed':
      return colors.statusClosed;
    case 'extended':
      return colors.statusExtended;
    case 'postponed':
      return colors.statusPostponed;
    case 'info':
      return colors.statusInfo;
  }
}

export interface StatusBadgeProps {
  status: NoticeStatus;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export const StatusBadge = React.memo(function StatusBadge({
  status,
  size = 'sm',
  style,
}: StatusBadgeProps) {
  const theme: Theme = useTheme();
  const colors = statusColors(theme.colors, status);
  const iconSize = size === 'md' ? 18 : 13;
  const fontSize = size === 'md' ? theme.type.label.fontSize : theme.type.caption.fontSize;
  const label = NOTICE_STATUS_LABELS[status];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          paddingVertical: size === 'md' ? theme.spacing.sm : 2,
          paddingHorizontal: size === 'md' ? theme.spacing.md : theme.spacing.sm,
        },
        style,
      ]}
      accessibilityLabel={`Status: ${label}`}>
      <Ionicons
        name={ICONS[status]}
        size={iconSize}
        color={colors.text}
        importantForAccessibility="no"
        accessibilityElements={[]}
      />
      <Text
        style={{
          color: colors.text,
          fontSize,
          fontWeight: '600',
        }}>
        {label}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
