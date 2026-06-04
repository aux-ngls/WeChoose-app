import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';

const APP_STORE_ID = '6763633848';
const ANDROID_PACKAGE_NAME = 'dev.dury.qulte';
const APPRECIATION_STATE_VERSION = 1;
const INTERACTION_THRESHOLD = 15;
const REPROMPT_AFTER_MS = 1000 * 60 * 60 * 24 * 45;

interface AppreciationState {
  version: number;
  interactions: number;
  lastPromptAt: number | null;
  promptCount: number;
}

function getAppreciationStateKey(username: string) {
  return `qulte:appreciation:${username}:v${APPRECIATION_STATE_VERSION}`;
}

async function readAppreciationState(username: string): Promise<AppreciationState> {
  try {
    const raw = await AsyncStorage.getItem(getAppreciationStateKey(username));
    if (!raw) {
      return {
        version: APPRECIATION_STATE_VERSION,
        interactions: 0,
        lastPromptAt: null,
        promptCount: 0,
      };
    }
    const parsed = JSON.parse(raw) as Partial<AppreciationState>;
    return {
      version: APPRECIATION_STATE_VERSION,
      interactions: typeof parsed.interactions === 'number' ? parsed.interactions : 0,
      lastPromptAt: typeof parsed.lastPromptAt === 'number' ? parsed.lastPromptAt : null,
      promptCount: typeof parsed.promptCount === 'number' ? parsed.promptCount : 0,
    };
  } catch {
    return {
      version: APPRECIATION_STATE_VERSION,
      interactions: 0,
      lastPromptAt: null,
      promptCount: 0,
    };
  }
}

async function writeAppreciationState(username: string, state: AppreciationState) {
  await AsyncStorage.setItem(getAppreciationStateKey(username), JSON.stringify(state));
}

export async function recordAppreciationInteraction(username: string): Promise<boolean> {
  const state = await readAppreciationState(username);
  const nextInteractions = state.interactions + 1;
  const now = Date.now();
  const canReprompt = !state.lastPromptAt || now - state.lastPromptAt >= REPROMPT_AFTER_MS;
  const shouldPrompt = nextInteractions >= INTERACTION_THRESHOLD && canReprompt;

  await writeAppreciationState(username, {
    ...state,
    interactions: nextInteractions,
    lastPromptAt: shouldPrompt ? now : state.lastPromptAt,
    promptCount: shouldPrompt ? state.promptCount + 1 : state.promptCount,
  });

  return shouldPrompt;
}

export async function requestInAppReview() {
  try {
    const StoreReview = await import('expo-store-review');
    const isAvailable = await StoreReview.isAvailableAsync();
    if (isAvailable) {
      await StoreReview.requestReview();
      return;
    }
  } catch {
    // Fallback handled below when the native module is unavailable in the current build.
  }

  await openStoreReviewPage();
}

export async function openStoreReviewPage() {
  if (Platform.OS === 'ios') {
    await Linking.openURL(`https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`);
    return;
  }

  const nativeUrl = `market://details?id=${ANDROID_PACKAGE_NAME}&showAllReviews=true`;
  const webUrl = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}&showAllReviews=true`;
  const supported = await Linking.canOpenURL(nativeUrl);
  await Linking.openURL(supported ? nativeUrl : webUrl);
}
