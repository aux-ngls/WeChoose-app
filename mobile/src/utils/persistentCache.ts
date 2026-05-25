import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'qulte:persistent-cache:v1';

function buildCacheKey(scope: string, username?: string, suffix?: string): string {
  const segments = [CACHE_PREFIX, scope, username ?? 'anonymous'];
  if (suffix) {
    segments.push(suffix);
  }
  return segments.join(':');
}

export function buildUserCacheKey(scope: string, username?: string, suffix?: string): string {
  return buildCacheKey(scope, username, suffix);
}

export async function readPersistentCache<T>(key: string): Promise<T | null> {
  try {
    const rawValue = await AsyncStorage.getItem(key);
    if (!rawValue) {
      return null;
    }
    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
}

export async function writePersistentCache<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}
