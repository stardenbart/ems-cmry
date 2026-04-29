import { useState, useEffect, useRef, useCallback } from 'react';

const MAX_RETRIES = 15;
const BASE_DELAY_MS = 3000;

export function useWebSocket(url) {
  const [data, setData] = useState({});
  const [alarms, setAlarms] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const retryRef = useRef(0);
  const unmounted = useRef(false);

  const connect = useCallback(() => {
    if (unmounted.current) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const wsUrl = url || process.env.REACT_APP_WS_URL || 'ws://localhost:3005';
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (unmounted.current) return;
      setIsConnected(true);
      retryRef.current = 0;
      setRetryCount(0);
      console.log('[WS] Connected');
    };

    ws.onmessage = (event) => {
      if (unmounted.current) return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'init') {
          setData(msg.data || {});
        } else if (msg.type === 'realtime') {
          setData((prev) => ({
            ...prev,
            [msg.deviceId]: msg.data,
          }));
        } else if (msg.type === 'alarm') {
          setAlarms((prev) => [msg.data, ...prev].slice(0, 50));
        }
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    ws.onclose = () => {
      if (unmounted.current) return;
      setIsConnected(false);

      if (retryRef.current >= MAX_RETRIES) {
        console.warn('[WS] Max retries reached. Stopped reconnecting.');
        return;
      }

      // Exponential backoff: 3s, 6s, 12s … capped at 30s
      const delay = Math.min(BASE_DELAY_MS * Math.pow(1.5, retryRef.current), 30000);
      retryRef.current += 1;
      setRetryCount(retryRef.current);
      console.log(`[WS] Disconnected. Retry ${retryRef.current}/${MAX_RETRIES} in ${Math.round(delay / 1000)}s…`);
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // onclose will handle reconnect
      ws.close();
    };

    wsRef.current = ws;
  }, [url]);

  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on manual close
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { data, alarms, isConnected, retryCount };
}