import { API_URL } from "@/config";
import { buildAuthHeaders } from "@/lib/auth";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const normalized = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function canUseWebPush(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.isSecureContext &&
    "Notification" in window &&
    "serviceWorker" in window.navigator &&
    "PushManager" in window
  );
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!canUseWebPush()) {
    return null;
  }

  try {
    return await window.navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function syncWebPushSubscription(token: string): Promise<boolean> {
  const registration = await getPushRegistration();
  if (!registration || Notification.permission !== "granted") {
    return false;
  }

  const keyRes = await fetch(`${API_URL}/webpush/public-key`, {
    headers: buildAuthHeaders(token),
  });
  const keyPayload = await keyRes.json().catch(() => ({}));
  if (!keyRes.ok || !keyPayload?.public_key) {
    throw new Error(keyPayload?.detail ?? "Impossible de preparer les notifications");
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey:
        urlBase64ToUint8Array(String(keyPayload.public_key)) as unknown as BufferSource,
    });
  }

  const res = await fetch(`${API_URL}/webpush/subscribe`, {
    method: "POST",
    headers: buildAuthHeaders(token, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!res.ok) {
    const errorPayload = await res.json().catch(() => ({}));
    throw new Error(errorPayload?.detail ?? "Impossible d'activer les notifications");
  }

  return true;
}

export async function requestWebPushPermissionAndSubscribe(token: string): Promise<boolean> {
  if (!canUseWebPush()) {
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return false;
  }

  return syncWebPushSubscription(token);
}

export async function unregisterWebPushSubscription(token?: string | null): Promise<void> {
  const registration = await getPushRegistration();
  if (!registration) {
    return;
  }

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return;
  }

  if (token) {
    try {
      await fetch(`${API_URL}/webpush/unsubscribe`, {
        method: "POST",
        headers: buildAuthHeaders(token, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    } catch {
      // no-op
    }
  }

  try {
    await subscription.unsubscribe();
  } catch {
    // no-op
  }
}
