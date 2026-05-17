import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import type { Book } from '../types';

interface BookCoverProps {
  book: Book;
  size?: 'small' | 'medium' | 'large';
}

export default function BookCover({ book, size = 'medium' }: BookCoverProps) {
  const [failed, setFailed] = useState(false);
  const style = size === 'large' ? styles.large : size === 'small' ? styles.small : styles.medium;

  if (!book.coverUrl || failed) {
    return (
      <View style={[styles.cover, style, styles.fallback]}>
        <Ionicons name="book-outline" size={size === 'small' ? 20 : 34} color={theme.colors.accent} />
        <Text style={styles.fallbackTitle} numberOfLines={3}>{book.title}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.cover, style]}>
      <Image source={{ uri: book.coverUrl }} resizeMode="cover" style={styles.image} onError={() => setFailed(true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceStrong,
  },
  small: {
    width: 58,
    height: 86,
  },
  medium: {
    width: 104,
    height: 154,
  },
  large: {
    width: '100%',
    aspectRatio: 0.66,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  fallbackTitle: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
});
