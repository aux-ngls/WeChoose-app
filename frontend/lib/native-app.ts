import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { API_URL } from "@/config";
import { buildAuthHeaders, getStoredToken } from "@/lib/auth";

const PUSH_TOKEN_STORAGE_KEY = "qulte_native_push_token";
const PUSH_SYNC_STORAGE_KEY = "qulte_native_push_sync_key";

export function isNativeMobileApp() {
  return Capacitor.isNativePlatform();
}

export function getNativePlatform() {
  return Capacitor.getPlatform();
}

export function getStoredNativePushToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
}

export async function syncNativePushToken(deviceToken?: string) {
  if (typeof window === "undefined") {
    return false;
  }

  const resolvedDeviceToken = deviceToken ?? getStoredNativePushToken();
  const authToken = getStoredToken();
  const username = window.localStorage.getItem("username");
  if (!resolvedDeviceToken || !authToken || !username) {
    return false;
  }

  const syncKey = `${username}:${resolvedDeviceToken}`;
  if (window.localStorage.getItem(PUSH_SYNC_STORAGE_KEY) === syncKey) {
    return true;
  }

  const res = await fetch(`${API_URL}/mobile/devices/register`, {
    method: "POST",
    headers: {
      ...buildAuthHeaders(authToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: resolvedDeviceToken,
      platform: getNativePlatform(),
    }),
  });

  if (!res.ok) {
    return false;
  }

  window.localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, resolvedDeviceToken);
  window.localStorage.setItem(PUSH_SYNC_STORAGE_KEY, syncKey);
  return true;
}

export async function rememberNativePushToken(deviceToken: string) {
  if (typeof window === "undefined") {
    return false;
  }

  window.localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, deviceToken);
  return syncNativePushToken(deviceToken);
}

export async function unregisterNativePushToken() {
  if (typeof window === "undefined") {
    return;
  }

  const authToken = getStoredToken();
  const deviceToken = getStoredNativePushToken();
  window.localStorage.removeItem(PUSH_SYNC_STORAGE_KEY);
  if (!authToken || !deviceToken) {
    return;
  }

  await fetch(`${API_URL}/mobile/devices/unregister`, {
    method: "POST",
    headers: {
      ...buildAuthHeaders(authToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token: deviceToken }),
  }).catch(() => undefined);
}

export async function shareExternally({
  title,
  text,
  url,
}: {
  title: string;
  text?: string;
  url?: string;
}) {
  if (!isNativeMobileApp()) {
    return false;
  }

  await Share.share({
    title,
    text,
    url,
    dialogTitle: title,
  });
  return true;
}
