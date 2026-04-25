import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SessionState } from '../types';

const SESSION_KEY = 'qulte-mobile-session';

export async function loadSession(): Promise<SessionState | null> {
  const rawValue = await AsyncStorage.getItem(SESSION_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as SessionState;
  } catch {
    return null;
  }
}

export async function saveSession(session: SessionState): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}
