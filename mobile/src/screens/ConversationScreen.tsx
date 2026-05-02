import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppScreen from '../components/AppScreen';
import {
  ApiError,
  fetchConversation,
  sendMessage,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import { FALLBACK_POSTER, type DirectMessage } from '../types';

type ConversationItem =
  | { type: 'day'; id: string; label: string }
  | { type: 'message'; id: string; message: LocalDirectMessage };

type LocalDirectMessage = DirectMessage & {
  local_client_id?: number;
};

function getLocalDayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDayLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const dayKey = getLocalDayKey(value);

  if (dayKey === getLocalDayKey(today.toISOString())) {
    return "Aujourd'hui";
  }
  if (dayKey === getLocalDayKey(yesterday.toISOString())) {
    return 'Hier';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

function findConfirmedServerMessageIndex(pendingMessage: LocalDirectMessage, serverMessages: LocalDirectMessage[]) {
  const pendingCreatedAt = new Date(pendingMessage.created_at).getTime();

  return serverMessages.findIndex((serverMessage) => {
    if (!serverMessage.is_mine || serverMessage.content !== pendingMessage.content) {
      return false;
    }
    if (serverMessage.movie || pendingMessage.movie) {
      return serverMessage.movie?.id === pendingMessage.movie?.id;
    }

    const serverCreatedAt = new Date(serverMessage.created_at).getTime();
    if (Number.isNaN(pendingCreatedAt) || Number.isNaN(serverCreatedAt)) {
      return true;
    }

    return Math.abs(serverCreatedAt - pendingCreatedAt) < 120000;
  });
}

function mergeServerMessages(currentMessages: LocalDirectMessage[], serverMessages: DirectMessage[]) {
  const currentByServerId = new Map(
    currentMessages
      .filter((message) => message.id > 0)
      .map((message) => [message.id, message]),
  );
  const mergedServerMessages: LocalDirectMessage[] = serverMessages.map((serverMessage) => {
    const existingMessage = currentByServerId.get(serverMessage.id);
    return existingMessage?.local_client_id
      ? { ...serverMessage, local_client_id: existingMessage.local_client_id }
      : serverMessage;
  });
  const unmatchedServerMessages = [...mergedServerMessages];
  const pendingMessages = currentMessages.filter((message) => message.id < 0);
  const stillPendingMessages = pendingMessages.filter((pendingMessage) => {
    const confirmedIndex = findConfirmedServerMessageIndex(pendingMessage, unmatchedServerMessages);
    if (confirmedIndex >= 0) {
      unmatchedServerMessages[confirmedIndex].local_client_id = pendingMessage.local_client_id;
      unmatchedServerMessages.splice(confirmedIndex, 1);
      return false;
    }
    return true;
  });

  return [...mergedServerMessages, ...stillPendingMessages];
}

export default function ConversationScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'Conversation'>) {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<LocalDirectMessage[]>([]);
  const [participantUsername, setParticipantUsername] = useState(route.params.participantUsername ?? 'Conversation');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendingMessageIds, setSendingMessageIds] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [keyboardLift, setKeyboardLift] = useState(0);
  const listRef = useRef<FlatList<ConversationItem>>(null);
  const shouldScrollToEndRef = useRef(true);
  const isNearBottomRef = useRef(true);
  const hasLoadedConversationRef = useRef(false);
  const messageCountRef = useRef(0);
  const optimisticMessageIdRef = useRef(-1);
  const scrollTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearScheduledScrolls = useCallback(() => {
    scrollTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    scrollTimeoutsRef.current = [];
  }, []);

  const scrollToLatestMessage = useCallback((animated = false) => {
    listRef.current?.scrollToEnd({ animated });
  }, []);

  const scheduleScrollToLatestMessage = useCallback((animated = false) => {
    clearScheduledScrolls();
    requestAnimationFrame(() => scrollToLatestMessage(animated));
    InteractionManager.runAfterInteractions(() => scrollToLatestMessage(animated));
    scrollTimeoutsRef.current = [80, 180, 360, 700].map((delay) =>
      setTimeout(() => scrollToLatestMessage(animated), delay),
    );
  }, [clearScheduledScrolls, scrollToLatestMessage]);

  const loadConversation = useCallback(async () => {
    if (!session) {
      return;
    }

    try {
      const payload = await fetchConversation(session.token, route.params.conversationId);
      const hasNewMessages = payload.messages.length > messageCountRef.current;
      if (!hasLoadedConversationRef.current) {
        shouldScrollToEndRef.current = true;
        hasLoadedConversationRef.current = true;
      } else if (hasNewMessages && isNearBottomRef.current) {
        shouldScrollToEndRef.current = true;
      }
      messageCountRef.current = payload.messages.length;
      setMessages((current) => mergeServerMessages(current, payload.messages));
      setParticipantUsername(payload.conversation.participant.username);
      setError('');
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de charger cette conversation.');
    } finally {
      setLoading(false);
    }
  }, [route.params.conversationId, session, signOut]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardLift(Math.max(0, event.endCoordinates.height - insets.bottom + 12));
      scheduleScrollToLatestMessage(true);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardLift(0));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      hasLoadedConversationRef.current = false;
      shouldScrollToEndRef.current = true;
      isNearBottomRef.current = true;
      messageCountRef.current = 0;
      void loadConversation();
      const interval = setInterval(() => {
        void loadConversation();
      }, 5000);
      return () => {
        clearInterval(interval);
        clearScheduledScrolls();
      };
    }, [clearScheduledScrolls, loadConversation]),
  );

  useEffect(() => {
    if (messages.length > 0 && shouldScrollToEndRef.current) {
      scheduleScrollToLatestMessage(false);
      shouldScrollToEndRef.current = false;
    }
  }, [messages.length, scheduleScrollToLatestMessage]);

  const conversationItems = useMemo<ConversationItem[]>(() => {
    const items: ConversationItem[] = [];
    let currentDayKey = '';

    messages.forEach((message) => {
      const dayKey = getLocalDayKey(message.created_at);
      if (dayKey !== currentDayKey) {
        currentDayKey = dayKey;
        items.push({
          type: 'day',
          id: `day-${dayKey}`,
          label: formatDayLabel(message.created_at),
        });
      }
      items.push({
        type: 'message',
        id: `message-${message.local_client_id ?? message.id}`,
        message,
      });
    });

    return items;
  }, [messages]);

  const canSend = useMemo(() => draft.trim().length > 0, [draft]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!session || !content) {
      return;
    }

    const optimisticId = optimisticMessageIdRef.current;
    optimisticMessageIdRef.current -= 1;
    const optimisticMessage: LocalDirectMessage = {
      id: optimisticId,
      local_client_id: optimisticId,
      content,
      created_at: new Date().toISOString(),
      is_mine: true,
      sender: {
        id: 0,
        username: session.username,
      },
      movie: null,
    };

    setDraft('');
    setSendingMessageIds((current) => [...current, optimisticId]);
    shouldScrollToEndRef.current = true;
    isNearBottomRef.current = true;
    setMessages((current) => [...current, optimisticMessage]);

    try {
      const createdMessage = await sendMessage(session.token, route.params.conversationId, { content });
      const confirmedMessage: LocalDirectMessage = {
        ...createdMessage,
        local_client_id: optimisticId,
      };
      setMessages((current) =>
        current.map((message) => (message.id === optimisticId ? confirmedMessage : message)),
      );
      shouldScrollToEndRef.current = true;
      setError('');
    } catch (sendError) {
      setMessages((current) => current.filter((message) => message.id !== optimisticId));
      if (sendError instanceof ApiError && sendError.status === 401) {
        await signOut();
        return;
      }
      setDraft((current) => (current.trim().length > 0 ? current : content));
      setError('Impossible d envoyer le message.');
    } finally {
      setSendingMessageIds((current) => current.filter((id) => id !== optimisticId));
    }
  };

  return (
    <AppScreen scroll={false} contentStyle={styles.screenContent}>
      <KeyboardAvoidingView style={styles.fill} behavior={undefined}>
        <View style={styles.headerRow}>
          <Pressable style={[styles.iconButton, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </Pressable>
          <Pressable
            style={styles.headerBody}
            onPress={() => {
              if (participantUsername !== 'Conversation') {
                navigation.navigate('UserProfile', { username: participantUsername });
              }
            }}
          >
            <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>@{participantUsername}</Text>
            <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>Discussion privee</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <FlatList
          ref={listRef}
          data={conversationItems}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            isNearBottomRef.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 90;
          }}
          scrollEventThrottle={80}
          onContentSizeChange={() => {
            if (shouldScrollToEndRef.current) {
              scheduleScrollToLatestMessage(false);
              shouldScrollToEndRef.current = false;
            }
          }}
          onLayout={() => {
            if (messages.length > 0 && shouldScrollToEndRef.current) {
              scheduleScrollToLatestMessage(false);
              shouldScrollToEndRef.current = false;
            }
          }}
          renderItem={({ item }) => {
            if (item.type === 'day') {
              return (
                <View style={styles.daySeparatorWrap}>
                  <View style={[styles.daySeparator, { backgroundColor: theme.rgba.cardStrong }]}>
                    <Text style={[styles.daySeparatorLabel, { color: theme.colors.textMuted }]}>{item.label}</Text>
                  </View>
                </View>
              );
            }

            const message = item.message;
            const isSending = sendingMessageIds.includes(message.id);
            return (
              <View style={[styles.messageRow, message.is_mine ? styles.messageRowMine : styles.messageRowOther]}>
                {message.movie ? (
                  <Pressable
                    style={[
                      styles.sharedMovieCard,
                      message.is_mine
                        ? [styles.sharedMovieCardMine, { borderColor: theme.colors.accentSoft, backgroundColor: theme.colors.accentSoft }]
                        : [styles.sharedMovieCardOther, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }],
                    ]}
                    onPress={() => navigation.navigate('MovieDetails', { movieId: message.movie!.id, title: message.movie!.title })}
                  >
                    <Image source={{ uri: message.movie.poster_url || FALLBACK_POSTER }} style={styles.sharedMoviePoster} />
                    <View style={styles.sharedMovieBody}>
                      <Text style={[styles.sharedMovieLabel, { color: theme.colors.accent }]}>Film partage</Text>
                      <Text style={[styles.sharedMovieTitle, { color: theme.colors.text }]} numberOfLines={2}>{message.movie.title}</Text>
                      {message.movie.rating > 0 ? (
                        <Text style={[styles.sharedMovieRating, { color: theme.colors.ratingText }]}>{message.movie.rating.toFixed(1)} / 10</Text>
                      ) : null}
                    </View>
                    <View style={styles.sharedMovieChevron}>
                      <Ionicons name="chevron-forward" size={16} color={theme.colors.text} />
                    </View>
                  </Pressable>
                ) : null}
                {message.content ? (
                  <View
                    style={[
                      styles.bubble,
                      message.is_mine ? [styles.bubbleMine, { backgroundColor: theme.colors.accent }] : [styles.bubbleOther, { backgroundColor: theme.rgba.cardStrong }],
                      isSending && styles.bubbleSending,
                    ]}
                  >
                    <Text style={[styles.messageText, message.is_mine ? [styles.messageTextMine, { color: theme.colors.accentText }] : [styles.messageTextOther, { color: theme.colors.text }]]}>{message.content}</Text>
                  </View>
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>Cette conversation est encore vide.</Text>
              </View>
            ) : null
          }
        />

        <View style={[styles.composerRow, { marginBottom: keyboardLift }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ecrire un message"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.cardStrong, color: theme.colors.text }]}
            multiline
          />
          <Pressable style={[styles.sendButton, { backgroundColor: theme.colors.secondaryAccent }, !canSend && { backgroundColor: theme.rgba.cardStrong }]} onPress={() => void handleSend()} disabled={!canSend}>
            <Ionicons name="arrow-up" size={18} color={canSend ? theme.colors.secondaryAccentText : theme.colors.textMuted} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    paddingBottom: 0,
  },
  fill: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBody: { flex: 1 },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  headerSubtitle: {
    marginTop: 2,
    color: '#94a3b8',
    fontSize: 12,
  },
  listContent: {
    flexGrow: 1,
    gap: 12,
    paddingVertical: 12,
    paddingBottom: 18,
    justifyContent: 'flex-end',
  },
  daySeparatorWrap: {
    alignItems: 'center',
    marginVertical: 4,
  },
  daySeparator: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  daySeparatorLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  messageRow: {
    gap: 6,
    maxWidth: '88%',
  },
  messageRowMine: {
    alignSelf: 'flex-end',
  },
  messageRowOther: {
    alignSelf: 'flex-start',
  },
  bubble: {
    borderRadius: 24,
    padding: 14,
    gap: 10,
  },
  bubbleMine: {
    backgroundColor: '#f472b6',
    borderBottomRightRadius: 8,
  },
  bubbleOther: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderBottomLeftRadius: 8,
  },
  bubbleSending: {
    opacity: 0.62,
  },
  sharedMovieCard: {
    width: 248,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 22,
    borderWidth: 1,
    padding: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  sharedMovieCardMine: {
    borderColor: 'rgba(244,114,182,0.28)',
    backgroundColor: 'rgba(244,114,182,0.18)',
  },
  sharedMovieCardOther: {
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
  sharedMoviePoster: {
    width: 54,
    height: 78,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  sharedMovieBody: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  sharedMovieLabel: {
    color: '#f9a8d4',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sharedMovieTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  sharedMovieRating: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '800',
  },
  sharedMovieChevron: {
    width: 26,
    height: 26,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  messageTextMine: {
    color: '#200914',
  },
  messageTextOther: {
    color: '#f8fafc',
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 8 : 10,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    color: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: '#7dd3fc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  error: {
    color: '#fda4af',
    fontSize: 13,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
  },
});
