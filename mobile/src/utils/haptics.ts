import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';
import QulteHaptics from 'qulte-haptics';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSafely(action: () => Promise<void>) {
  try {
    await action();
  } catch {
    return false;
  }

  return true;
}

async function playAndroidMovieSentHaptic() {
  const started = await runSafely(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Gesture_Start));
  await wait(54);
  await runSafely(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Frequent_Tick));
  await wait(88);
  await runSafely(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Gesture_End));
  await wait(34);
  const ended = await runSafely(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm));

  return started || ended;
}

async function playIosMovieSentHaptic() {
  const started = await runSafely(() => Haptics.selectionAsync());
  await wait(42);
  await runSafely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
  await wait(118);
  const ended = await runSafely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid));

  return started || ended;
}

export async function playMovieSentHapticSignature() {
  const nativeHaptics = QulteHaptics;
  if (Platform.OS === 'ios' && nativeHaptics?.playMovieSentAsync) {
    const playedNativeSignature = await runSafely(() => nativeHaptics.playMovieSentAsync());
    if (playedNativeSignature) {
      return;
    }
  }

  const played = Platform.OS === 'android'
    ? await playAndroidMovieSentHaptic()
    : await playIosMovieSentHaptic();

  if (!played) {
    Vibration.vibrate([0, 8, 70, 24]);
  }
}
