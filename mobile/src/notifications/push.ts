import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerMobileDevice, unregisterMobileDevice } from '../api/client';

const PUSH_TOKEN_STORAGE_KEY = 'qulte.expoPushToken';
const PUSH_TOKEN_LAST_SYNC_STORAGE_KEY = 'qulte.expoPushTokenLastSync';
const PUSH_TOKEN_LAST_SYNC_APP_VERSION_STORAGE_KEY = 'qulte.expoPushTokenLastSyncAppVersion';
const NOTIFICATION_CHANNEL_ID = 'qulte-default';
const PUSH_TOKEN_SYNC_TTL_MS = 6 * 60 * 60 * 1000;

let pushRegistrationInFlight: Promise<string | null> | null = null;

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

async function shouldSkipServerRegistration(deviceToken: string, force: boolean) {
  if (force) {
    return false;
  }

  const [[, storedToken], [, lastSyncValue], [, syncedAppVersion]] = await AsyncStorage.multiGet([
    PUSH_TOKEN_STORAGE_KEY,
    PUSH_TOKEN_LAST_SYNC_STORAGE_KEY,
    PUSH_TOKEN_LAST_SYNC_APP_VERSION_STORAGE_KEY,
  ]);
  const lastSync = Number(lastSyncValue ?? 0);
  const appVersion = getAppVersion() ?? '';

  return (
    storedToken === deviceToken &&
    syncedAppVersion === appVersion &&
    Number.isFinite(lastSync) &&
    Date.now() - lastSync < PUSH_TOKEN_SYNC_TTL_MS
  );
}

async function syncExpoPushToken(
  authToken: string,
  options: { requestPermission: boolean; force?: boolean },
): Promise<string | null> {
  if (pushRegistrationInFlight && !options.force) {
    return pushRegistrationInFlight;
  }

  pushRegistrationInFlight = syncExpoPushTokenInternal(authToken, options).finally(() => {
    pushRegistrationInFlight = null;
  });

  return pushRegistrationInFlight;
}

async function syncExpoPushTokenInternal(
  authToken: string,
  options: { requestPermission: boolean; force?: boolean },
): Promise<string | null> {
  if (!Device.isDevice || !['ios', 'android'].includes(Platform.OS)) {
    return null;
  }

  await ensureAndroidChannel();

  const hasPermission = options.requestPermission
    ? await requestNotificationPermission()
    : (await Notifications.getPermissionsAsync()).status === 'granted';
  if (!hasPermission) {
    return null;
  }

  const projectId = getProjectId();
  if (!projectId) {
    return null;
  }

  const expoToken = await Notifications.getExpoPushTokenAsync({ projectId });
  const deviceToken = expoToken.data;

  if (await shouldSkipServerRegistration(deviceToken, Boolean(options.force))) {
    return deviceToken;
  }

  await registerMobileDevice(authToken, {
    device_token: deviceToken,
    platform: Platform.OS as 'ios' | 'android',
    app_version: getAppVersion(),
  });
  await AsyncStorage.multiSet([
    [PUSH_TOKEN_STORAGE_KEY, deviceToken],
    [PUSH_TOKEN_LAST_SYNC_STORAGE_KEY, String(Date.now())],
    [PUSH_TOKEN_LAST_SYNC_APP_VERSION_STORAGE_KEY, getAppVersion() ?? ''],
  ]);

  return deviceToken;
}

export async function registerForPushNotifications(authToken: string): Promise<string | null> {
  return syncExpoPushToken(authToken, { requestPermission: true, force: true });
}

export async function syncPushRegistration(authToken: string): Promise<string | null> {
  return syncExpoPushToken(authToken, { requestPermission: false });
}

export async function unregisterCurrentPushToken(authToken: string): Promise<void> {
  const deviceToken = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  if (!deviceToken) {
    return;
  }

  try {
    await unregisterMobileDevice(authToken, deviceToken);
  } finally {
    await AsyncStorage.multiRemove([
      PUSH_TOKEN_STORAGE_KEY,
      PUSH_TOKEN_LAST_SYNC_STORAGE_KEY,
      PUSH_TOKEN_LAST_SYNC_APP_VERSION_STORAGE_KEY,
    ]);
  }
}
