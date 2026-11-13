/**
 * Building blocks for the Settings screen.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTheme } from '../../theme/theme';
import type { Theme } from '../../theme/tokens';
import { atTimeOfDay, formatLastSynced, formatHHmm, parseHHmm } from '../../utils/date';
import type { Source } from '../../utils/types';

export function SectionHeader({ title }: { title: string }) {
  const theme: Theme = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={{
        color: theme.colors.textMuted,
        fontSize: theme.type.label.fontSize,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: theme.spacing.xl,
        marginBottom: theme.spacing.sm,
      }}>
      {title}
    </Text>
  );
}

export function SettingsCard({ children }: { children: React.ReactNode }) {
  const theme: Theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.md,
        },
      ]}>
      {children}
    </View>
  );
}

export function CardRow({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  const theme: Theme = useTheme();
  return (
    <View style={[styles.row, { paddingHorizontal: theme.spacing.lg, minHeight: 48 }]}>
      <Text
        style={{
          color: theme.colors.text,
          fontSize: theme.type.body.fontSize,
          flex: 1,
        }}>
        {label}
      </Text>
      <Text
        style={{
          color: danger ? theme.colors.danger : theme.colors.textSecondary,
          fontSize: theme.type.body.fontSize,
          fontWeight: danger ? '600' : '400',
          flexShrink: 1,
          textAlign: 'right',
        }}>
        {value}
      </Text>
    </View>
  );
}

export interface ChipToggleProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  onRemove?: () => void;
}

export function ChipToggle({ label, selected, onPress, onRemove }: ChipToggleProps) {
  const theme: Theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceAlt,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          borderRadius: theme.radii.pill,
          minHeight: 44,
          paddingHorizontal: theme.spacing.md,
        },
      ]}>
      <Text
        style={{
          color: selected ? theme.colors.primaryOnSoft : theme.colors.textSecondary,
          fontSize: theme.type.label.fontSize,
          fontWeight: '600',
        }}>
        {label}
      </Text>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          onPress={onRemove}
          hitSlop={8}
          style={{ marginLeft: 6 }}>
          <Ionicons name="close" size={14} color={theme.colors.textSecondary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/**
 * Quiet-hours time field. Opens the Android time picker and returns HH:mm.
 */
export function TimePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hhmm: string) => void;
}) {
  const theme: Theme = useTheme();
  const current = atTimeOfDay(new Date(), value) ?? new Date();

  const open = () => {
    DateTimePickerAndroid.open({
      mode: 'time',
      value: current,
      is24Hour: false,
      onChange: (_event, picked) => {
        if (!picked) return;
        onChange(formatHHmm(picked.getHours() * 60 + picked.getMinutes()));
      },
    });
  };

  const valid = parseHHmm(value) !== null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Change time`}
      onPress={open}
      style={[
        styles.timeField,
        {
          backgroundColor: theme.colors.surfaceAlt,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.md,
          minHeight: 44,
          paddingHorizontal: theme.spacing.md,
        },
      ]}>
      <Text
        style={{
          color: theme.colors.textSecondary,
          fontSize: theme.type.label.fontSize,
        }}>
        {label}
      </Text>
      <Text
        style={{
          color: valid ? theme.colors.text : theme.colors.danger,
          fontSize: theme.type.body.fontSize,
          fontWeight: '600',
        }}>
        {valid ? value : '—'}
      </Text>
    </Pressable>
  );
}

export function SourceHealthRow({ source }: { source: Source }) {
  const theme: Theme = useTheme();
  const ok = source.ok;
  const tone = ok
    ? { text: theme.colors.statusOpen.text, bg: theme.colors.statusOpen.bg, icon: 'checkmark-circle' as const }
    : {
        text: theme.colors.dangerOnSoft,
        bg: theme.colors.dangerSoft,
        icon: 'alert-circle' as const,
      };
  return (
    <View
      style={[styles.row, { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md }]}>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: theme.type.body.fontSize,
            fontWeight: '500',
          }}>
          {source.name}
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.type.caption.fontSize,
            marginTop: 2,
          }}>
          Polled {formatLastSynced(source.lastPolledAt)}
          {!ok && source.lastError ? ` · ${source.lastError}` : ''}
        </Text>
      </View>
      <View
        style={[
          styles.badge,
          { backgroundColor: tone.bg, borderRadius: theme.radii.pill },
        ]}
        accessibilityLabel={ok ? 'Healthy' : 'Failing'}>
        <Ionicons
          name={tone.icon}
          size={13}
          color={tone.text}
          importantForAccessibility="no"
          accessibilityElements={[]}
        />
        <Text style={{ color: tone.text, fontSize: theme.type.caption.fontSize, fontWeight: '600' }}>
          {ok ? 'OK' : 'Error'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  timeField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});
