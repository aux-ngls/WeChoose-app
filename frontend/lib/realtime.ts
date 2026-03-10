import { API_URL } from "@/config";

export function buildRealtimeWebSocketUrl(token: string): string {
  const baseUrl = API_URL.replace(/^http/, "ws");
  return `${baseUrl}/ws/realtime?token=${encodeURIComponent(token)}`;
}
