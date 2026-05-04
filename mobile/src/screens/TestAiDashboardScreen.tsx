import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError, fetchTestAiMetrics } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import AppScreen from '../components/AppScreen';
import InlineBanner from '../components/InlineBanner';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeContext';
import type { TestAiMetricsPayload, TestAiModeMetric, TestAiRecentItem } from '../types';
import { formatDate } from '../utils/format';

const modeLabels: Record<string, string> = {
  tinder: 'Tinder',
  spotlight: 'Pour toi',
  explore: 'Decouverte',
};

const reactionLabels: Record<string, string> = {
  rated: 'Note',
  watch_later: 'Plus tard',
  playlist_add: 'Playlist',
  undo_rating: 'Annulation note',
  undo_watch_later: 'Retire plus tard',
  undo_playlist_add: 'Retire playlist',
};

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatMode(mode: string) {
  return modeLabels[mode] ?? mode;
}

function formatReaction(item: TestAiRecentItem) {
  const label = reactionLabels[item.reaction_type] ?? 'Vu sans retour';
  if (item.reaction_rating !== null) {
    return `${label} ${item.reaction_rating.toFixed(1)}/5`;
  }
  return label;
}

function formatAverageRating(value: number | null) {
  return value === null ? '—' : `${value.toFixed(1)}/5`;
}

function MetricTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.metricTile, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
      <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: theme.colors.text }]}>{value}</Text>
      <Text style={[styles.metricDetail, { color: theme.colors.textSoft }]}>{detail}</Text>
    </View>
  );
}

function ModeRow({ metric }: { metric: TestAiModeMetric }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.modeRow, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
      <View style={styles.modeRowMain}>
        <Text style={[styles.modeTitle, { color: theme.colors.text }]}>{formatMode(metric.mode)}</Text>
        <Text style={[styles.modeDetail, { color: theme.colors.textMuted }]}>
          {metric.shown_count} films montres, {metric.response_count} retours
        </Text>
      </View>
      <View style={styles.modeStats}>
        <Text style={[styles.modeBadge, { color: theme.colors.accent }]}>{formatPercent(metric.positive_rate)}</Text>
        <Text style={[styles.modeDetail, { color: theme.colors.textMuted }]}>positif</Text>
      </View>
    </View>
  );
}

export default function TestAiDashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session, signOut } = useAuth();
  const { theme } = useTheme();
  const [payload, setPayload] = useState<TestAiMetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const isTestAccount = session?.username.trim().toLowerCase() === 'test';

  const loadDashboard = useCallback(async (quiet = false) => {
    if (!session || !isTestAccount) {
      setLoading(false);
      return;
    }

    if (quiet) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const nextPayload = await fetchTestAiMetrics(session.token);
      setPayload(nextPayload);
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        await signOut();
        return;
      }
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger le labo IA.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isTestAccount, session, signOut]);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard(false);
    }, [loadDashboard]),
  );

  return (
    <AppScreen>
      <Pressable style={[styles.backButton, { backgroundColor: theme.rgba.card }]} onPress={() => navigation.goBack()}>
        <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        <Text style={[styles.backLabel, { color: theme.colors.text }]}>Retour</Text>
      </Pressable>

      <View style={[styles.heroCard, { borderColor: theme.colors.accentSoft, backgroundColor: theme.colors.accentSoft }]}>
        <View style={[styles.heroIcon, { backgroundColor: theme.colors.accent }]}>
          <Ionicons name="flask-outline" size={22} color={theme.colors.accentText} />
        </View>
        <View style={styles.heroBody}>
          <Text style={[styles.heroTitle, { color: theme.colors.text }]}>Labo IA</Text>
          <Text style={[styles.heroSubtitle, { color: theme.colors.textSoft }]}>
            Un tableau de bord reserve au compte test pour suivre ce que les recos convertissent vraiment.
          </Text>
        </View>
        <Pressable
          style={[styles.refreshButton, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
          onPress={() => void loadDashboard(true)}
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={theme.colors.text} />
          ) : (
            <Ionicons name="refresh" size={18} color={theme.colors.text} />
          )}
        </Pressable>
      </View>

      {error ? <InlineBanner message={error} tone="error" /> : null}

      {!isTestAccount ? (
        <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Labo indisponible</Text>
          <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>
            Ce tableau de bord est visible uniquement avec le compte test.
          </Text>
        </View>
      ) : null}

      {loading && !payload ? (
        <View style={[styles.loadingCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
          <ActivityIndicator color={theme.colors.text} />
          <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Chargement des signaux IA...</Text>
        </View>
      ) : null}

      {payload ? (
        <>
          <View style={styles.metricsGrid}>
            <MetricTile
              label="Films montres"
              value={String(payload.overview.shown_count)}
              detail={`${payload.overview.response_count} retours reels`}
            />
            <MetricTile
              label="Taux de retour"
              value={formatPercent(payload.overview.response_rate)}
              detail="Films qui ont provoque une action"
            />
            <MetricTile
              label="Taux positif"
              value={formatPercent(payload.overview.positive_rate)}
              detail={`${payload.overview.positive_count} reactions positives`}
            />
            <MetricTile
              label="Note moyenne"
              value={formatAverageRating(payload.overview.average_rating)}
              detail="Sur les films notes apres reco"
            />
          </View>

          <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Par mode</Text>
            <View style={styles.stackList}>
              {payload.by_mode.length > 0 ? (
                payload.by_mode.map((metric) => (
                  <ModeRow key={`${metric.algorithm_variant}-${metric.mode}`} metric={metric} />
                ))
              ) : (
                <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>
                  Pas encore assez de donnees pour distinguer les modes.
                </Text>
              )}
            </View>
          </View>

          <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Films qui marchent le mieux</Text>
            <View style={styles.stackList}>
              {payload.top_movies.length > 0 ? (
                payload.top_movies.map((movie, index) => (
                  <Pressable
                    key={`${movie.movie_id}-${index}`}
                    style={[styles.rankRow, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
                    onPress={() => navigation.navigate('MovieDetails', { movieId: movie.movie_id, title: movie.title, source: 'default' })}
                  >
                    <View style={styles.rankMarker}>
                      <Text style={[styles.rankMarkerLabel, { color: theme.colors.accent }]}>{index + 1}</Text>
                    </View>
                    <View style={styles.rankBody}>
                      <Text style={[styles.rankTitle, { color: theme.colors.text }]} numberOfLines={1}>
                        {movie.title}
                      </Text>
                      <Text style={[styles.rankDetail, { color: theme.colors.textMuted }]} numberOfLines={1}>
                        {movie.positive_count} reactions positives sur {movie.response_count} retours
                      </Text>
                    </View>
                    <Text style={[styles.rankScore, { color: theme.colors.text }]}>
                      {formatPercent(movie.positive_rate)}
                    </Text>
                  </Pressable>
                ))
              ) : (
                <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>
                  Les meilleurs films apparaitront ici apres quelques notes ou ajouts en playlist.
                </Text>
              )}
            </View>
          </View>

          <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Graines les plus efficaces</Text>
            <View style={styles.stackList}>
              {payload.top_seeds.length > 0 ? (
                payload.top_seeds.map((seed, index) => (
                  <Pressable
                    key={`${seed.seed_movie_id ?? seed.seed_title}-${index}`}
                    style={[styles.rankRow, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
                    onPress={() => {
                      if (seed.seed_movie_id) {
                        navigation.navigate('MovieDetails', {
                          movieId: seed.seed_movie_id,
                          title: seed.seed_title,
                          source: 'default',
                        });
                      }
                    }}
                    disabled={!seed.seed_movie_id}
                  >
                    <View style={styles.rankMarker}>
                      <Ionicons name="sparkles" size={14} color={theme.colors.accent} />
                    </View>
                    <View style={styles.rankBody}>
                      <Text style={[styles.rankTitle, { color: theme.colors.text }]} numberOfLines={1}>
                        {seed.seed_title}
                      </Text>
                      <Text style={[styles.rankDetail, { color: theme.colors.textMuted }]} numberOfLines={1}>
                        {seed.positive_count} positives sur {seed.response_count} retours
                      </Text>
                    </View>
                    <Text style={[styles.rankScore, { color: theme.colors.text }]}>
                      {formatPercent(seed.positive_rate)}
                    </Text>
                  </Pressable>
                ))
              ) : (
                <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>
                  Quand une reco basee sur un film-source fonctionne bien, elle remontera ici.
                </Text>
              )}
            </View>
          </View>

          <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Genres appris</Text>

            <Text style={[styles.subsectionLabel, { color: theme.colors.textSoft }]}>Ce qui semble bien marcher</Text>
            <View style={styles.chipsWrap}>
              {payload.feedback_profile.positive_genres.length > 0 ? (
                payload.feedback_profile.positive_genres.map((genre) => (
                  <View
                    key={`positive-${genre.name}`}
                    style={[styles.genreChip, { borderColor: theme.colors.accentSoft, backgroundColor: theme.colors.accentSoft }]}
                  >
                    <Text style={[styles.genreChipLabel, { color: theme.colors.text }]}>{genre.name}</Text>
                  </View>
                ))
              ) : (
                <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Pas encore de tendance nette.</Text>
              )}
            </View>

            {payload.feedback_profile.negative_genres.length > 0 ? (
              <>
                <Text style={[styles.subsectionLabel, { color: theme.colors.textSoft }]}>Ce qui convertit moins</Text>
                <View style={styles.chipsWrap}>
                  {payload.feedback_profile.negative_genres.map((genre) => (
                    <View
                      key={`negative-${genre.name}`}
                      style={[styles.genreChip, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
                    >
                      <Text style={[styles.genreChipLabel, { color: theme.colors.textMuted }]}>{genre.name}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </View>

          <View style={[styles.sectionCard, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Derniers retours</Text>
            <View style={styles.stackList}>
              {payload.recent.length > 0 ? (
                payload.recent.slice(0, 12).map((item, index) => (
                  <Pressable
                    key={`${item.movie_id}-${item.shown_at}-${index}`}
                    style={[styles.recentRow, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
                    onPress={() => navigation.navigate('MovieDetails', { movieId: item.movie_id, title: item.movie_title, source: 'default' })}
                  >
                    <View style={styles.recentMain}>
                      <Text style={[styles.rankTitle, { color: theme.colors.text }]} numberOfLines={1}>
                        {item.movie_title}
                      </Text>
                      <Text style={[styles.rankDetail, { color: theme.colors.textMuted }]} numberOfLines={2}>
                        {formatReaction(item)}
                        {item.seed_title ? ` • depuis ${item.seed_title}` : ''}
                      </Text>
                      <Text style={[styles.timestampLabel, { color: theme.colors.textMuted }]}>
                        Montre le {formatDate(item.shown_at)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.recentBadge,
                        {
                          backgroundColor: item.is_positive ? theme.colors.accentSoft : theme.rgba.card,
                          borderColor: item.is_positive ? theme.colors.accentSoft : theme.rgba.border,
                        },
                      ]}
                    >
                      <Text style={[styles.recentBadgeLabel, { color: item.is_positive ? theme.colors.text : theme.colors.textMuted }]}>
                        {item.is_positive ? 'positif' : 'mixte'}
                      </Text>
                    </View>
                  </Pressable>
                ))
              ) : (
                <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>
                  Des que tu interagis avec quelques recos du compte test, l historique apparait ici.
                </Text>
              )}
            </View>
          </View>
        </>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  backLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 28,
    borderWidth: 1,
    padding: 16,
  },
  heroIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '900',
  },
  heroSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingCard: {
    minHeight: 140,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricTile: {
    width: '48%',
    minHeight: 124,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '900',
  },
  metricDetail: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  sectionCard: {
    gap: 14,
    borderRadius: 26,
    borderWidth: 1,
    padding: 18,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  subsectionLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  stackList: {
    gap: 10,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
  },
  modeRowMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  modeTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  modeDetail: {
    fontSize: 12,
    fontWeight: '700',
  },
  modeStats: {
    alignItems: 'flex-end',
    gap: 2,
  },
  modeBadge: {
    fontSize: 17,
    fontWeight: '900',
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
  },
  rankMarker: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankMarkerLabel: {
    fontSize: 14,
    fontWeight: '900',
  },
  rankBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rankTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  rankDetail: {
    fontSize: 12,
    fontWeight: '700',
  },
  rankScore: {
    fontSize: 15,
    fontWeight: '900',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genreChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  genreChipLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
  },
  recentMain: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  recentBadge: {
    minWidth: 70,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  recentBadgeLabel: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  timestampLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
});
