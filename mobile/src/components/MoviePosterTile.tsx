import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { FALLBACK_POSTER, type SearchMovie } from '../types';
import { useTheme } from '../theme/ThemeContext';

interface MoviePosterTileProps {
  movie: SearchMovie;
  onPress?: () => void;
}

export default function MoviePosterTile({ movie, onPress }: MoviePosterTileProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.card, { borderColor: theme.rgba.border, backgroundColor: theme.rgba.card }]}
    >
      <Image source={{ uri: movie.poster_url || FALLBACK_POSTER }} style={styles.poster} />
      <View style={[styles.overlay, { backgroundColor: theme.rgba.overlay }]}>
        <Text style={styles.title} numberOfLines={2}>
          {movie.title}
        </Text>
        <Text style={[styles.rating, { color: theme.colors.ratingText }]}>{movie.rating.toFixed(1)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  poster: {
    width: '100%',
    aspectRatio: 2 / 3,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.74)',
  },
  title: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 16,
  },
  rating: {
    color: '#fde68a',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
});
