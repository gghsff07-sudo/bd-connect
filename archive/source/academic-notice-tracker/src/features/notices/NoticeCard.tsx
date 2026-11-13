/**
 * Home/Done list card for a notice. Memoized; parent supplies a stable
 * onPress callback.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../theme/theme';
import type { Theme } from '../../theme/tokens';
import { formatDeadlineLine, formatLastSynced } from '../../utils/date';
import {
  NOTICE_TYPE_LABELS,
  type Notice,
  type NoticeUserState,
} from '../../utils/types';
import { StatusBadge } from './StatusBadge';
import { TypeChip } from './TypeChip';

export interface NoticeCardProps {
  notice: Notice;
  state?: NoticeUserState;
  onPress: (noticeId: string) => void;
  /** Hide the pin marker (e.g. on the Done tab). */
  hidePin?: boolean;
}

export const NoticeCard = React.memo(function NoticeCard({
  notice,
  state,
  onPress,
  hidePin = false,
}: NoticeCardProps) {
  const theme: Theme = useTheme();
  const deadlineLine = formatDeadlineLine(notice.deadline);
  const pinned = state?.pinned === true && !hidePin;

  const deadlineTone = deadlineToneFor(notice);
  const deadlineColor =
    deadlineTone === 'danger'
      ? theme.colors.danger
      : deadlineTone === 'warning'
        ? theme.colors.warningText
        : theme.colors.textSecondary;
  const deadlineIcon =
    deadlineTone === 'none' ? 'alarm-outline' : deadlineTone === 'warning' ? 'alarm' : 'warning';

  const accessibilityLabel = [
    notice.title,
    NOTICE_TYPE_LABELS[notice.type],
    `Status: ${notice.status}`,
    notice.deadline ? `Deadline ${deadlineLine}` : 'No deadline',
    notice.needsVerify ? 'Needs verification' : null,
    pinned ? 'Pinned' : null,
    `From ${notice.source}`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => onPress(notice.id)}
      android_ripple={{ color: theme.colors.pressOverlay, borderless: false }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.lg,
          opacity: pressed ? 0.9 : 1,
        },
      ]}>
      <View style={styles.topRow}>
        <View style={styles.chips}>
          <TypeChip type={notice.type} />
          <StatusBadge status={notice.status} />
          {notice.needsVerify ? (
            <View
              style={[
                styles.verify,
                {
                  backgroundColor: theme.colors.warningBg,
                  borderColor: theme.colors.warningBorder,
                  paddingHorizontal: theme.spacing.sm,
                },
              ]}
              accessibilityLabel="Needs verification">
              <Ionicons
                name="help-circle-outline"
                size={12}
                color={theme.colors.warningText}
                importantForAccessibility="no"
                accessibilityElements={[]}
              />
              <Text
                style={{
                  color: theme.colors.warningText,
                  fontSize: theme.type.caption.fontSize,
                  fontWeight: '600',
                }}>
                Verify
              </Text>
            </View>
          ) : null}
        </View>
        {pinned ? (
          <Ionicons
            name="pin"
            size={16}
            color={theme.colors.primary}
            accessibilityLabel="Pinned"
          />
        ) : null}
      </View>

      <Text
        numberOfLines={2}
        style={{
          color: theme.colors.text,
          fontSize: theme.type.heading.fontSize,
          lineHeight: theme.type.heading.lineHeight,
          fontWeight: '600',
          marginTop: theme.spacing.sm,
        }}>
        {notice.title}
      </Text>

      <View style={[styles.metaRow, { marginTop: theme.spacing.sm }]}>
        <Ionicons
          name={deadlineIcon}
          size={14}
          color={deadlineColor}
          importantForAccessibility="no"
          accessibilityElements={[]}
        />
        <Text
          style={{
            color: deadlineColor,
            fontSize: theme.type.body.fontSize,
            fontWeight: deadlineTone === 'none' ? '400' : '600',
          }}>
          {deadlineLine}
        </Text>
      </View>

      <Text
        numberOfLines={1}
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.type.caption.fontSize,
          marginTop: theme.spacing.xs,
        }}>
        {notice.source}
        {notice.updatedAt ? ` · updated ${formatLastSynced(notice.updatedAt)}` : ''}
      </Text>
    </Pressable>
  );
});

function deadlineToneFor(notice: Notice): 'none' | 'warning' | 'danger' {
  if (!notice.deadline) return 'none';
  const msLeft = notice.deadline.getTime() - Date.now();
  if (msLeft < 0) return 'danger';
  if (msLeft <= 24 * 60 * 60 * 1000) return 'warning';
  return 'none';
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    flexShrink: 1,
  },
  verify: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
