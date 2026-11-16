#!/usr/bin/env python3
"""Minimal WebSocket server (stdlib only) that speaks the Qabnah realtime protocol, for the
opt-in RealtimeClient integration test.

    python3 Tests/ws_test_server.py 8765 &
    QABNAH_WS_TEST_URL=ws://127.0.0.1:8765/v1/realtime swift test --filter RealtimeIntegrationTests

Behaviour:
- Rejects the upgrade (401) unless `?token=T1`.
- `ping` -> `pong`; `subscribe` -> `subscribed` + one `delivery.location` event on that channel.
- The FIRST connection is dropped right after its first event, to exercise reconnect + resubscribe.
- `location` messages are acknowledged with an `event` on `captain:me` named `test.location_ack`.
"""
import base64
import hashlib
import json
import socket
import struct
import sys
import threading

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
connections = 0
lock = threading.Lock()


def recv_exact(conn, n):
    buf = b""
    while len(buf) < n:
        chunk = conn.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("closed")
        buf += chunk
    return buf


def read_frame(conn):
    b1, b2 = recv_exact(conn, 2)
    opcode = b1 & 0x0F
    masked = b2 & 0x80
    length = b2 & 0x7F
    if length == 126:
        length = struct.unpack(">H", recv_exact(conn, 2))[0]
    elif length == 127:
        length = struct.unpack(">Q", recv_exact(conn, 8))[0]
    mask = recv_exact(conn, 4) if masked else b"\0\0\0\0"
    payload = bytearray(recv_exact(conn, length))
    for i in range(length):
        payload[i] ^= mask[i % 4]
    return opcode, bytes(payload)


def send_frame(conn, data, opcode=0x1):
    header = bytes([0x80 | opcode])
    n = len(data)
    if n < 126:
        header += bytes([n])
    elif n < 65536:
        header += bytes([126]) + struct.pack(">H", n)
    else:
        header += bytes([127]) + struct.pack(">Q", n)
    conn.sendall(header + data)


def send_json(conn, obj):
    send_frame(conn, json.dumps(obj).encode())


def handle(conn):
    global connections
    request = b""
    while b"\r\n\r\n" not in request:
        chunk = conn.recv(4096)
        if not chunk:
            return
        request += chunk
    lines = request.decode(errors="replace").split("\r\n")
    path = lines[0].split(" ")[1]
    headers = {k.strip().lower(): v.strip() for k, v in (l.split(":", 1) for l in lines[1:] if ":" in l)}
    if "token=T1" not in path:
        conn.sendall(b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n")
        conn.close()
        return
    accept = base64.b64encode(hashlib.sha1((headers["sec-websocket-key"] + GUID).encode()).digest()).decode()
    conn.sendall(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                  f"Sec-WebSocket-Accept: {accept}\r\n\r\n").encode())
    with lock:
        connections += 1
        number = connections
    print(f"[ws] connection #{number} {path}", flush=True)
    try:
        while True:
            opcode, payload = read_frame(conn)
            if opcode == 0x8:  # close
                return
            if opcode == 0x9:  # ping frame
                send_frame(conn, payload, 0xA)
                continue
            msg = json.loads(payload)
            print(f"[ws] #{number} <- {msg}", flush=True)
            t = msg.get("type")
            if t == "ping":
                send_json(conn, {"type": "pong"})
            elif t == "subscribe":
                ch = msg["channel"]
                send_json(conn, {"type": "subscribed", "channel": ch})
                send_json(conn, {"type": "event", "channel": ch, "event": "delivery.location",
                                 "data": {"lat": 23.6, "lng": 58.4 + number / 100, "heading": 90}, "id": number})
                if number == 1:
                    conn.close()  # force a reconnect
                    return
            elif t == "location":
                send_json(conn, {"type": "event", "channel": "captain:me", "event": "test.location_ack",
                                 "data": msg, "id": 1000 + number})
    except (ConnectionError, OSError):
        return
    finally:
        conn.close()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", port))
    srv.listen(8)
    print(f"[ws] listening on {port}", flush=True)
    while True:
        conn, _ = srv.accept()
        threading.Thread(target=handle, args=(conn,), daemon=True).start()


if __name__ == "__main__":
    main()
