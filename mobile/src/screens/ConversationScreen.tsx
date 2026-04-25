import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppScreen from '../components/AppScreen';
import {
  ApiError,
  fetchConversation,
  sendMessage,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { FALLBACK_POSTER, type DirectMessage } from '../types';
import { formatDate } from '../utils/format';

export default function ConversationScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'Conversation'>) {
  const { session, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [participantUsername, setParticipantUsername] = useState(route.params.participantUsername ?? 'Conversation');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [keyboardLift, setKeyboardLift] = useState(0);
  const listRef = useRef<FlatList<DirectMessage>>(null);
  const shouldScrollToEndRef = useRef(true);
  const hasLoadedConversationRef = useRef(false);

  const loadConversation = useCallback(async () => {
    if (!session) {
      return;
    }

    try {
      const payload = await fetchConversation(session.token, route.params.conversationId);
      if (!hasLoadedConversationRef.current) {
        shouldScrollToEndRef.current = true;
        hasLoadedConversationRef.current = true;
      }
      setMessages(payload.messages);
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
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      });
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
      void loadConversation();
      const interval = setInterval(() => {
        void loadConversation();
      }, 5000);
      return () => clearInterval(interval);
    }, [loadConversation]),
  );

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      }, 80);
    }
  }, [messages.length]);

  const displayedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const canSend = useMemo(() => draft.trim().length > 0 && !sending, [draft, sending]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!session || !content) {
      return;
    }

    setSending(true);
    try {
      await sendMessage(session.token, route.params.conversationId, { content });
      setDraft('');
      shouldScrollToEndRef.current = true;
      await loadConversation();
    } catch (sendError) {
      if (sendError instanceof ApiError && sendError.status === 401) {
        await signOut();
        return;
      }
      setError('Impossible d envoyer le message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <AppScreen scroll={false} contentStyle={styles.screenContent}>
      <KeyboardAvoidingView style={styles.fill} behavior={undefined}>
        <View style={styles.headerRow}>
          <Pressable style={styles.iconButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color="#ffffff" />
          </Pressable>
          <View style={styles.headerBody}>
            <Text style={styles.headerTitle} numberOfLines={1}>@{participantUsername}</Text>
            <Text style={styles.headerSubtitle}>Discussion privee</Text>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <FlatList
          ref={listRef}
          data={displayedMessages}
          inverted
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            if (shouldScrollToEndRef.current) {
              listRef.current?.scrollToOffset({ offset: 0, animated: false });
              shouldScrollToEndRef.current = false;
            }
          }}
          onLayout={() => {
            if (messages.length > 0) {
              listRef.current?.scrollToOffset({ offset: 0, animated: false });
            }
          }}
          renderItem={({ item }) => (
            <View style={[styles.messageRow, item.is_mine ? styles.messageRowMine : styles.messageRowOther]}>
              {item.movie ? (
                <Pressable
                  style={[styles.sharedMovieCard, item.is_mine ? styles.sharedMovieCardMine : styles.sharedMovieCardOther]}
                  onPress={() => navigation.navigate('MovieDetails', { movieId: item.movie!.id, title: item.movie!.title })}
                >
                  <Image source={{ uri: item.movie.poster_url || FALLBACK_POSTER }} style={styles.sharedMoviePoster} />
                  <View style={styles.sharedMovieBody}>
                    <Text style={styles.sharedMovieLabel}>Film partage</Text>
                    <Text style={styles.sharedMovieTitle} numberOfLines={2}>{item.movie.title}</Text>
                    {item.movie.rating > 0 ? (
                      <Text style={styles.sharedMovieRating}>{item.movie.rating.toFixed(1)} / 10</Text>
                    ) : null}
                  </View>
                  <View style={styles.sharedMovieChevron}>
                    <Ionicons name="chevron-forward" size={16} color="#ffffff" />
                  </View>
                </Pressable>
              ) : null}
              {item.content ? (
                <View style={[styles.bubble, item.is_mine ? styles.bubbleMine : styles.bubbleOther]}>
                  <Text style={[styles.messageText, item.is_mine ? styles.messageTextMine : styles.messageTextOther]}>{item.content}</Text>
                </View>
              ) : null}
              <Text style={[styles.messageMeta, item.is_mine && styles.messageMetaMine]}>{formatDate(item.created_at)}</Text>
            </View>
          )}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Cette conversation est encore vide.</Text>
              </View>
            ) : null
          }
        />

        <View style={[styles.composerRow, { marginBottom: keyboardLift }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ecrire un message"
            placeholderTextColor="#6b7280"
            style={styles.input}
            multiline
          />
          <Pressable style={[styles.sendButton, !canSend && styles.sendButtonDisabled]} onPress={() => void handleSend()} disabled={!canSend}>
            <Ionicons name="arrow-up" size={18} color={canSend ? '#08111f' : '#94a3b8'} />
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
  messageMeta: {
    color: '#94a3b8',
    fontSize: 11,
    paddingHorizontal: 4,
  },
  messageMetaMine: {
    textAlign: 'right',
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
