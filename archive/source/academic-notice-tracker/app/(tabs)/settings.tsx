/**
 * Settings: reminders, quiet hours, muted types, notification permission,
 * source health, account.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/theme';
import type { Theme } from '../../src/theme/tokens';
import { useAuthStore } from '../../src/store/auth';
import { useDataStore } from '../../src/store/data';
import { useUiStore } from '../../src/store/ui';
import { useNotices } from '../../src/features/notices/hooks';
import { toggleReminderOffset, usePrefs } from '../../src/features/settings/usePrefs';
import {
  CardRow,
  ChipToggle,
  SectionHeader,
  SettingsCard,
  SourceHealthRow,
  TimePickerField,
} from '../../src/features/settings/components';
import { AppButton } from '../../src/components/AppButton';
import {
  openNotificationSettings,
  refreshPermissionStatus,
  refreshTokenRegistration,
  requestNotificationPermission,
} from '../../src/services/notifications';
import {
  NOTICE_TYPES,
  NOTICE_TYPE_LABELS,
  DEFAULT_REMINDER_OFFSETS,
  type NoticeType,
} from '../../src/utils/types';

const PRESET_REMINDERS: { hours: number; label: string }[] = [
  { hours: 72, label: '3 days' },
  { hours: 24, label: '1 day' },
  { hours: 3, label: '3 hours' },
];

const PERMISSION_LABELS: Record<string, string> = {
  granted: 'Enabled',
  denied: 'Disabled',
  blocked: 'Blocked in system settings',
  notDetermined: 'Not asked yet',
  unknown: 'Unknown',
};

export default function SettingsScreen() {
  const theme: Theme = useTheme();
  const insets = useSafeAreaInsets();

  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const prefsLoaded = useDataStore((state) => state.prefsLoaded);
  const permission = useUiStore((state) => state.notifPermission);
  const setPermission = useUiStore((state) => state.setNotifPermission);

  const { prefs, update } = usePrefs();
  const { sources } = useNotices();

  const [customHours, setCustomHours] = useState('');

  // Refresh the notification permission status whenever Settings opens.
  useFocusEffect(
    React.useCallback(() => {
      void refreshPermissionStatus();
    }, []),
  );

  const customOffsets = useMemo(
    () =>
      prefs.reminderOffsetsHours
        .filter((value) => !DEFAULT_REMINDER_OFFSETS.includes(value))
        .sort((a, b) => a - b),
    [prefs.reminderOffsetsHours],
  );

  const addCustomOffset = () => {
    const hours = Number(customHours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 30) {
      setCustomHours('');
      return;
    }
    const next = Array.from(new Set([...prefs.reminderOffsetsHours, Math.round(hours)])).sort(
      (a, b) => a - b,
    );
    void update({ reminderOffsetsHours: next });
    setCustomHours('');
  };

  const toggleTypeMuted = (type: NoticeType, muted: boolean) => {
    const next = muted
      ? Array.from(new Set([...prefs.mutedTypes, type]))
      : prefs.mutedTypes.filter((value) => value !== type);
    void update({ mutedTypes: next });
  };

  const fixPermission = async () => {
    if (permission === 'notDetermined' || permission === 'unknown') {
      const result = await requestNotificationPermission();
      setPermission(result);
      if (result === 'granted' && user?.uid) {
        try {
          await refreshTokenRegistration(user.uid);
        } catch {
          // Retried on next launch.
        }
      }
    } else {
      await openNotificationSettings();
      void refreshPermissionStatus();
    }
  };

  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: theme.colors.bg }]}
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        paddingBottom: insets.bottom + theme.spacing.xxl,
      }}>
      <Text
        accessibilityRole="header"
        style={{
          color: theme.colors.text,
          fontSize: theme.type.display.fontSize,
          lineHeight: theme.type.display.lineHeight,
          fontWeight: '700',
        }}>
        Settings
      </Text>

      {/* Notifications */}
      <SectionHeader title="Notifications" />
      <SettingsCard>
        <CardRow
          label="Push notifications"
          value={PERMISSION_LABELS[permission] ?? permission}
          danger={permission !== 'granted'}
        />
        {permission !== 'granted' ? (
          <View style={{ padding: theme.spacing.md }}>
            <AppButton
              label={permission === 'notDetermined' || permission === 'unknown' ? 'Enable' : 'Fix'}
              icon="notifications-outline"
              onPress={() => void fixPermission()}
            />
          </View>
        ) : null}
      </SettingsCard>

      {/* Reminders */}
      <SectionHeader title="Reminders" />
      <SettingsCard>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: theme.type.caption.fontSize,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.md,
          }}>
          Get a push reminder this long before each deadline. Reminders are
          sent by your poller server; quiet hours apply.
        </Text>
        <View
          style={[
            styles.chipWrap,
            { padding: theme.spacing.md, gap: theme.spacing.sm },
          ]}>
          {PRESET_REMINDERS.map((preset) => (
            <ChipToggle
              key={preset.hours}
              label={preset.label}
              selected={prefs.reminderOffsetsHours.includes(preset.hours)}
              onPress={() =>
                void update({
                  reminderOffsetsHours: toggleReminderOffset(
                    prefs.reminderOffsetsHours,
                    preset.hours,
                  ),
                })
              }
            />
          ))}
          {customOffsets.map((hours) => (
            <ChipToggle
              key={hours}
              label={formatOffsetLabel(hours)}
              selected
              onPress={() =>
                void update({
                  reminderOffsetsHours: prefs.reminderOffsetsHours.filter(
                    (value) => value !== hours,
                  ),
                })
              }
              onRemove={() =>
                void update({
                  reminderOffsetsHours: prefs.reminderOffsetsHours.filter(
                    (value) => value !== hours,
                  ),
                })
              }
            />
          ))}
        </View>
        <View style={[styles.customRow, { padding: theme.spacing.md, gap: theme.spacing.sm }]}>
          <TextInput
            accessibilityLabel="Custom reminder hours before deadline"
            placeholder="Custom (hours before)"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="number-pad"
            value={customHours}
            onChangeText={setCustomHours}
            style={{
              flex: 1,
              color: theme.colors.text,
              fontSize: theme.type.body.fontSize,
              backgroundColor: theme.colors.surfaceAlt,
              borderRadius: theme.radii.md,
              paddingHorizontal: theme.spacing.md,
              minHeight: 44,
            }}
          />
          <AppButton label="Add" variant="secondary" onPress={addCustomOffset} disabled={!customHours} />
        </View>
      </SettingsCard>

      {/* Quiet hours */}
      <SectionHeader title="Quiet hours" />
      <SettingsCard>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: theme.type.caption.fontSize,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.md,
          }}>
          No reminder pushes inside this window (notices still arrive).
          Enforced by your poller server.
        </Text>
        <View
          style={{
            flexDirection: 'row',
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
          }}>
          <TimePickerField
            label="Start"
            value={prefs.quietHours.start}
            onChange={(value) => {
              void update({ quietHours: { start: value, end: prefs.quietHours.end } });
            }}
          />
          <TimePickerField
            label="End"
            value={prefs.quietHours.end}
            onChange={(value) => {
              void update({ quietHours: { start: prefs.quietHours.start, end: value } });
            }}
          />
        </View>
      </SettingsCard>

      {/* Muted types */}
      <SectionHeader title="Muted types" />
      <SettingsCard>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: theme.type.caption.fontSize,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.md,
          }}>
          Muted types stop reminder pushes. They still appear in your lists.
        </Text>
        <View style={{ padding: theme.spacing.md, gap: theme.spacing.sm }}>
          {NOTICE_TYPES.map((type) => (
            <MuteRow
              key={type}
              type={type}
              muted={prefs.mutedTypes.includes(type)}
              onToggle={(muted) => toggleTypeMuted(type, muted)}
            />
          ))}
        </View>
      </SettingsCard>

      {/* Source health */}
      <SectionHeader title="Source health" />
      {!prefsLoaded && sources.length === 0 ? (
        <SettingsCard>
          <CardRow label="Loading sources…" value="" />
        </SettingsCard>
      ) : sources.length === 0 ? (
        <SettingsCard>
          <CardRow label="No sources registered yet" value="" />
        </SettingsCard>
      ) : (
        <SettingsCard>
          {sources.map((source, index) => (
            <View key={source.name}>
              <SourceHealthRow source={source} />
              {index < sources.length - 1 ? (
                <View
                  style={{
                    height: StyleSheet.hairlineWidth,
                    backgroundColor: theme.colors.border,
                    marginHorizontal: theme.spacing.lg,
                  }}
                />
              ) : null}
            </View>
          ))}
        </SettingsCard>
      )}

      {/* Account */}
      <SectionHeader title="Account" />
      <SettingsCard>
        <CardRow label="Signed in as" value={user?.email ?? '—'} />
        <View style={{ padding: theme.spacing.md }}>
          <AppButton label="Sign out" variant="danger" icon="log-out-outline" onPress={() => void signOut()} />
        </View>
      </SettingsCard>
      <Text
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.type.caption.fontSize,
          textAlign: 'center',
          marginTop: theme.spacing.lg,
        }}>
        Notice Tracker {Constants.expoConfig?.version ?? '1.0.0'}
      </Text>
    </ScrollView>
  );
}

function MuteRow({
  type,
  muted,
  onToggle,
}: {
  type: NoticeType;
  muted: boolean;
  onToggle: (muted: boolean) => void;
}) {
  const theme: Theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: muted }}
      accessibilityLabel={`Mute ${NOTICE_TYPE_LABELS[type]} reminders`}
      onPress={() => onToggle(!muted)}
      style={[
        styles.muteRow,
        {
          backgroundColor: muted ? theme.colors.primarySoft : theme.colors.surfaceAlt,
          borderColor: muted ? theme.colors.primary : theme.colors.border,
          borderRadius: theme.radii.md,
          paddingHorizontal: theme.spacing.md,
          minHeight: 44,
        },
      ]}>
      <Text
        style={{
          color: muted ? theme.colors.primaryOnSoft : theme.colors.textSecondary,
          fontSize: theme.type.label.fontSize,
          fontWeight: '600',
          flex: 1,
        }}>
        {NOTICE_TYPE_LABELS[type]}
      </Text>
      <Ionicons
        name={muted ? 'notifications-off' : 'notifications'}
        size={16}
        color={muted ? theme.colors.primaryOnSoft : theme.colors.textSecondary}
        importantForAccessibility="no"
        accessibilityElements={[]}
      />
    </Pressable>
  );
}

function formatOffsetLabel(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  return `${hours}h`;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  muteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
