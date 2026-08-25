import { useCallback, useEffect, useRef, useState } from 'react';

const OBS_WS_URL = 'ws://127.0.0.1:4455';
const SOURCE_NAME = 'Video Capture Device';
const FILTER_NAME = 'cast-v2';

export type ObsSettings = Record<string, number | string | boolean | object>;

export interface ObsShaderConnection {
  connected: boolean;
  connecting: boolean;
  settings: ObsSettings | null;
  virtualCamActive: boolean;
  setParams: (patch: ObsSettings) => void;
  startVirtualCam: () => void;
  stopVirtualCam: () => void;
}

/**
 * Connects to OBS Studio's WebSocket (obs-websocket v5) and drives the
 * cast-v2 shader filter live. Auto-reconnects with backoff.
 */
export function useObsShaderSocket(): ObsShaderConnection {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [settings, setSettings] = useState<ObsSettings | null>(null);
  const [virtualCamActive, setVirtualCamActive] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const disposedRef = useRef(false);
  const reqIdRef = useRef(0);
  const pendingRef = useRef<((d: any) => void) | null>(null);
  const pendingPatchRef = useRef<ObsSettings | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const call = useCallback((requestType: string, requestData?: object): Promise<any> => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.resolve(null);
    return new Promise((resolve) => {
      const requestId = `r${reqIdRef.current++}`;
      pendingRef.current = (d) => resolve(d);
      ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData: requestData ?? {} } }));
      const handler = (evt: MessageEvent) => {
        try {
          const msg = JSON.parse(evt.data as string);
          if (msg.op === 7 && msg.d?.requestId === requestId) {
            ws.removeEventListener('message', handler);
            pendingRef.current = null;
            resolve(msg.d);
          }
        } catch { /* ignore */ }
      };
      ws.addEventListener('message', handler);
      setTimeout(() => ws.removeEventListener('message', handler), 4000);
    });
  }, []);

  useEffect(() => {
    disposedRef.current = false;

    function connect() {
      if (disposedRef.current) return;
      setConnecting(true);
      try {
        const ws = new WebSocket(OBS_WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          // obs-websocket v5 identify handshake
          ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1 } }));
        };
        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data as string);
            if (msg.op === 2) {
              attemptRef.current = 0;
              setConnected(true);
              setConnecting(false);
              // pull current filter settings + virtual cam state
              void call('GetSourceFilterList', { sourceName: SOURCE_NAME }).then((d) => {
                if (!d) return;
                const f = (d.responseData?.filters ?? []).find(
                  (x: any) => x.filterName === FILTER_NAME);
                if (f) setSettings(f.filterSettings ?? {});
              });
              void call('GetVirtualCamStatus').then((d) => {
                if (d) setVirtualCamActive(d.responseData?.outputActive ?? false);
              });
            } else if (msg.op === 7 && pendingRef.current) {
              pendingRef.current(msg.d);
            }
          } catch { /* ignore malformed */ }
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
      if (disposedRef.current) return;
      setConnecting(true);
      const delay = Math.min(1000 * 2 ** Math.min(attemptRef.current, 4), 6000);
      attemptRef.current += 1;
      retryRef.current = setTimeout(connect, delay);
    }

    connect();
    return () => {
      disposedRef.current = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [call]);

  const setParams = useCallback((patch: ObsSettings) => {
    setSettings((prev) => ({ ...(prev ?? {}), ...patch }));
    // Debounce: coalesce rapid slider writes into one OBS call (~150ms).
    // obs-shaderfilter can segfault if settings are rewritten while libobs
    // tears down data structures; rapid-fire writes raise that risk.
    pendingPatchRef.current = { ...(pendingPatchRef.current ?? {}), ...patch };
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      const payload = pendingPatchRef.current;
      pendingPatchRef.current = null;
      if (!payload || Object.keys(payload).length === 0) return;
      void call('SetSourceFilterSettings', {
        sourceName: SOURCE_NAME,
        filterName: FILTER_NAME,
        filterSettings: payload,
        overlay: true,
      });
    }, 150);
  }, [call]);

  const startVirtualCam = useCallback(() => {
    void call('StartVirtualCam').then((d) => {
      if (d && d.requestStatus?.result !== false) setVirtualCamActive(true);
    });
  }, [call]);

  const stopVirtualCam = useCallback(() => {
    void call('StopVirtualCam').then(() => setVirtualCamActive(false));
  }, [call]);

  return { connected, connecting, settings, virtualCamActive, setParams, startVirtualCam, stopVirtualCam };
}
