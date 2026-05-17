import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { theme } from '../theme';

interface RatingStarsProps {
  value?: number;
  onChange?: (rating: number) => void;
  size?: number;
}

export default function RatingStars({ value = 0, onChange, size = 25 }: RatingStarsProps) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((rating) => {
        const active = rating <= value;
        return (
          <Pressable key={rating} disabled={!onChange} hitSlop={8} onPress={() => onChange?.(rating)}>
            <Ionicons name={active ? 'star' : 'star-outline'} size={size} color={theme.colors.amber} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
});
