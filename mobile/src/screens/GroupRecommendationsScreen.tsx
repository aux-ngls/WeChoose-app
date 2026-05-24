import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { API_URL } from '../api/config';
import AppScreen from '../components/AppScreen';
import EmptyStateCard from '../components/EmptyStateCard';
import InlineBanner from '../components/InlineBanner';
import SearchField from '../components/SearchField';
import {
  ApiError,
  fetchSocialGroupRecommendations,
  searchSocialUsers,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import { FALLBACK_POSTER, type SearchMovie, type SocialUser } from '../types';

function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `${API_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

export default function GroupRecommendationsScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'GroupRecommendations'>) {
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [userResults, setUserResults] = useState<SocialUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<SocialUser[]>([]);
  const [recommendations, setRecommendations] = useState<SearchMovie[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [includeSeen, setIncludeSeen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) {
      return;
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setUserResults([]);
      setSearchLoading(false);
      return;
    }

    const handle = setTimeout(() => {
      void (async () => {
        setSearchLoading(true);
        try {
          const payload = await searchSocialUsers(session.token, trimmedQuery);
          setUserResults(payload.filter((user) => !selectedUsers.some((entry) => entry.id === user.id)));
          setError('');
        } catch (searchError) {
          if (searchError instanceof ApiError && searchError.status === 401) {
            await signOut();
            return;
          }
          setError('Impossible de rechercher des profils.');
        } finally {
          setSearchLoading(false);
        }
      })();
    }, 220);

    return () => clearTimeout(handle);
  }, [query, selectedUsers, session, signOut]);

  const loadRecommendations = useCallback(async () => {
    if (!session || selectedUsers.length === 0) {
      return;
    }

    setRecommendationLoading(true);
    try {
      const payload = await fetchSocialGroupRecommendations(
        session.token,
        selectedUsers.map((user) => user.id),
        14,
        includeSeen,
      );
      setRecommendations(payload);
      setError('');
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        await signOut();
        return;
      }
      setError(fetchError instanceof ApiError ? fetchError.message : 'Impossible de trouver des films pour ce groupe.');
    } finally {
      setRecommendationLoading(false);
      setRefreshing(false);
    }
  }, [includeSeen, selectedUsers, session, signOut]);

  const headerSummary = useMemo(() => {
    if (selectedUsers.length === 0) {
      return 'Ajoute au moins une personne. Tes propres gouts sont inclus automatiquement.';
    }
    return `Toi + ${selectedUsers.length} personne${selectedUsers.length > 1 ? 's' : ''}`;
  }, [selectedUsers.length]);

  return (
    <AppScreen scroll={false} contentStyle={{ flex: 1 }}>
      <FlatList
        data={recommendations}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              if (selectedUsers.length === 0) {
                return;
              }
              setRefreshing(true);
              void loadRecommendations();
            }}
            enabled={selectedUsers.length > 0}
            tintColor={theme.colors.text}
            colors={[theme.colors.secondaryAccent]}
            progressViewOffset={16}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.headerRow}>
              <Pressable
                style={[styles.iconButton, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
                onPress={() => navigation.goBack()}
              >
                <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
              </Pressable>
              <View style={styles.headerCenter}>
                <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Soiree groupe</Text>
                <Text style={[styles.headerMeta, { color: theme.colors.textMuted }]}>{headerSummary}</Text>
              </View>
              <View style={styles.iconSpacer} />
            </View>

            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Chercher des profils"
              icon="people-outline"
            />

            {selectedUsers.length > 0 ? (
              <View style={styles.selectionWrap}>
                {selectedUsers.map((user) => (
                  <Pressable
                    key={user.id}
                    style={[styles.selectionChip, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
                    onPress={() => {
                      setSelectedUsers((current) => current.filter((entry) => entry.id !== user.id));
                      setRecommendations((current) => current);
                    }}
                  >
                    <Text style={[styles.selectionChipLabel, { color: theme.colors.text }]}>@{user.username}</Text>
                    <Ionicons name="close" size={14} color={theme.colors.textSoft} />
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Pressable
              style={[styles.optionRow, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
              onPress={() => {
                setIncludeSeen((current) => !current);
                setRecommendations([]);
              }}
            >
              <View style={[styles.checkbox, { borderColor: includeSeen ? theme.colors.accent : theme.rgba.border, backgroundColor: includeSeen ? theme.colors.accent : 'transparent' }]}>
                {includeSeen ? <Ionicons name="checkmark" size={14} color={theme.colors.accentText} /> : null}
              </View>
              <View style={styles.optionBody}>
                <Text style={[styles.optionTitle, { color: theme.colors.text }]}>Afficher les films deja vus</Text>
                <Text style={[styles.optionSubtitle, { color: theme.colors.textMuted }]}>Utile si ce n'est pas grave qu'une personne l'ait deja note.</Text>
              </View>
            </Pressable>

            <Pressable
              style={[
                styles.ctaButton,
                { backgroundColor: theme.colors.accent },
                selectedUsers.length === 0 && { opacity: 0.45 },
              ]}
              onPress={() => void loadRecommendations()}
              disabled={selectedUsers.length === 0 || recommendationLoading}
            >
              {recommendationLoading ? (
                <ActivityIndicator color={theme.colors.accentText} />
              ) : (
                <>
                  <Ionicons name="sparkles-outline" size={18} color={theme.colors.accentText} />
                  <Text style={[styles.ctaButtonLabel, { color: theme.colors.accentText }]}>Trouver des films pour nous</Text>
                </>
              )}
            </Pressable>

            {error ? <InlineBanner message={error} tone="error" /> : null}

            {searchLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={theme.colors.text} />
              </View>
            ) : null}

            {userResults.length > 0 ? (
              <View style={styles.resultsBlock}>
                <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Profils</Text>
                {userResults.map((user) => {
                  const avatarUrl = resolveMediaUrl(user.avatar_url);
                  return (
                    <Pressable
                      key={user.id}
                      style={[styles.userCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
                      onPress={() => {
                        setSelectedUsers((current) => [...current, user]);
                        setUserResults((current) => current.filter((entry) => entry.id !== user.id));
                        setQuery('');
                        setError('');
                      }}
                    >
                      {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatarFallback, { backgroundColor: theme.colors.accentSoft }]}>
                          <Text style={[styles.avatarInitial, { color: theme.colors.accent }]}>
                            {user.username.slice(0, 1).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={styles.userCardBody}>
                        <Text style={[styles.userCardTitle, { color: theme.colors.text }]}>@{user.username}</Text>
                        <Text style={[styles.userCardMeta, { color: theme.colors.textMuted }]}>
                          {user.reviews_count} critiques · {user.followers_count} abonnes
                        </Text>
                      </View>
                      <Ionicons name="add-circle-outline" size={20} color={theme.colors.secondaryAccent} />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.movieCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
            onPress={() => navigation.navigate('MovieDetails', { movieId: item.id, title: item.title })}
          >
            <Image source={{ uri: item.poster_url || FALLBACK_POSTER }} style={styles.poster} />
            <View style={styles.movieBody}>
              <Text style={[styles.movieTitle, { color: theme.colors.text }]} numberOfLines={2}>
                {item.title}
              </Text>
              <View style={styles.metaRow}>
                {typeof item.group_match_score === 'number' ? (
                  <View style={[styles.matchPill, { backgroundColor: theme.colors.accentSoft }]}>
                    <Text style={[styles.matchPillLabel, { color: theme.colors.accent }]}>
                      {item.group_match_score}% minimum
                    </Text>
                  </View>
                ) : null}
                <View style={[styles.ratingPill, { backgroundColor: theme.colors.ratingBackground }]}>
                  <Text style={[styles.ratingPillLabel, { color: theme.colors.ratingText }]}>
                    {item.rating.toFixed(1)} / 10
                  </Text>
                </View>
                {item.primary_genre ? (
                  <Text style={[styles.genreLabel, { color: theme.colors.textSoft }]}>{item.primary_genre}</Text>
                ) : null}
              </View>
              <Text style={[styles.reasonLabel, { color: theme.colors.textMuted }]} numberOfLines={3}>
                {item.recommendation_reason ?? 'Film recommande pour le groupe.'}
              </Text>
              {item.group_member_scores?.length ? (
                <View style={styles.memberScores}>
                  {item.group_member_scores.map((score) => (
                    <View key={score.user_id} style={[styles.memberScorePill, { backgroundColor: theme.rgba.cardStrong }]}>
                      <Text style={[styles.memberScoreLabel, { color: theme.colors.textSoft }]}>
                        @{score.username} {score.percent}%{score.has_seen ? ' vu' : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          !recommendationLoading ? (
            <EmptyStateCard
              title={selectedUsers.length === 0 ? 'Choisis ton groupe' : 'Pas encore de suggestions'}
              subtitle={selectedUsers.length === 0 ? 'Ajoute des profils pour lancer la recherche.' : 'Lance la recherche pour voir les films compatibles.'}
            />
          ) : null
        }
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 28,
    gap: 12,
  },
  headerBlock: {
    gap: 14,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSpacer: {
    width: 42,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  headerMeta: {
    fontSize: 12,
    textAlign: 'center',
  },
  selectionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectionChipLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBody: {
    flex: 1,
    gap: 3,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  optionSubtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  ctaButton: {
    minHeight: 52,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  ctaButtonLabel: {
    fontSize: 15,
    fontWeight: '800',
  },
  loadingWrap: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  resultsBlock: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: '800',
  },
  userCardBody: {
    flex: 1,
    gap: 4,
  },
  userCardTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  userCardMeta: {
    fontSize: 12,
  },
  movieCard: {
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderRadius: 22,
    overflow: 'hidden',
    padding: 10,
  },
  poster: {
    width: 92,
    aspectRatio: 2 / 3,
    borderRadius: 16,
  },
  movieBody: {
    flex: 1,
    gap: 8,
    justifyContent: 'center',
  },
  movieTitle: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  ratingPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  ratingPillLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  matchPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  matchPillLabel: {
    fontSize: 11,
    fontWeight: '900',
  },
  genreLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  reasonLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  memberScores: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  memberScorePill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  memberScoreLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
});
