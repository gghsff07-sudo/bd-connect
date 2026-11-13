/**
 * Done tab: notices marked done, newest first, each with an Undo action.
 */
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/theme';
import type { Theme } from '../../src/theme/tokens';
import { useAuthStore } from '../../src/store/auth';
import { useDataStore } from '../../src/store/data';
import { useNotices } from '../../src/features/notices/hooks';
import { selectDoneList } from '../../src/features/notices/selectors';
import { NoticeCard } from '../../src/features/notices/NoticeCard';
import { EmptyState } from '../../src/features/notices/EmptyState';
import { SkeletonCard } from '../../src/features/notices/SkeletonCard';
import { setNoticeDone } from '../../src/services/dataSync';
import { formatLastSynced } from '../../src/utils/date';
import type { Notice } from '../../src/utils/types';

export default function DoneScreen() {
  const theme: Theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const uid = useAuthStore((state) => state.user?.uid);
  const dataStatus = useDataStore((state) => state.status);
  const { notices, userState } = useNotices();

  const done = selectDoneList(notices, userState);

  const onOpenNotice = useCallback(
    (noticeId: string) => {
      router.push(`/notice/${noticeId}`);
    },
    [router],
  );

  const renderCard = useCallback(
    ({ item }: { item: Notice }) => (
      <DoneCard
        notice={item}
        doneAt={userState[item.id]?.updatedAt ?? null}
        onPress={onOpenNotice}
        onUndo={() => {
          if (uid) void setNoticeDone(uid, item.id, false);
        }}
      />
    ),
    [userState, onOpenNotice, uid],
  );

  const showSkeleton = dataStatus === 'loading' && notices.length === 0;

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.bg }]}>
      <View
        style={{
          paddingTop: insets.top + theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
        }}>
        <Text
          accessibilityRole="header"
          style={{
            color: theme.colors.text,
            fontSize: theme.type.display.fontSize,
            lineHeight: theme.type.display.lineHeight,
            fontWeight: '700',
          }}>
          Done
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.type.caption.fontSize,
            marginTop: 2,
          }}>
          {done.length === 0
            ? 'Notices you mark done will be archived here.'
            : `${done.length} archived`}
        </Text>
      </View>

      {showSkeleton ? (
        <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlashList
          data={done}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={{
            padding: theme.spacing.lg,
            paddingBottom: insets.bottom + theme.spacing.xxl,
          }}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
          ListEmptyComponent={
            <EmptyState
              icon="checkmark-done-outline"
              title="Nothing done yet"
              message="Mark notices as done from their detail screen."
            />
          }
        />
      )}
    </View>
  );
}

function DoneCard({
  notice,
  doneAt,
  onPress,
  onUndo,
}: {
  notice: Notice;
  doneAt: Date | null;
  onPress: (noticeId: string) => void;
  onUndo: () => void;
}) {
  const theme: Theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <NoticeCard notice={notice} onPress={onPress} hidePin />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Undo done for ${notice.title}`}
        onPress={onUndo}
        style={({ pressed }) => [
          styles.undo,
          {
            borderColor: theme.colors.border,
            borderRadius: theme.radii.md,
            opacity: pressed ? 0.7 : 1,
            minHeight: 40,
          },
        ]}>
        <Ionicons
          name="arrow-undo-outline"
          size={15}
          color={theme.colors.textSecondary}
          importantForAccessibility="no"
          accessibilityElements={[]}
        />
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: theme.type.label.fontSize,
            fontWeight: '600',
          }}>
          Undo
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.type.caption.fontSize,
            marginLeft: 'auto',
          }}>
          {doneAt ? `Marked done ${formatLastSynced(doneAt)}` : ''}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  undo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
});
