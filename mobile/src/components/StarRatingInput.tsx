import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, PanResponder, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

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
  color,
  emptyColor,
  disabled = false,
  allowHalf = true,
}: StarRatingInputProps) {
  const { theme } = useTheme();
  const activeColor = color ?? '#facc15';
  const inactiveColor = emptyColor ?? (theme.isDark ? '#475569' : '#d6b8c6');
  const [previewValue, setPreviewValue] = useState<number | null>(null);
  const rowRef = useRef<View | null>(null);
  const rowFrameRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const STAR_SLOT_WIDTH = size + 8;
  const STAR_GAP = 6;
  const STAR_COUNT = 5;
  const STAR_UNIT = STAR_SLOT_WIDTH + STAR_GAP;
  const TRACK_WIDTH = STAR_SLOT_WIDTH * STAR_COUNT + STAR_GAP * (STAR_COUNT - 1);
  const displayedValue = previewValue ?? value;

  const syncRowFrame = () => {
    rowRef.current?.measureInWindow((x, y, width, height) => {
      rowFrameRef.current = { x, y, width, height };
    });
  };

  const isTouchInside = (event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    const { x, y, width, height } = rowFrameRef.current;
    return pageX >= x && pageX <= x + width && pageY >= y && pageY <= y + height;
  };

  const getRatingFromTouch = (event: GestureResponderEvent, mode: 'start' | 'move' = 'move') => {
    const absoluteX = event.nativeEvent.pageX - rowFrameRef.current.x;
    const fallbackX = event.nativeEvent.locationX;
    const rawX =
      Number.isFinite(absoluteX) && absoluteX >= -24 && absoluteX <= TRACK_WIDTH + 24
        ? absoluteX
        : fallbackX;
    const clampedX = Math.max(0, Math.min(rawX, TRACK_WIDTH));
    const starIndex = Math.min(STAR_COUNT - 1, Math.floor(clampedX / STAR_UNIT));
    const offsetInUnit = clampedX - starIndex * STAR_UNIT;
    const clampedOffset = Math.min(Math.max(offsetInUnit, 0), STAR_SLOT_WIDTH);
    const baseStarValue = starIndex + 1;

    if (!allowHalf) {
      return baseStarValue;
    }

    if (mode === 'start') {
      return baseStarValue;
    }

    return clampedOffset <= STAR_SLOT_WIDTH / 2 ? baseStarValue - 0.5 : baseStarValue;
  };

  const updatePreview = (event: GestureResponderEvent) => {
    if (disabled) {
      return;
    }
    syncRowFrame();
    if (!isTouchInside(event)) {
      setPreviewValue(null);
      return;
    }
    setPreviewValue(getRatingFromTouch(event, 'move'));
  };

  const startPreview = (event: GestureResponderEvent) => {
    if (disabled) {
      return;
    }
    syncRowFrame();
    if (!isTouchInside(event)) {
      setPreviewValue(null);
      return;
    }
    setPreviewValue(getRatingFromTouch(event, 'start'));
  };

  const commitPreview = (event: GestureResponderEvent) => {
    if (disabled) {
      return;
    }
    syncRowFrame();
    if (!isTouchInside(event)) {
      setPreviewValue(null);
      return;
    }
    const nextValue = getRatingFromTouch(event);
    setPreviewValue(null);
    onChange(nextValue);
  };

  const clearPreview = () => {
    setPreviewValue(null);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: startPreview,
        onPanResponderMove: updatePreview,
        onPanResponderRelease: commitPreview,
        onPanResponderTerminate: clearPreview,
        onPanResponderTerminationRequest: () => true,
      }),
    [disabled],
  );

  return (
    <View
      ref={rowRef}
      style={[styles.row, { width: TRACK_WIDTH }]}
      onLayout={syncRowFrame}
      {...(!disabled ? panResponder.panHandlers : {})}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const iconName =
          displayedValue >= star ? 'star' : displayedValue >= star - 0.5 ? 'star-half' : 'star-outline';
        const iconColor = displayedValue >= star - 0.5 ? activeColor : inactiveColor;
        return (
          <View key={star} style={[styles.starSlot, { width: size + 8, height: size + 10 }]}>
            <Ionicons name={iconName} size={size} color={iconColor} />
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
});
