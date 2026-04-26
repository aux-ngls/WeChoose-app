import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerMobileDevice, unregisterMobileDevice } from '../api/client';

const PUSH_TOKEN_STORAGE_KEY = 'qulte.expoPushToken';
const NOTIFICATION_CHANNEL_ID = 'qulte-default';

export type PushNotificationStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable' | 'missing-project';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function getProjectId(): string | undefined {
  return Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
}

function getAppVersion(): string | undefined {
  return Constants.expoConfig?.version;
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
    name: 'Qulte',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#f9a8d4',
  });
}

async function requestNotificationPermission(): Promise<boolean> {
  const currentPermissions = await Notifications.getPermissionsAsync();
  let finalStatus = currentPermissions.status;

  if (finalStatus !== 'granted') {
    const requestedPermissions = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermissions.status;
  }

  return finalStatus === 'granted';
}

export async function getPushNotificationStatus(): Promise<PushNotificationStatus> {
  if (!Device.isDevice || !['ios', 'android'].includes(Platform.OS)) {
    return 'unavailable';
  }

  if (!getProjectId()) {
    return 'missing-project';
  }

  const permissions = await Notifications.getPermissionsAsync();
  return permissions.status as PushNotificationStatus;
}

export async function registerForPushNotifications(authToken: string): Promise<string | null> {
  if (!Device.isDevice || !['ios', 'android'].includes(Platform.OS)) {
    return null;
  }

  await ensureAndroidChannel();

  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) {
    return null;
  }

  const projectId = getProjectId();
  if (!projectId) {
    return null;
  }

  const expoToken = await Notifications.getExpoPushTokenAsync({ projectId });
  const deviceToken = expoToken.data;

  await registerMobileDevice(authToken, {
    device_token: deviceToken,
    platform: Platform.OS as 'ios' | 'android',
    app_version: getAppVersion(),
  });
  await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, deviceToken);

  return deviceToken;
}

export async function unregisterCurrentPushToken(authToken: string): Promise<void> {
  const deviceToken = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  if (!deviceToken) {
    return;
  }

  try {
    await unregisterMobileDevice(authToken, deviceToken);
  } finally {
    await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
  }
}
