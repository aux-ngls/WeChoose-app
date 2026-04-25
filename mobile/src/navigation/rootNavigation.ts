import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

type NotificationData = Record<string, unknown>;
let pendingNotificationData: NotificationData | null = null;

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsedValue = Number.parseInt(value, 10);
    return Number.isFinite(parsedValue) ? parsedValue : undefined;
  }
  return undefined;
}

export function navigateFromNotificationData(data: NotificationData) {
  if (!navigationRef.isReady()) {
    pendingNotificationData = data;
    return;
  }
  pendingNotificationData = null;

  const conversationId = readNumber(data.conversationId);
  if (conversationId) {
    navigationRef.navigate('Conversation', { conversationId });
    return;
  }

  const route = readString(data.route);
  if (route?.startsWith('/messages')) {
    navigationRef.navigate('MainTabs', { screen: 'Messages' });
    return;
  }

  if (route?.startsWith('/social')) {
    navigationRef.navigate('MainTabs', { screen: 'Social' });
  }
}

export function flushPendingNotificationNavigation() {
  if (pendingNotificationData) {
    navigateFromNotificationData(pendingNotificationData);
  }
}
