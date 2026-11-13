/**
 * Notice detail: full fields, verification banner, and the state actions
 * (open original, done/undo, snooze, pin, add to calendar).
 */
import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/theme';
import type { Theme } from '../../src/theme/tokens';
import { useAuthStore } from '../../src/store/auth';
import { useDataStore } from '../../src/store/data';
import { useNotice } from '../../src/features/notices/hooks';
import { StatusBadge } from '../../src/features/notices/StatusBadge';
import { TypeChip } from '../../src/features/notices/TypeChip';
import { EmptyState } from '../../src/features/notices/EmptyState';
import { SkeletonCard } from '../../src/features/notices/SkeletonCard';
import { InlineBanner } from '../../src/components/InlineBanner';
import { AppButton } from '../../src/components/AppButton';
import { setNoticeDone, setNoticePinned, setNoticeSnoozed } from '../../src/services/dataSync';
import { addNoticeToCalendar } from '../../src/services/calendar';
import {
  addDays,
  formatDeadlineRelative,
  formatDeadlineDate,
  formatTimestamp,
} from '../../src/utils/date';
import { confidenceLabel, type Notice } from '../../src/utils/types';
import { logger } from '../../src/utils/logger';

export default function NoticeDetailScreen() {
  const theme: Theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : undefined;

  const uid = useAuthStore((state) => state.user?.uid);
  const dataStatus = useDataStore((state) => state.status);
  const { notice, state } = useNotice(id);

  const [rawOpen, setRawOpen] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null);

  if (!notice && dataStatus === 'loading') {
    return (
      <DetailShell theme={theme} insets={insets}>
        <SkeletonCard />
      </DetailShell>
    );
  }

  if (!notice) {
    return (
      <DetailShell theme={theme} insets={insets}>
        <EmptyState
          icon="search-outline"
          title="Notice not found"
          message="It may have been removed on the server, or the link is out of date."
        />
        <AppButton label="Back" variant="secondary" onPress={() => router.back()} />
      </DetailShell>
    );
  }

  const done = state?.done === true;
  const pinned = state?.pinned === true;
  const snoozedUntil = state?.snoozedUntil ?? null;

  const write = (fn: (uid: string) => Promise<void>) => {
    if (uid) void fn(uid);
  };

  const onAddToCalendar = async () => {
    const result = await addNoticeToCalendar(notice);
    if (result === 'added') setCalendarMessage('Added to your calendar.');
    else if (result === 'denied') setCalendarMessage('Calendar permission was denied.');
    else if (result === 'no-deadline') setCalendarMessage('This notice has no parsed deadline.');
    else if (result === 'no-calendar') setCalendarMessage('No writable calendar found on this device.');
    else setCalendarMessage('Could not add to the calendar.');
  };

  const onCustomSnooze = () => {
    const base = snoozedUntil ?? new Date();
    DateTimePickerAndroid.open({
      mode: 'date',
      value: base,
      onChange: (_event, pickedDate) => {
        if (!pickedDate || !uid) return;
        DateTimePickerAndroid.open({
          mode: 'time',
          value: base,
          onChange: (_event, pickedTime) => {
            if (!pickedTime) return;
            const combined = new Date(
              pickedDate.getFullYear(),
              pickedDate.getMonth(),
              pickedDate.getDate(),
              pickedTime.getHours(),
              pickedTime.getMinutes(),
            );
            write((u) => setNoticeSnoozed(u, notice.id, combined));
          },
        });
      },
    });
  };

  const relative = formatDeadlineRelative(notice.deadline);

  return (
    <DetailShell theme={theme} insets={insets}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={8}
          style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text
          numberOfLines={1}
          style={{ color: theme.colors.textMuted, fontSize: theme.type.label.fontSize, flex: 1 }}>
          Notice
        </Text>
      </View>

      {/* Verify banner */}
      {notice.needsVerify ? (
        <InlineBanner
          variant="warning"
          title="Check the original before relying on this date"
          message="The extracted deadline may be wrong or missing."
        />
      ) : null}

      {/* Title + chips */}
      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <TypeChip type={notice.type} />
          <StatusBadge status={notice.status} size="md" />
          {pinned ? (
            <Ionicons name="pin" size={16} color={theme.colors.primary} accessibilityLabel="Pinned" />
          ) : null}
        </View>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: theme.type.title.fontSize,
            lineHeight: theme.type.title.lineHeight,
            fontWeight: '600',
          }}>
          {notice.title}
        </Text>
      </View>

      {/* Deadline block */}
      <View
        style={[
          styles.block,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radii.lg,
            padding: theme.spacing.lg,
            marginTop: theme.spacing.lg,
          },
        ]}>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.type.label.fontSize }}>
          Deadline
        </Text>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: theme.type.title.fontSize,
            fontWeight: '600',
            marginTop: 2,
          }}>
          {notice.deadline ? formatDeadlineDate(notice.deadline) : 'Not parsed'}
          {relative ? (
            <Text style={{ color: theme.colors.textSecondary, fontWeight: '400' }}> · {relative}</Text>
          ) : null}
        </Text>
        {notice.deadlinePhrase ? (
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: theme.type.body.fontSize,
              marginTop: 4,
            }}>
            As stated: “{notice.deadlinePhrase}”
          </Text>
        ) : null}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginTop: theme.spacing.sm,
          }}>
          <Ionicons
            name="sparkles-outline"
            size={13}
            color={theme.colors.textMuted}
            importantForAccessibility="no"
            accessibilityElements={[]}
          />
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: theme.type.caption.fontSize,
            }}>
            Date confidence: {confidenceLabel(notice.confidence)}
            {notice.confidence !== null ? ` (${notice.confidence.toFixed(2)})` : ''}
          </Text>
        </View>
      </View>

      {/* Meta */}
      <View style={{ marginTop: theme.spacing.lg, gap: 6 }}>
        <MetaLine theme={theme} icon="mail-outline" text={`Source: ${notice.source}`} />
        <MetaLine
          theme={theme}
          icon="time-outline"
          text={`First seen ${formatTimestamp(notice.createdAt)}`}
        />
        <MetaLine
          theme={theme}
          icon="refresh-outline"
          text={`Last updated ${formatTimestamp(notice.updatedAt)}`}
        />
      </View>

      {/* Actions */}
      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xl }}>
        {notice.sourceLink ? (
          <AppButton
            label="Open original"
            icon="open-outline"
            onPress={() => openOriginal(notice)}
          />
        ) : null}

        <AppButton
          label={done ? 'Undo done' : 'Mark done'}
          icon={done ? 'arrow-undo-outline' : 'checkmark-circle-outline'}
          variant={done ? 'secondary' : 'primary'}
          onPress={() => write((u) => setNoticeDone(u, notice.id, !done))}
        />

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <AppButton
            label="Snooze 1d"
            variant="secondary"
            icon="moon-outline"
            style={{ flex: 1 }}
            onPress={() => write((u) => setNoticeSnoozed(u, notice.id, addDays(new Date(), 1)))}
          />
          <AppButton
            label="Snooze 3d"
            variant="secondary"
            icon="moon-outline"
            style={{ flex: 1 }}
            onPress={() => write((u) => setNoticeSnoozed(u, notice.id, addDays(new Date(), 3)))}
          />
          <AppButton
            label="Custom…"
            variant="secondary"
            icon="calendar-outline"
            style={{ flex: 1 }}
            onPress={onCustomSnooze}
          />
        </View>

        {snoozedUntil ? (
          <InlineBanner
            variant="info"
            icon="moon-outline"
            title={`Snoozed until ${formatTimestamp(snoozedUntil)}`}
            actionLabel="Un-snooze"
            onAction={() => write((u) => setNoticeSnoozed(u, notice.id, null))}
          />
        ) : null}

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <AppButton
            label={pinned ? 'Unpin' : 'Pin'}
            variant="secondary"
            icon={pinned ? 'pin-outline' : 'pin'}
            style={{ flex: 1 }}
            onPress={() => write((u) => setNoticePinned(u, notice.id, !pinned))}
          />
          <AppButton
            label="Add to calendar"
            variant="secondary"
            icon="calendar-outline"
            style={{ flex: 1 }}
            disabled={!notice.deadline}
            onPress={() => void onAddToCalendar()}
          />
        </View>
        {calendarMessage ? (
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: theme.type.caption.fontSize,
              textAlign: 'center',
            }}>
            {calendarMessage}
          </Text>
        ) : null}
      </View>

      {/* Original message */}
      {notice.rawText ? (
        <View
          style={[
            styles.block,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radii.lg,
              marginTop: theme.spacing.xl,
              padding: theme.spacing.lg,
            },
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={rawOpen ? 'Hide original message' : 'Show original message'}
            onPress={() => setRawOpen((open) => !open)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 44,
            }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: theme.type.label.fontSize,
                fontWeight: '600',
              }}>
              Original message
            </Text>
            <Ionicons
              name={rawOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={theme.colors.textSecondary}
              importantForAccessibility="no"
              accessibilityElements={[]}
            />
          </Pressable>
          {rawOpen ? (
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.type.body.fontSize,
                lineHeight: theme.type.body.lineHeight,
                marginTop: theme.spacing.sm,
              }}>
              {notice.rawText}
            </Text>
          ) : null}
        </View>
      ) : null}
    </DetailShell>
  );
}

function DetailShell({
  theme,
  insets,
  children,
}: {
  theme: Theme;
  insets: { top: number; bottom: number };
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.bg }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing.sm,
          paddingBottom: insets.bottom + theme.spacing.xxl,
          paddingHorizontal: theme.spacing.lg,
        }}>
        {children}
      </ScrollView>
    </View>
  );
}

function MetaLine({ theme, icon, text }: { theme: Theme; icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons
        name={icon}
        size={14}
        color={theme.colors.textMuted}
        importantForAccessibility="no"
        accessibilityElements={[]}
      />
      <Text style={{ color: theme.colors.textSecondary, fontSize: theme.type.caption.fontSize }}>
        {text}
      </Text>
    </View>
  );
}

function openOriginal(notice: Notice): void {
  Linking.openURL(notice.sourceLink).catch((error: unknown) => {
    logger.warn('Could not open source link', error);
  });
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  block: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
