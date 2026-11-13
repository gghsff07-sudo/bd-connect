/**
 * Home: segmented tabs (Open / Closing soon / Closed), search, sync-health
 * and offline banners, skeleton loading, empty states and the notice list.
 * Data arrives via live listeners; no manual refresh.
 */
import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/theme';
import type { Theme } from '../../src/theme/tokens';
import { useDataStore } from '../../src/store/data';
import { useUiStore, type HomeTabId } from '../../src/store/ui';
import { useNotices, useNow, useSyncHealth } from '../../src/features/notices/hooks';
import { applySearch, selectForTab, type TabKey } from '../../src/features/notices/selectors';
import { NoticeCard } from '../../src/features/notices/NoticeCard';
import { SkeletonCard } from '../../src/features/notices/SkeletonCard';
import { EmptyState } from '../../src/features/notices/EmptyState';
import { InlineBanner } from '../../src/components/InlineBanner';
import { SegmentedControl } from '../../src/components/SegmentedControl';
import { restartDataSync } from '../../src/services/dataSync';
import { formatLastSynced } from '../../src/utils/date';

const TAB_OPTIONS: { value: HomeTabId; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'closing', label: 'Closing soon' },
  { value: 'closed', label: 'Closed' },
];

const EMPTY_STATES: Record<TabKey, { icon: 'checkmark-done-outline' | 'time-outline' | 'archive-outline'; title: string; message: string }> = {
  open: {
    icon: 'checkmark-done-outline',
    title: 'All caught up',
    message: 'No open notices right now.',
  },
  closing: {
    icon: 'time-outline',
    title: 'Nothing due soon',
    message: 'No deadlines within the next 7 days.',
  },
  closed: {
    icon: 'archive-outline',
    title: 'Nothing closed yet',
    message: 'Closed and past-due notices will collect here.',
  },
};

export default function HomeScreen() {
  const theme: Theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const homeTab = useUiStore((state) => state.homeTab);
  const setHomeTab = useUiStore((state) => state.setHomeTab);
  const searchQuery = useUiStore((state) => state.searchQuery);
  const setSearchQuery = useUiStore((state) => state.setSearchQuery);

  const dataStatus = useDataStore((state) => state.status);
  const dataError = useDataStore((state) => state.error);

  const now = useNow();
  const { notices, userState } = useNotices();
  const syncHealth = useSyncHealth(now);

  const visible = useMemo(
    () => applySearch(selectForTab(homeTab, notices, userState, now), searchQuery),
    [homeTab, notices, userState, now, searchQuery],
  );

  const onOpenNotice = useCallback(
    (noticeId: string) => {
      router.push(`/notice/${noticeId}`);
    },
    [router],
  );

  const showSkeleton = dataStatus === 'loading' && notices.length === 0;
  const showError = dataStatus === 'error' && notices.length === 0;
  const searching = searchQuery.trim().length > 0;

  const renderCard = useCallback(
    ({ item }: { item: (typeof visible)[number] }) => (
      <NoticeCard notice={item} state={userState[item.id]} onPress={onOpenNotice} />
    ),
    [userState, onOpenNotice],
  );

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.bg }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + theme.spacing.md,
            paddingHorizontal: theme.spacing.lg,
            backgroundColor: theme.colors.bg,
          },
        ]}>
        <View style={styles.headerRow}>
          <View style={styles.headerTitleWrap}>
            <Text
              accessibilityRole="header"
              style={{
                color: theme.colors.text,
                fontSize: theme.type.display.fontSize,
                lineHeight: theme.type.display.lineHeight,
                fontWeight: '700',
              }}>
              Notice Tracker
            </Text>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.type.caption.fontSize,
                marginTop: 2,
              }}>
              Last synced {formatLastSynced(syncHealth.lastPolledAt, now)}
            </Text>
          </View>
        </View>

        {/* Sync health + errors */}
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          {syncHealth.failing.length > 0 ? (
            <InlineBanner
              variant="warning"
              title="Some sources are failing"
              message={`Check Source health in Settings. (${syncHealth.failing
                .map((s) => s.name)
                .join(', ')})`}
            />
          ) : syncHealth.stale ? (
            <InlineBanner
              variant="warning"
              title="Sync may be behind"
              message="Notices haven't refreshed in over 2 hours. The poller may be down."
            />
          ) : null}
          {dataStatus === 'error' && dataError ? (
            <InlineBanner
              variant="error"
              title="Couldn't load notices"
              message={dataError}
              actionLabel="Retry"
              onAction={restartDataSync}
            />
          ) : null}
        </View>

        {/* Tabs + search */}
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          <SegmentedControl options={TAB_OPTIONS} value={homeTab} onChange={setHomeTab} />
          <View
            style={[
              styles.search,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radii.md,
                paddingHorizontal: theme.spacing.md,
              },
            ]}>
            <Ionicons
              name="search-outline"
              size={16}
              color={theme.colors.textMuted}
              importantForAccessibility="no"
              accessibilityElements={[]}
            />
            <TextInput
              accessibilityLabel="Search notices by title or type"
              placeholder="Search title or type"
              placeholderTextColor={theme.colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={{
                flex: 1,
                color: theme.colors.text,
                fontSize: theme.type.body.fontSize,
                minHeight: 44,
              }}
            />
            {searching ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => setSearchQuery('')}
                hitSlop={8}>
                <Ionicons name="close" size={16} color={theme.colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      {/* List */}
      {showSkeleton ? (
        <ScrollView
          contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
          showsVerticalScrollIndicator={false}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </ScrollView>
      ) : showError ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: theme.spacing.xl }}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Notices unavailable"
            message={dataError ?? 'Something went wrong.'}
          />
        </View>
      ) : (
        <FlashList
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={{
            padding: theme.spacing.lg,
            paddingBottom: insets.bottom + theme.spacing.xxl,
          }}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
          ListEmptyComponent={
            searching ? (
              <EmptyState
                icon="search-outline"
                title="No matches"
                message="No notices in this tab match your search."
              />
            ) : (
              <EmptyState
                icon={EMPTY_STATES[homeTab].icon}
                title={EMPTY_STATES[homeTab].title}
                message={EMPTY_STATES[homeTab].message}
              />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  header: {
    gap: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  headerTitleWrap: {
    flex: 1,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
