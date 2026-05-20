import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, DeviceEventEmitter, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError, fetchSocialNotifications, markSocialNotificationRead, markSocialNotificationsRead } from '../api/client';
import AppScreen from '../components/AppScreen';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import type { SocialNotification } from '../types';
import { formatDate } from '../utils/format';
import { NOTIFICATIONS_REFRESH_EVENT } from '../utils/events';

export default function NotificationsScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Notifications'>) {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const [notifications, setNotifications] = useState<SocialNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadNotifications = useCallback(async () => {
    if (!session) {
      return;
    }

    try {
      const payload = await fetchSocialNotifications(session.token, 50);
      setNotifications(payload.items);
      setUnreadCount(payload.unread_count ?? 0);
      setError('');
    } catch (notificationError) {
      if (notificationError instanceof ApiError && notificationError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de charger les notifications.');
    } finally {
      setLoading(false);
    }
  }, [session, signOut]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadNotifications();
    }, [loadNotifications]),
  );

  const refreshNotifications = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadNotifications();
    } finally {
      setRefreshing(false);
    }
  }, [loadNotifications]);

  const handleMarkRead = useCallback(async () => {
    if (!session || unreadCount === 0) {
      return;
    }

    try {
      await markSocialNotificationsRead(session.token);
      setNotifications([]);
      setUnreadCount(0);
      DeviceEventEmitter.emit(NOTIFICATIONS_REFRESH_EVENT);
      setError('');
    } catch (notificationError) {
      if (notificationError instanceof ApiError && notificationError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de marquer les notifications comme lues.');
    }
  }, [session, signOut, unreadCount]);

  const openNotification = useCallback((notification: SocialNotification) => {
    if (notification.type === 'follow' || !notification.review) {
      navigation.navigate('UserProfile', { username: notification.actor.username });
      return;
    }

    navigation.navigate('ReviewDetails', {
      reviewId: notification.review.id,
      highlightCommentId: notification.comment_id ?? undefined,
    });
  }, [navigation]);

  const handleOpenNotification = useCallback(async (notification: SocialNotification) => {
    setNotifications((current) =>
      current.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item)),
    );
    setUnreadCount((current) => Math.max(0, current - (notification.is_read ? 0 : 1)));
    DeviceEventEmitter.emit(NOTIFICATIONS_REFRESH_EVENT);

    if (session && !notification.is_read) {
      void markSocialNotificationRead(session.token, notification.id).catch(async (notificationError) => {
        if (notificationError instanceof ApiError && notificationError.status === 401) {
          await signOut();
          return;
        }
        setError("Impossible de marquer cette notification comme lue.");
        void loadNotifications();
      });
    }

    openNotification(notification);
  }, [loadNotifications, openNotification, session, signOut]);

  return (
    <AppScreen refreshing={refreshing} onRefresh={() => void refreshNotifications()}>
      <View style={styles.headerRow}>
        <Pressable style={[styles.iconButton, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </Pressable>
        <View style={styles.headerBody}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Notifications</Text>
          <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
            {unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : 'Tout est lu'}
          </Text>
        </View>
        <Pressable
          style={[styles.readButton, { backgroundColor: unreadCount > 0 ? theme.colors.secondaryAccent : theme.rgba.cardStrong }]}
          onPress={() => void handleMarkRead()}
          disabled={unreadCount === 0}
        >
          <Ionicons name="checkmark-done" size={18} color={unreadCount > 0 ? theme.colors.secondaryAccentText : theme.colors.textMuted} />
        </Pressable>
      </View>

      {error ? <InlineBanner message={error} tone="error" /> : null}

      {loading ? (
        <View style={[styles.stateCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          <ActivityIndicator color={theme.colors.text} />
          <Text style={[styles.stateText, { color: theme.colors.textSoft }]}>Chargement des notifications...</Text>
        </View>
      ) : notifications.length === 0 ? (
        <EmptyStateCard title="Aucune notification" />
      ) : (
        <View style={styles.list}>
          {notifications.map((notification) => (
            <Pressable
              key={notification.id}
              style={[styles.notificationCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
              onPress={() => void handleOpenNotification(notification)}
            >
              <View style={[styles.iconBadge, { backgroundColor: notification.is_read ? theme.rgba.cardStrong : theme.colors.accentSoft }]}>
                <Ionicons
                  name={notification.type === 'follow' ? 'person-add-outline' : notification.type === 'like' ? 'heart-outline' : 'chatbubble-ellipses-outline'}
                  size={18}
                  color={notification.is_read ? theme.colors.textMuted : theme.colors.accent}
                />
              </View>
              <View style={styles.notificationBody}>
                <Text style={[styles.notificationText, { color: theme.colors.text }]}>{notification.message}</Text>
                {notification.comment_preview ? (
                  <Text style={[styles.previewText, { color: theme.colors.textMuted }]} numberOfLines={2}>{notification.comment_preview}</Text>
                ) : null}
                <Text style={[styles.notificationDate, { color: theme.colors.textMuted }]}>{formatDate(notification.created_at)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </Pressable>
          ))}
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBody: {
    flex: 1,
    gap: 3,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  readButton: {
    width: 42,
    height: 42,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateCard: {
    minHeight: 190,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  stateText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  list: {
    gap: 10,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    padding: 13,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBody: {
    flex: 1,
    gap: 5,
  },
  notificationText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
  },
  previewText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  notificationDate: {
    fontSize: 11,
    fontWeight: '800',
  },
});
