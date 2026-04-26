import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppScreen from '../components/AppScreen';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import ScreenHeader from '../components/ScreenHeader';
import SearchField from '../components/SearchField';
import {
  ApiError,
  fetchConversations,
  searchSocialUsers,
  startConversation,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import type { DirectConversationSummary, SocialUser } from '../types';
import { formatDate } from '../utils/format';

export default function MessagesScreen() {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [conversations, setConversations] = useState<DirectConversationSummary[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [isNewMessageOpen, setIsNewMessageOpen] = useState(false);
  const [userResults, setUserResults] = useState<SocialUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [startingUserIds, setStartingUserIds] = useState<number[]>([]);
  const [error, setError] = useState('');

  const loadConversations = useCallback(async () => {
    if (!session) {
      return;
    }

    try {
      const payload = await fetchConversations(session.token);
      setConversations(payload);
      setError('');
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de charger les conversations.');
    } finally {
      setLoading(false);
    }
  }, [session, signOut]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadConversations();
    }, [loadConversations]),
  );

  useEffect(() => {
    if (!session) {
      return;
    }

    const trimmedQuery = userQuery.trim();
    if (trimmedQuery.length < 2) {
      setUserResults([]);
      setSearchingUsers(false);
      return;
    }

    const handle = setTimeout(() => {
      void (async () => {
        setSearchingUsers(true);
        try {
          const payload = await searchSocialUsers(session.token, trimmedQuery);
          setUserResults(payload);
          setError('');
        } catch (searchError) {
          if (searchError instanceof ApiError && searchError.status === 401) {
            await signOut();
            return;
          }
          setError('Impossible de rechercher des utilisateurs.');
        } finally {
          setSearchingUsers(false);
        }
      })();
    }, 250);

    return () => clearTimeout(handle);
  }, [session, signOut, userQuery]);

  const unreadConversations = useMemo(
    () => conversations.filter((conversation) => conversation.unread_count > 0),
    [conversations],
  );
  const recentConversations = useMemo(
    () => conversations.filter((conversation) => conversation.unread_count === 0),
    [conversations],
  );

  const openConversation = (conversation: DirectConversationSummary) => {
    navigation.navigate('Conversation', {
      conversationId: conversation.id,
      participantUsername: conversation.participant.username,
      participantId: conversation.participant.id,
    });
  };

  const handleStartConversation = async (user: SocialUser) => {
    if (!session) {
      return;
    }

    setStartingUserIds((current) => [...current, user.id]);
    try {
      const payload = await startConversation(session.token, user.id);
      setUserQuery('');
      setUserResults([]);
      setIsNewMessageOpen(false);
      navigation.navigate('Conversation', {
        conversationId: payload.id,
        participantUsername: user.username,
        participantId: user.id,
      });
    } catch (actionError) {
      if (actionError instanceof ApiError && actionError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible d ouvrir cette conversation.');
    } finally {
      setStartingUserIds((current) => current.filter((id) => id !== user.id));
    }
  };

  return (
    <AppScreen>
      <ScreenHeader
        icon="chatbubbles"
        accent="blue"
        eyebrow="Direct"
        title="Messages"
        subtitle="Inbox mobile, nouveaux DM et conversations privees dans une vraie vue app."
        trailing={
          <View style={[styles.headerBadge, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <Text style={[styles.headerBadgeLabel, { color: theme.colors.text }]}>{conversations.length}</Text>
          </View>
        }
      />

      {error ? <InlineBanner message={error} tone="error" /> : null}

      <View style={styles.inboxHeader}>
        <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>Inbox</Text>
        <Pressable
          style={styles.newMessageButton}
          onPress={() => {
            setIsNewMessageOpen((current) => !current);
            setUserQuery('');
            setUserResults([]);
          }}
        >
          <Ionicons name={isNewMessageOpen ? 'close' : 'create-outline'} size={18} color={theme.colors.secondaryAccentText} />
        </Pressable>
      </View>

      {isNewMessageOpen ? (
        <View style={[styles.newMessagePanel, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          <SearchField
            value={userQuery}
            onChangeText={setUserQuery}
            placeholder="Chercher quelqu un"
            icon="person-add"
          />
          {searchingUsers ? <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Recherche en cours...</Text> : null}
          {userResults.length > 0 ? (
            <View style={styles.resultsList}>
              {userResults.map((user) => {
                const isStarting = startingUserIds.includes(user.id);
                return (
                  <Pressable key={user.id} style={[styles.userResultCard, { backgroundColor: theme.rgba.cardStrong }]} onPress={() => void handleStartConversation(user)}>
                    <View style={[styles.userAvatar, { backgroundColor: theme.colors.accentSoft }]}>
                      <Text style={[styles.userAvatarLabel, { color: theme.colors.accent }]}>{user.username.slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.userName, { color: theme.colors.text }]}>@{user.username}</Text>
                      <Text style={[styles.userMeta, { color: theme.colors.textMuted }]}>{user.followers_count} abonnes</Text>
                    </View>
                    <Text style={[styles.userAction, { color: theme.colors.secondaryAccent }]}>{isStarting ? 'Ouverture...' : 'Ecrire'}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      {loading ? <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Chargement des conversations...</Text> : null}

      {!loading && unreadConversations.length === 0 && recentConversations.length === 0 ? (
        <EmptyStateCard title="Aucune conversation" subtitle="Commence un nouveau message depuis la recherche ci-dessus." />
      ) : (
        <View style={styles.groupsWrap}>
          {unreadConversations.length > 0 ? (
            <View style={styles.groupBlock}>
              <Text style={[styles.groupTitle, { color: theme.colors.textSoft }]}>Non lus</Text>
              <View style={styles.cardsList}>
                {unreadConversations.map((conversation) => (
                  <Pressable key={conversation.id} style={[styles.card, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]} onPress={() => openConversation(conversation)}>
                    <View style={[styles.avatar, { backgroundColor: theme.colors.accentSoft }]}>
                      <Text style={[styles.avatarLabel, { color: theme.colors.accent }]}>{conversation.participant.username.slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.rowBetween}>
                        <Text style={[styles.username, { color: theme.colors.text }]}>@{conversation.participant.username}</Text>
                        <Text style={[styles.date, { color: theme.colors.textMuted }]}>{formatDate(conversation.updated_at)}</Text>
                      </View>
                      <Text style={[styles.preview, { color: theme.colors.textSoft }]} numberOfLines={2}>
                        {conversation.last_message?.preview ?? 'Commencer la discussion'}
                      </Text>
                    </View>
                    <View style={styles.badge}>
                      <Text style={styles.badgeLabel}>{conversation.unread_count}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {recentConversations.length > 0 ? (
            <View style={styles.groupBlock}>
              <Text style={[styles.groupTitle, { color: theme.colors.textSoft }]}>Recents</Text>
              <View style={styles.cardsList}>
                {recentConversations.map((conversation) => (
                  <Pressable key={conversation.id} style={[styles.card, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]} onPress={() => openConversation(conversation)}>
                    <View style={[styles.avatar, { backgroundColor: theme.colors.accentSoft }]}>
                      <Text style={[styles.avatarLabel, { color: theme.colors.accent }]}>{conversation.participant.username.slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.rowBetween}>
                        <Text style={[styles.username, { color: theme.colors.text }]}>@{conversation.participant.username}</Text>
                        <Text style={[styles.date, { color: theme.colors.textMuted }]}>{formatDate(conversation.updated_at)}</Text>
                      </View>
                      <Text style={[styles.preview, { color: theme.colors.textSoft }]} numberOfLines={2}>
                        {conversation.last_message?.preview ?? 'Commencer la discussion'}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  headerBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  headerBadgeLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  sectionCard: {
    gap: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 16,
  },
  inboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  newMessageButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: '#7dd3fc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newMessagePanel: {
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
  },
  helperText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  resultsList: {
    gap: 10,
  },
  userResultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarLabel: {
    color: '#ffffff',
    fontWeight: '900',
  },
  userName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  userMeta: {
    marginTop: 4,
    color: '#94a3b8',
    fontSize: 12,
  },
  userAction: {
    color: '#7dd3fc',
    fontSize: 12,
    fontWeight: '800',
  },
  groupsWrap: {
    gap: 18,
  },
  groupBlock: {
    gap: 10,
  },
  groupTitle: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardsList: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: {
    color: '#ffffff',
    fontWeight: '900',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  username: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  date: {
    color: '#94a3b8',
    fontSize: 11,
  },
  preview: {
    marginTop: 6,
    color: '#d1d5db',
    fontSize: 13,
    lineHeight: 19,
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
});
