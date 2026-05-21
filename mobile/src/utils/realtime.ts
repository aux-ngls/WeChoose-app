import { AppState } from 'react-native';
import { API_URL } from '../api/config';

type RealtimeState = 'connecting' | 'open' | 'closed' | 'error';

interface RealtimeSocketOptions {
  token: string;
  onMessage: (payload: Record<string, unknown>) => void;
  onStateChange?: (state: RealtimeState) => void;
}

const HEARTBEAT_INTERVAL_MS = 25000;
const RECONNECT_BASE_DELAY_MS = 450;
const RECONNECT_MAX_DELAY_MS = 5000;

function buildRealtimeUrl(token: string) {
  return `${API_URL.replace(/^http/, 'ws')}/ws/realtime?token=${encodeURIComponent(token)}`;
}

export function connectRealtimeSocket({ token, onMessage, onStateChange }: RealtimeSocketOptions) {
  let socket: WebSocket | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let stopped = false;

  const clearHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const clearReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) {
      return;
    }

    const exponentialDelay = RECONNECT_BASE_DELAY_MS * (2 ** Math.min(reconnectAttempt, 4));
    const jitter = Math.round(Math.random() * 200);
    const delay = Math.min(RECONNECT_MAX_DELAY_MS, exponentialDelay + jitter);
    reconnectAttempt += 1;

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openSocket();
    }, delay);
  };

  const closeSocket = () => {
    clearHeartbeat();
    if (!socket) {
      return;
    }

    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
    socket = null;
  };

  function openSocket() {
    if (stopped) {
      return;
    }

    closeSocket();
    onStateChange?.('connecting');
    const nextSocket = new WebSocket(buildRealtimeUrl(token));
    socket = nextSocket;

    nextSocket.onopen = () => {
      reconnectAttempt = 0;
      onStateChange?.('open');
      clearHeartbeat();
      heartbeatTimer = setInterval(() => {
        if (nextSocket.readyState === WebSocket.OPEN) {
          nextSocket.send('ping');
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    nextSocket.onmessage = (event) => {
      try {
        onMessage(JSON.parse(String(event.data)) as Record<string, unknown>);
      } catch {
        // Keep realtime best-effort; malformed frames should not kill the connection.
      }
    };

    nextSocket.onerror = () => {
      onStateChange?.('error');
    };

    nextSocket.onclose = () => {
      if (socket === nextSocket) {
        socket = null;
      }
      clearHeartbeat();
      onStateChange?.('closed');
      scheduleReconnect();
    };
  }

  const appStateSubscription = AppState.addEventListener('change', (state) => {
    const hasLiveSocket = socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING;
    if (state === 'active' && !stopped && !hasLiveSocket) {
      clearReconnect();
      openSocket();
    }
  });

  openSocket();

  return () => {
    stopped = true;
    clearReconnect();
    closeSocket();
    appStateSubscription.remove();
  };
}
