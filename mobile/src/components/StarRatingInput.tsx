import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

interface StarRatingInputProps {
  value?: number;
  onChange: (value: number) => void;
  size?: number;
  color?: string;
  emptyColor?: string;
  disabled?: boolean;
  allowHalf?: boolean;
}

export default function StarRatingInput({
  value = 0,
  onChange,
  size = 26,
  color = '#facc15',
  emptyColor = '#475569',
  disabled = false,
  allowHalf = true,
}: StarRatingInputProps) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((star) => {
        const iconName = value >= star ? 'star' : value >= star - 0.5 ? 'star-half' : 'star-outline';
        const iconColor = value >= star - 0.5 ? color : emptyColor;
        return (
          <View key={star} style={[styles.starSlot, { width: size + 8, height: size + 10 }]}>
            <Ionicons name={iconName} size={size} color={iconColor} />
            {allowHalf ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${star - 0.5} etoiles`}
                  disabled={disabled}
                  hitSlop={6}
                  onPress={() => onChange(star - 0.5)}
                  style={[styles.hitZone, styles.leftHitZone]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${star} etoiles`}
                  disabled={disabled}
                  hitSlop={6}
                  onPress={() => onChange(star)}
                  style={[styles.hitZone, styles.rightHitZone]}
                />
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${star} etoiles`}
                disabled={disabled}
                hitSlop={8}
                onPress={() => onChange(star)}
                style={StyleSheet.absoluteFill}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  starSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hitZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  leftHitZone: {
    left: 0,
    width: '50%',
  },
  rightHitZone: {
    right: 0,
    width: '50%',
  },
});
