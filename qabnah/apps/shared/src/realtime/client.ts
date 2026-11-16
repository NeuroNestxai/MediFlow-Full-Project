import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ApiClient } from '../api/client';

export interface RealtimeEvent<T = Record<string, unknown>> { channel: string; event: string; data: T; id?: number }
export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'closed';
type Handler = (e: RealtimeEvent) => void;

interface Options {
  api: ApiClient;
  /** Factory for tests. */
  createSocket?: (url: string) => WebSocket;
  pingIntervalMs?: number;
  maxBackoffMs?: number;
}

/**
 * WebSocket client for `/v1/realtime`: subscribes to channels, re-subscribes after reconnecting,
 * reconnects with exponential backoff, refreshes the access token when the server rejects it, and pings
 * to keep proxies from closing idle sockets.
 */
export class RealtimeClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private statusListeners = new Set<() => void>();
  private _status: RealtimeStatus = 'idle';
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = true;
  private readonly opts: Required<Omit<Options, 'createSocket'>> & Pick<Options, 'createSocket'>;
  readonly errors: { channel?: string; code: string }[] = [];

  constructor(opts: Options) {
    this.opts = { pingIntervalMs: 25_000, maxBackoffMs: 30_000, ...opts };
  }

  get status() { return this._status; }

  onStatus(fn: () => void) {
    this.statusListeners.add(fn);
    return () => { this.statusListeners.delete(fn); };
  }

  private setStatus(s: RealtimeStatus) {
    this._status = s;
    this.statusListeners.forEach((l) => l());
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState <= 1) ws.close(1000, 'client stop');
    this.setStatus('idle');
  }

  /** Subscribe a handler to a channel; returns an unsubscribe function. */
  subscribe(channel: string, handler: Handler): () => void {
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
      this.sendRaw({ type: 'subscribe', channel });
    }
    set.add(handler);
    if (this.stopped) this.start();
    return () => {
      const s = this.handlers.get(channel);
      if (!s) return;
      s.delete(handler);
      if (s.size === 0) {
        this.handlers.delete(channel);
        this.sendRaw({ type: 'unsubscribe', channel });
      }
    };
  }

  private sendRaw(msg: unknown) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  private connect() {
    if (this.stopped) return;
    const token = this.opts.api.tokens.get()?.accessToken;
    if (!token) { this.setStatus('closed'); return; }
    this.setStatus('connecting');
    let ws: WebSocket;
    try {
      const url = this.opts.api.realtimeUrl(token);
      ws = this.opts.createSocket ? this.opts.createSocket(url) : new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.setStatus('open');
      for (const ch of this.handlers.keys()) ws.send(JSON.stringify({ type: 'subscribe', channel: ch }));
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.sendRaw({ type: 'ping' }), this.opts.pingIntervalMs);
    };
    ws.onmessage = (m) => {
      let msg: { type?: string; channel?: string; event?: string; data?: Record<string, unknown>; id?: number; code?: string };
      try { msg = JSON.parse(String(m.data)); } catch { return; }
      if (msg.type === 'event' && msg.channel && msg.event) {
        const evt: RealtimeEvent = { channel: msg.channel, event: msg.event, data: msg.data ?? {}, id: msg.id };
        this.handlers.get(msg.channel)?.forEach((h) => { try { h(evt); } catch (e) { console.error(e); } });
      } else if (msg.type === 'error' && msg.code) {
        this.errors.push({ channel: msg.channel, code: msg.code });
      }
    };
    ws.onclose = async (ev) => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.ws !== ws) return;
      this.ws = null;
      this.setStatus('closed');
      if (this.stopped) return;
      if (ev.code === 4401) await this.opts.api.refresh();
      this.scheduleReconnect();
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(this.opts.maxBackoffMs, 1000 * 2 ** this.attempts) * (0.75 + Math.random() * 0.5);
    this.attempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /** Force a reconnect (e.g. after the user signs in again). */
  restart() {
    this.stop();
    this.start();
  }
}

/** Subscribe to a channel for the lifetime of a component. Pass `null` to skip. */
export function useRealtimeChannel(client: RealtimeClient | null, channel: string | null, handler: Handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!client || !channel) return;
    return client.subscribe(channel, (e) => ref.current(e));
  }, [client, channel]);
}

export function useRealtimeStatus(client: RealtimeClient | null): RealtimeStatus {
  return useSyncExternalStore(
    (cb) => (client ? client.onStatus(cb) : () => undefined),
    () => client?.status ?? 'idle',
    () => 'idle',
  );
}
