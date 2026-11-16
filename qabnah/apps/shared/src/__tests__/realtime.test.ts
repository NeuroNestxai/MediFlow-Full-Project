import { describe, expect, it, vi } from 'vitest';
import { RealtimeClient } from '../realtime/client';
import { ApiClient } from '../api/client';
import { createTokenStore } from '../auth/tokenStore';

class FakeSocket {
  static last: FakeSocket;
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { FakeSocket.last = this; }
  send(s: string) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  emit(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

describe('RealtimeClient', () => {
  it('connects with the token, subscribes, dispatches events and resubscribes after reconnect', async () => {
    vi.useFakeTimers();
    const tokens = createTokenStore('rt');
    tokens.set({ accessToken: 'TOKEN', refreshToken: 'R' });
    const api = new ApiClient({ baseUrl: 'http://localhost:4100/v1', tokens });
    const rt = new RealtimeClient({ api, createSocket: (u) => new FakeSocket(u) as unknown as WebSocket });
    const handler = vi.fn();
    const off = rt.subscribe('merchant:abc', handler);
    const s1 = FakeSocket.last;
    expect(s1.url).toBe('ws://localhost:4100/v1/realtime?token=TOKEN');
    s1.open();
    expect(s1.sent).toContainEqual({ type: 'subscribe', channel: 'merchant:abc' });
    s1.emit({ type: 'event', channel: 'merchant:abc', event: 'order.created', data: { orderId: 'o1' }, id: 1 });
    expect(handler).toHaveBeenCalledWith({ channel: 'merchant:abc', event: 'order.created', data: { orderId: 'o1' }, id: 1 });
    s1.onclose?.({ code: 1006 });
    expect(rt.status).toBe('closed');
    await vi.advanceTimersByTimeAsync(2000);
    const s2 = FakeSocket.last;
    expect(s2).not.toBe(s1);
    s2.open();
    expect(s2.sent).toContainEqual({ type: 'subscribe', channel: 'merchant:abc' });
    off();
    expect(s2.sent).toContainEqual({ type: 'unsubscribe', channel: 'merchant:abc' });
    rt.stop();
    vi.useRealTimers();
  });
});
