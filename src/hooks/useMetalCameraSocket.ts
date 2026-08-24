import { useCallback, useEffect, useRef, useState } from 'react';
import {
  METAL_WS_URL,
  METAL_HTTP_BASE,
  METAL_SUPERVISOR_BASE,
  type MetalParamPatch,
  type MetalShaderParams,
  type MetalStats,
} from '../lib/metalCamera.types';

export interface MetalCameraConnection {
  connected: boolean;
  connecting: boolean;
  starting: boolean;
  params: MetalShaderParams | null;
  stats: MetalStats | null;
  sendPatch: (patch: MetalParamPatch) => void;
  loadPreset: (name: string) => Promise<boolean>;
  listPresets: () => Promise<string[]>;
  listCameras: () => Promise<string[]>;
  selectCamera: (name: string) => Promise<boolean>;
}

/**
 * Connects to cast-metal's control WebSocket (ws://127.0.0.1:4313/ws),
 * auto-reconnects with backoff, and exposes live params + patch sender.
 */
export function useMetalCameraSocket(): MetalCameraConnection {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [starting, setStarting] = useState(false);
  const [params, setParams] = useState<MetalShaderParams | null>(null);
  const [stats, setStats] = useState<MetalStats | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const autoStartTriedRef = useRef(false);

  useEffect(() => {
    let disposed = false;

    // Ask the CAST server to spawn castmetal if it isn't running.
    // Only attempted once per panel mount; after that we just retry the socket.
    async function autoStart() {
      if (autoStartTriedRef.current) return;
      autoStartTriedRef.current = true;
      try {
        await fetch(`${METAL_SUPERVISOR_BASE}/start`, { method: 'POST' });
      } catch {
        // server unreachable — keep retrying the socket anyway
      }
    }

    function connect() {
      if (disposed) return;
      setConnecting(true);
      try {
        const ws = new WebSocket(METAL_WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          attemptRef.current = 0;
          setConnected(true);
          setConnecting(false);
          setStarting(false);
          ws.send(JSON.stringify({ type: 'getParams' }));
        };
        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data as string);
            if (msg.type === 'params' && msg.params) {
              setParams(msg.params as MetalShaderParams);
            } else if (msg.type === 'stats') {
              setStats({
                fps: Number(msg.fps) || 0,
                camera: typeof msg.camera === 'string' ? msg.camera : undefined,
              });
            }
          } catch {
            // ignore malformed frames
          }
        };
        ws.onclose = () => {
          setConnected(false);
          scheduleRetry();
        };
        ws.onerror = () => ws.close();
      } catch {
        scheduleRetry();
      }
    }

    function scheduleRetry() {
      if (disposed) return;
      setConnecting(true);
      const delay = Math.min(1000 * 2 ** attemptRef.current, 8000);
      attemptRef.current += 1;
      retryRef.current = setTimeout(connect, delay);
    }

    connect();
    void autoStart();
    return () => {
      disposed = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  const sendPatch = useCallback((patch: MetalParamPatch) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // Optimistic local update so sliders feel instant
    setParams((prev) => (prev ? { ...prev, ...patch } : prev));
    ws.send(JSON.stringify({ type: 'setParams', patch }));
  }, []);

  const loadPreset = useCallback(async (name: string): Promise<boolean> => {
    try {
      const res = await fetch(`${METAL_HTTP_BASE}/presets/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const listPresets = useCallback(async (): Promise<string[]> => {
    try {
      const res = await fetch(`${METAL_HTTP_BASE}/presets`);
      if (!res.ok) return [];
      const data = (await res.json()) as { presets?: string[] };
      return data.presets ?? [];
    } catch {
      return [];
    }
  }, []);

  const listCameras = useCallback(async (): Promise<string[]> => {
    try {
      const res = await fetch(`${METAL_HTTP_BASE}/cameras`);
      if (!res.ok) return [];
      const data = (await res.json()) as { cameras?: string[] };
      return data.cameras ?? [];
    } catch {
      return [];
    }
  }, []);

  const selectCamera = useCallback(async (name: string): Promise<boolean> => {
    try {
      const res = await fetch(`${METAL_HTTP_BASE}/cameras/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  return {
    connected, connecting, starting, params, stats,
    sendPatch, loadPreset, listPresets, listCameras, selectCamera,
  };
}
