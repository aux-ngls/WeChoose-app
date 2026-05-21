import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Alert,
  DeviceEventEmitter,
  FlatList,
  Image,
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
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppScreen from '../components/AppScreen';
import {
  ApiError,
  blockUser,
  fetchConversation,
  markConversationRead,
  reportConversation,
  sendMessage,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import { FALLBACK_POSTER, type DirectMessage } from '../types';
import { INBOX_CONVERSATION_EVENT, NOTIFICATIONS_REFRESH_EVENT } from '../utils/events';
import { REPORT_REASONS, type ReportReason } from '../utils/reporting';
import { connectRealtimeSocket } from '../utils/realtime';

type ConversationItem =
  | { type: 'day'; id: string; label: string }
  | { type: 'message'; id: string; message: LocalDirectMessage };

type LocalDirectMessage = DirectMessage & {
  local_client_id?: number;
};

interface ConversationCacheEntry {
  participantId: number | null;
  participantUsername: string;
  messages: LocalDirectMessage[];
}

interface InboxConversationEventPayload {
  type: 'messages.updated';
  conversation_id: number;
  message_id: number;
  sender_id: number;
  sender_username: string;
  preview: string;
  message: DirectMessage;
}

const conversationCache = new Map<string, ConversationCacheEntry>();

function getConversationCacheKey(username: string | undefined, conversationId: number): string {
  return `${username ?? 'anonymous'}:${conversationId}`;
}

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
    if ((serverMessage.reply_to_message?.id ?? null) !== (pendingMessage.reply_to_message?.id ?? null)) {
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

function normalizeRealtimeMessage(message: DirectMessage, currentUsername: string): DirectMessage {
  return {
    ...message,
    is_mine: message.sender.username === currentUsername,
  };
}

function mergeRealtimeMessage(currentMessages: LocalDirectMessage[], incomingMessage: DirectMessage) {
  const normalizedMessage = incomingMessage;
  const existingServerIndex = currentMessages.findIndex((message) => message.id === normalizedMessage.id);
  if (existingServerIndex >= 0) {
    const nextMessages = [...currentMessages];
    nextMessages[existingServerIndex] = {
      ...nextMessages[existingServerIndex],
      ...normalizedMessage,
      local_client_id: nextMessages[existingServerIndex].local_client_id,
    };
    return nextMessages;
  }

  const pendingMatchIndex = currentMessages.findIndex((message) => message.id < 0 && findConfirmedServerMessageIndex(message, [normalizedMessage]) >= 0);
  if (pendingMatchIndex >= 0) {
    const nextMessages = [...currentMessages];
    nextMessages[pendingMatchIndex] = {
      ...normalizedMessage,
      local_client_id: nextMessages[pendingMatchIndex].local_client_id,
    };
    return nextMessages;
  }

  return [...currentMessages, normalizedMessage];
}

function areMessageListsEquivalent(left: LocalDirectMessage[], right: LocalDirectMessage[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((message, index) => {
    const nextMessage = right[index];
    return (
      message.id === nextMessage.id &&
      message.local_client_id === nextMessage.local_client_id &&
      message.content === nextMessage.content &&
      message.created_at === nextMessage.created_at &&
      message.reply_to_message?.id === nextMessage.reply_to_message?.id &&
      message.movie?.id === nextMessage.movie?.id
    );
  });
}

function buildInboxConversationEventPayload(
  conversationId: number,
  message: DirectMessage,
): InboxConversationEventPayload {
  const movieTitle = message.movie?.title?.trim();
  const textPreview = message.content.trim();

  return {
    type: 'messages.updated',
    conversation_id: conversationId,
    message_id: message.id,
    sender_id: message.sender.id,
    sender_username: message.sender.username,
    preview: movieTitle ? `Film partage : ${movieTitle}` : textPreview || 'Nouveau message',
    message,
  };
}

export default function ConversationScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'Conversation'>) {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const cacheKey = getConversationCacheKey(session?.username, route.params.conversationId);
  const initialCache = conversationCache.get(cacheKey);
  const [messages, setMessages] = useState<LocalDirectMessage[]>(() => initialCache?.messages ?? []);
  const [participantUsername, setParticipantUsername] = useState(initialCache?.participantUsername ?? route.params.participantUsername ?? 'Conversation');
  const [participantId, setParticipantId] = useState<number | null>(initialCache?.participantId ?? route.params.participantId ?? null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(() => !initialCache);
  const [sendingMessageIds, setSendingMessageIds] = useState<number[]>([]);
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [error, setError] = useState('');
  const [keyboardLift, setKeyboardLift] = useState(0);
  const [replyTarget, setReplyTarget] = useState<LocalDirectMessage | null>(null);
  const [swipePreviewTarget, setSwipePreviewTarget] = useState<LocalDirectMessage | null>(null);
  const listRef = useRef<FlatList<ConversationItem>>(null);
  const shouldScrollToEndRef = useRef(true);
  const isNearBottomRef = useRef(true);
  const hasLoadedConversationRef = useRef(false);
  const hasInitialConversationLoadedRef = useRef(false);
  const messageCountRef = useRef(0);
  const optimisticMessageIdRef = useRef(-1);
  const loadingConversationRef = useRef(false);
  const participantSnapshotRef = useRef({ participantId, participantUsername });
  const composerBottomGap = keyboardLift > 0 ? keyboardLift : Math.max(insets.bottom, 10);
  const replyBannerOpacity = useRef(new Animated.Value(0)).current;
  const replyBannerTranslateY = useRef(new Animated.Value(10)).current;
  const activeReplyTarget = swipePreviewTarget ?? replyTarget;

  useEffect(() => {
    participantSnapshotRef.current = { participantId, participantUsername };
  }, [participantId, participantUsername]);

  const scrollToLatestMessage = useCallback((animated = false) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated });
    });
  }, []);

  const loadConversation = useCallback(async () => {
    if (!session || loadingConversationRef.current) {
      return;
    }

    loadingConversationRef.current = true;
    try {
      const payload = await fetchConversation(session.token, route.params.conversationId, { limit: 40 });
      const hasNewMessages = payload.messages.length > messageCountRef.current;
      if (!hasLoadedConversationRef.current) {
        shouldScrollToEndRef.current = true;
        hasLoadedConversationRef.current = true;
      } else if (hasNewMessages && isNearBottomRef.current) {
        shouldScrollToEndRef.current = true;
      }
      messageCountRef.current = payload.messages.length;
      const nextParticipantUsername = payload.conversation.participant.username;
      const nextParticipantId = payload.conversation.participant.id;
      setMessages((current) => {
        const mergedMessages = mergeServerMessages(current, payload.messages);
        conversationCache.set(cacheKey, {
          participantId: nextParticipantId,
          participantUsername: nextParticipantUsername,
          messages: mergedMessages,
        });
        return areMessageListsEquivalent(current, mergedMessages) ? current : mergedMessages;
      });
      setParticipantUsername((current) => (current === nextParticipantUsername ? current : nextParticipantUsername));
      setParticipantId((current) => (current === nextParticipantId ? current : nextParticipantId));
      hasInitialConversationLoadedRef.current = true;
      setError('');
      DeviceEventEmitter.emit(NOTIFICATIONS_REFRESH_EVENT);
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de charger cette conversation.');
    } finally {
      loadingConversationRef.current = false;
      setLoading(false);
    }
  }, [cacheKey, route.params.conversationId, session, signOut]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardLift(Math.max(0, event.endCoordinates.height + 10));
      scrollToLatestMessage(true);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardLift(0));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [scrollToLatestMessage]);

  useEffect(() => {
    if (!activeReplyTarget) {
      return;
    }

    replyBannerOpacity.stopAnimation();
    replyBannerTranslateY.stopAnimation();
    replyBannerOpacity.setValue(0);
    replyBannerTranslateY.setValue(10);
    Animated.parallel([
      Animated.timing(replyBannerOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(replyBannerTranslateY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeReplyTarget?.id, replyBannerOpacity, replyBannerTranslateY]);

  useEffect(() => {
    const cachedConversation = conversationCache.get(cacheKey);
    setMessages(cachedConversation?.messages ?? []);
    setParticipantUsername(cachedConversation?.participantUsername ?? route.params.participantUsername ?? 'Conversation');
    setParticipantId(cachedConversation?.participantId ?? route.params.participantId ?? null);
    hasInitialConversationLoadedRef.current = Boolean(cachedConversation);
    messageCountRef.current = cachedConversation?.messages.length ?? 0;
    setLoading(!cachedConversation);
  }, [cacheKey, route.params.conversationId, route.params.participantId, route.params.participantUsername]);

  useEffect(() => {
    if (!session) {
      return undefined;
    }

    return connectRealtimeSocket({
      token: session.token,
      onMessage: (rawPayload) => {
        const payload = rawPayload as { type?: string; conversation_id?: number; message?: DirectMessage };
        if (payload.type === 'messages.updated' && payload.conversation_id === route.params.conversationId) {
          if (payload.message) {
            const realtimeMessage = normalizeRealtimeMessage(payload.message, session.username);
            DeviceEventEmitter.emit(
              INBOX_CONVERSATION_EVENT,
              buildInboxConversationEventPayload(route.params.conversationId, realtimeMessage),
            );
            const participantSnapshot = participantSnapshotRef.current;
            shouldScrollToEndRef.current = true;
            isNearBottomRef.current = true;
            setMessages((current) => {
              const nextMessages = mergeRealtimeMessage(current, realtimeMessage);
              conversationCache.set(cacheKey, {
                participantId: participantSnapshot.participantId,
                participantUsername: participantSnapshot.participantUsername,
                messages: nextMessages,
              });
              return areMessageListsEquivalent(current, nextMessages) ? current : nextMessages;
            });
            if (!realtimeMessage.is_mine) {
              void markConversationRead(session.token, route.params.conversationId).then(() => {
                DeviceEventEmitter.emit(NOTIFICATIONS_REFRESH_EVENT);
              }).catch(() => {
                void loadConversation();
              });
            }
            return;
          }
          void loadConversation();
        }
      },
    });
  }, [cacheKey, loadConversation, route.params.conversationId, session]);

  useFocusEffect(
    useCallback(() => {
      if (!hasInitialConversationLoadedRef.current) {
        setLoading(true);
      }
      hasLoadedConversationRef.current = false;
      shouldScrollToEndRef.current = true;
      isNearBottomRef.current = true;
      messageCountRef.current = 0;
      void loadConversation();
      const interval = setInterval(() => {
        void loadConversation();
      }, 45000);
      return () => clearInterval(interval);
    }, [loadConversation]),
  );

  useEffect(() => {
    if (messages.length > 0 && shouldScrollToEndRef.current) {
      scrollToLatestMessage(false);
      shouldScrollToEndRef.current = false;
    }
  }, [messages.length, scrollToLatestMessage]);

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

  const displayedConversationItems = useMemo(
    () => [...conversationItems].reverse(),
    [conversationItems],
  );

  const canSend = useMemo(() => draft.trim().length > 0, [draft]);

  const handleReportConversation = useCallback(async (reason: ReportReason) => {
    if (!session || safetyLoading) {
      return;
    }

    setSafetyLoading(true);
    try {
      await reportConversation(session.token, route.params.conversationId, { reason });
      Alert.alert('Signalement envoyé', 'Merci, la conversation a été signalée.');
      setError('');
    } catch (reportError) {
      if (reportError instanceof ApiError && reportError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de signaler cette conversation.');
    } finally {
      setSafetyLoading(false);
    }
  }, [route.params.conversationId, safetyLoading, session, signOut]);

  const presentReportReasonPicker = useCallback(() => {
    Alert.alert(
      'Signaler la conversation',
      'Choisis une raison.',
      [
        ...REPORT_REASONS.map((reason) => ({
          text: reason.label,
          onPress: () => void handleReportConversation(reason.value),
        })),
        { text: 'Annuler', style: 'cancel' as const },
      ],
    );
  }, [handleReportConversation]);

  const handleBlockParticipant = useCallback(async () => {
    if (!session || !participantId || safetyLoading) {
      return;
    }

    setSafetyLoading(true);
    try {
      await blockUser(session.token, participantId);
      Alert.alert('Compte bloqué', 'Ce compte a été masqué dans le social et les messages.');
      navigation.goBack();
    } catch (blockError) {
      if (blockError instanceof ApiError && blockError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible de bloquer ce compte.');
    } finally {
      setSafetyLoading(false);
    }
  }, [navigation, participantId, safetyLoading, session, signOut]);

  const openConversationSafetyMenu = useCallback(() => {
    Alert.alert(
      `@${participantUsername}`,
      'Choisis une action.',
      [
        {
          text: 'Voir le profil',
          onPress: () => {
            if (participantUsername !== 'Conversation') {
              navigation.navigate('UserProfile', { username: participantUsername });
            }
          },
        },
        {
          text: 'Signaler',
          onPress: presentReportReasonPicker,
        },
        {
          text: 'Bloquer',
          style: 'destructive',
          onPress: () => void handleBlockParticipant(),
        },
        { text: 'Annuler', style: 'cancel' },
      ],
    );
  }, [handleBlockParticipant, navigation, participantUsername, presentReportReasonPicker]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!session || !content) {
      return;
    }

    const replySnapshot = replyTarget;
    const replyToMessageId = replySnapshot && replySnapshot.id > 0 ? replySnapshot.id : undefined;
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
      reply_to_message: replySnapshot ? {
        id: replySnapshot.id,
        content: replySnapshot.content,
        sender: replySnapshot.sender,
        movie: replySnapshot.movie,
      } : null,
    };

    setDraft('');
    setReplyTarget(null);
    setSwipePreviewTarget(null);
    setSendingMessageIds((current) => [...current, optimisticId]);
    shouldScrollToEndRef.current = true;
    isNearBottomRef.current = true;
    setMessages((current) => {
      const nextMessages = [...current, optimisticMessage];
      conversationCache.set(cacheKey, {
        participantId,
        participantUsername,
        messages: nextMessages,
      });
      return nextMessages;
    });

    try {
      const createdMessage = await sendMessage(session.token, route.params.conversationId, {
        content,
        reply_to_message_id: replyToMessageId,
      });
      const confirmedMessage: LocalDirectMessage = {
        ...createdMessage,
        local_client_id: optimisticId,
      };
      setMessages((current) => {
        const nextMessages = current.map((message) => (message.id === optimisticId ? confirmedMessage : message));
        conversationCache.set(cacheKey, {
          participantId,
          participantUsername,
          messages: nextMessages,
        });
        return nextMessages;
      });
      DeviceEventEmitter.emit(
        INBOX_CONVERSATION_EVENT,
        buildInboxConversationEventPayload(route.params.conversationId, confirmedMessage),
      );
      shouldScrollToEndRef.current = true;
      setError('');
      DeviceEventEmitter.emit(NOTIFICATIONS_REFRESH_EVENT);
    } catch (sendError) {
      setMessages((current) => {
        const nextMessages = current.filter((message) => message.id !== optimisticId);
        conversationCache.set(cacheKey, {
          participantId,
          participantUsername,
          messages: nextMessages,
        });
        return nextMessages;
      });
      if (sendError instanceof ApiError && sendError.status === 401) {
        await signOut();
        return;
      }
      setReplyTarget(replySnapshot);
      setSwipePreviewTarget(replySnapshot);
      setDraft((current) => (current.trim().length > 0 ? current : content));
      setError("Impossible d'envoyer le message.");
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
            <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>Discussion privée</Text>
          </Pressable>
          <Pressable
            style={[styles.iconButton, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
            onPress={openConversationSafetyMenu}
            disabled={safetyLoading}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.text} />
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <FlatList
          ref={listRef}
          data={displayedConversationItems}
          inverted
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          initialNumToRender={18}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={16}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={(event) => {
            isNearBottomRef.current = event.nativeEvent.contentOffset.y < 90;
          }}
          scrollEventThrottle={80}
          onContentSizeChange={() => {
            if (shouldScrollToEndRef.current) {
              scrollToLatestMessage(false);
              shouldScrollToEndRef.current = false;
            }
          }}
          onLayout={() => {
            if (messages.length > 0 && shouldScrollToEndRef.current) {
              scrollToLatestMessage(false);
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
            let swipeableRef: Swipeable | null = null;
            return (
              <Swipeable
                ref={(value) => {
                  swipeableRef = value;
                }}
                overshootLeft={false}
                leftThreshold={28}
                friction={1.45}
                renderLeftActions={(progress, dragX) => {
                  const translateX = dragX.interpolate({
                    inputRange: [0, 72],
                    outputRange: [-14, 0],
                    extrapolate: 'clamp',
                  });
                  const opacity = progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1],
                    extrapolate: 'clamp',
                  });

                  return (
                    <Animated.View
                      style={[
                        styles.replySwipeHint,
                        {
                          opacity,
                          transform: [{ translateX }],
                        },
                      ]}
                    >
                      <Ionicons name="return-up-back-outline" size={18} color={theme.colors.secondaryAccent} />
                    </Animated.View>
                  );
                }}
                onSwipeableOpenStartDrag={() => {
                  setSwipePreviewTarget(message);
                }}
                onSwipeableWillOpen={() => {
                  setReplyTarget(message);
                  setSwipePreviewTarget(message);
                }}
                onSwipeableOpen={() => {
                  swipeableRef?.close();
                }}
                onSwipeableClose={() => {
                  setSwipePreviewTarget((current) => {
                    if (current?.id !== message.id) {
                      return current;
                    }
                    return replyTarget?.id === message.id ? current : null;
                  });
                }}
              >
                <View style={[styles.messageRow, message.is_mine ? styles.messageRowMine : styles.messageRowOther]}>
                  {message.reply_to_message ? (
                    <View
                      style={[
                        styles.replyBubble,
                        message.is_mine
                          ? [styles.replyBubbleMine, { backgroundColor: theme.colors.accentSoft }]
                          : [styles.replyBubbleOther, { backgroundColor: theme.rgba.card }],
                      ]}
                    >
                      <Text style={[styles.replyBubbleAuthor, { color: message.is_mine ? theme.colors.accent : theme.colors.secondaryAccent }]}>
                        @{message.reply_to_message.sender.username}
                      </Text>
                      <Text style={[styles.replyBubblePreview, { color: theme.colors.textSoft }]} numberOfLines={2}>
                        {message.reply_to_message.content || message.reply_to_message.movie?.title || 'Film partagé'}
                      </Text>
                    </View>
                  ) : null}
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
                        <Text style={[styles.sharedMovieLabel, { color: theme.colors.accent }]}>Film partagé</Text>
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
              </Swipeable>
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

        {activeReplyTarget ? (
          <Animated.View
            style={[
              styles.replyComposerBannerWrap,
              {
                opacity: replyBannerOpacity,
                transform: [{ translateY: replyBannerTranslateY }],
              },
            ]}
          >
          <View style={[styles.replyComposerBanner, { borderColor: theme.colors.secondaryAccent, backgroundColor: theme.rgba.cardStrong }]}>
            <View style={styles.replyComposerBody}>
              <Text style={[styles.replyComposerTitle, { color: theme.colors.secondaryAccent }]}>Réponse à @{activeReplyTarget.sender.username}</Text>
              <Text style={[styles.replyComposerPreview, { color: theme.colors.textMuted }]} numberOfLines={2}>
                {activeReplyTarget.content || activeReplyTarget.movie?.title || 'Film partagé'}
              </Text>
            </View>
            <Pressable onPress={() => {
              setReplyTarget(null);
              setSwipePreviewTarget(null);
            }}>
              <Ionicons name="close" size={18} color={theme.colors.textMuted} />
            </Pressable>
          </View>
          </Animated.View>
        ) : null}

        <View style={[styles.composerRow, { marginBottom: composerBottomGap }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={replyTarget ? `Répondre à @${replyTarget.sender.username}` : 'Écrire un message'}
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
  replyBubble: {
    maxWidth: 248,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  replyBubbleMine: {
    alignSelf: 'flex-end',
  },
  replyBubbleOther: {
    alignSelf: 'flex-start',
  },
  replyBubbleAuthor: {
    fontSize: 11,
    fontWeight: '900',
  },
  replyBubblePreview: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  replySwipeHint: {
    width: 28,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
  replyComposerBannerWrap: {
    overflow: 'hidden',
  },
  replyComposerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  replyComposerBody: {
    flex: 1,
    gap: 2,
  },
  replyComposerTitle: {
    fontSize: 12,
    fontWeight: '900',
  },
  replyComposerPreview: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
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
