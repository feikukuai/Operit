#!/usr/bin/env python3

import argparse
import json
import os
import tempfile
import threading
import time
import urllib.parse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


MAX_QUEUE_ITEMS = 200
OPCODE_DISPATCH = 0
OPCODE_HEARTBEAT = 1
OPCODE_HEARTBEAT_ACK = 11
OPCODE_CALLBACK_ACK = 12
OPCODE_CALLBACK_VALIDATION = 13


def now_ms() -> int:
    return int(time.time() * 1000)


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def first_non_blank(*values) -> str:
    for value in values:
        text = "" if value is None else str(value).strip()
        if text:
            return text
    return ""


def as_text(value) -> str:
    return "" if value is None else str(value)


def is_object(value) -> bool:
    return isinstance(value, dict)


def ensure_parent_dir(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)


def atomic_write_text(path: str, content: str) -> None:
    ensure_parent_dir(path)
    fd, temp_path = tempfile.mkstemp(prefix=".qqbot_", dir=os.path.dirname(path))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
        os.replace(temp_path, path)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)


def atomic_write_json(path: str, payload) -> None:
    atomic_write_text(path, json.dumps(payload, ensure_ascii=False))


def read_json_file(path: str, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as handle:
            parsed = json.load(handle)
        return parsed
    except Exception:
        return default


def resolve_local_connect_host(host: str) -> str:
    normalized = host.strip().lower()
    if normalized in ("", "0.0.0.0", "::", "[::]"):
        return "127.0.0.1"
    return host.strip()


def build_callback_url(host: str, port: int, path: str) -> str:
    return f"http://{resolve_local_connect_host(host)}:{port}{path}"


def build_public_callback_url(public_base_url: str, callback_path: str) -> str:
    base = public_base_url.strip().rstrip("/")
    if not base:
        return ""
    return f"{base}{callback_path}"


def build_seed_bytes(secret: str) -> bytes:
    seed = secret or ""
    while len(seed) < 32:
        seed += seed
    return seed[:32].encode("utf-8")


def build_callback_payload_bytes(timestamp: str, body_bytes: bytes) -> bytes:
    return timestamp.encode("utf-8") + body_bytes


def generate_signature_hex(secret: str, payload_bytes: bytes) -> str:
    private_key = Ed25519PrivateKey.from_private_bytes(build_seed_bytes(secret))
    return private_key.sign(payload_bytes).hex()


def verify_signature_hex(secret: str, payload_bytes: bytes, signature_hex: str) -> bool:
    try:
        private_key = Ed25519PrivateKey.from_private_bytes(build_seed_bytes(secret))
        public_key = private_key.public_key()
        public_key.verify(bytes.fromhex(signature_hex.strip()), payload_bytes)
        return True
    except Exception:
        return False


class QQBotService:
    def __init__(self, args):
        self.package_version = args.package_version
        self.host = args.host
        self.port = args.port
        self.callback_path = args.callback_path
        self.control_path = args.control_path
        self.public_base_url = args.public_base_url or ""
        self.source = args.source or "manual"
        self.app_secret = args.app_secret
        self.state_dir = args.state_dir
        self.state_file = os.path.join(self.state_dir, "service_state.json")
        self.queue_file = os.path.join(self.state_dir, "event_queue.json")
        self.pid_file = os.path.join(self.state_dir, "service.pid")
        self.control_token = args.control_token
        self.started_at = 0
        self.last_packet_at = 0
        self.last_event_at = 0
        self.packet_count = 0
        self.event_count = 0
        self.stop_reason = ""
        self.last_error = ""
        self.server = None
        self.lock = threading.RLock()
        os.makedirs(self.state_dir, exist_ok=True)

    def queue_summary(self):
        queue = read_json_file(self.queue_file, [])
        if not isinstance(queue, list):
            queue = []
        oldest = ""
        newest = ""
        if queue:
            oldest_item = queue[0] if is_object(queue[0]) else {}
            newest_item = queue[-1] if is_object(queue[-1]) else {}
            oldest = first_non_blank(oldest_item.get("receivedAt"), oldest_item.get("timestamp"))
            newest = first_non_blank(newest_item.get("receivedAt"), newest_item.get("timestamp"))
        return {
            "pendingCount": len(queue),
            "oldestEventAt": oldest,
            "newestEventAt": newest,
        }

    def persist_state(self, running: bool):
        payload = {
            "packageVersion": self.package_version,
            "callbackHost": self.host,
            "callbackPort": self.port,
            "callbackPath": self.callback_path,
            "publicBaseUrl": self.public_base_url,
            "publicCallbackUrl": build_public_callback_url(self.public_base_url, self.callback_path),
            "localCallbackUrl": build_callback_url(self.host, self.port, self.callback_path),
            "controlPath": self.control_path,
            "running": running,
            "startedAt": self.started_at,
            "stoppedAt": 0 if running else now_ms(),
            "stopReason": self.stop_reason,
            "lastError": self.last_error,
            "lastPacketAt": self.last_packet_at,
            "lastEventAt": self.last_event_at,
            "packetCount": self.packet_count,
            "eventCount": self.event_count,
            "controlToken": self.control_token,
            "source": self.source,
            "mode": "terminal",
            "pid": os.getpid(),
        }
        atomic_write_json(self.state_file, payload)

    def persist_started(self):
        self.persist_state(True)

    def persist_stopped(self):
        self.persist_state(False)

    def append_event(self, event):
        with self.lock:
            queue = read_json_file(self.queue_file, [])
            if not isinstance(queue, list):
                queue = []
            queue.append(event)
            if len(queue) > MAX_QUEUE_ITEMS:
                queue = queue[-MAX_QUEUE_ITEMS:]
            atomic_write_json(self.queue_file, queue)

    def build_event(self, payload, raw_body: str, remote_address: str):
        data = payload.get("d") if is_object(payload.get("d")) else {}
        author = data.get("author") if is_object(data.get("author")) else {}
        event_type = first_non_blank(payload.get("t"))
        if event_type == "C2C_MESSAGE_CREATE":
            scene = "c2c"
        elif event_type == "GROUP_AT_MESSAGE_CREATE":
            scene = "group"
        else:
            scene = "unknown"

        user_openid = first_non_blank(
            author.get("user_openid"),
            author.get("id"),
            data.get("user_openid"),
            data.get("openid"),
        )
        group_openid = first_non_blank(data.get("group_openid"), data.get("group_id"))
        message_id = first_non_blank(data.get("id"), payload.get("id"))

        return {
            "scene": scene,
            "eventType": event_type,
            "eventId": first_non_blank(payload.get("id")),
            "seq": int(payload.get("s") or 0),
            "messageId": message_id,
            "content": as_text(data.get("content")),
            "timestamp": as_text(data.get("timestamp")),
            "receivedAt": iso_now(),
            "userOpenId": user_openid,
            "groupOpenId": group_openid,
            "authorId": as_text(author.get("id")),
            "remoteAddress": remote_address,
            "rawBody": raw_body,
            "rawPayload": payload,
            "replyHint": {
                "scene": scene,
                "msg_id": message_id,
                "event_id": first_non_blank(payload.get("id")),
                "openid": user_openid,
                "group_openid": group_openid,
            },
        }

    def handle_control(self, query):
        action = first_non_blank(query.get("action", ["health"])[0], "health")
        if action == "health":
            return 200, {
                "ok": True,
                "packageVersion": self.package_version,
                "service": {
                    "running": True,
                    "startedAt": self.started_at,
                    "lastPacketAt": self.last_packet_at,
                    "lastEventAt": self.last_event_at,
                    "packetCount": self.packet_count,
                    "eventCount": self.event_count,
                    "callbackHost": self.host,
                    "callbackPort": self.port,
                    "callbackPath": self.callback_path,
                    "publicBaseUrl": self.public_base_url,
                    "source": self.source,
                    "mode": "terminal",
                    "pid": os.getpid(),
                },
                "queue": self.queue_summary(),
            }

        provided_token = first_non_blank(query.get("token", [""])[0])
        if provided_token != self.control_token:
            return 403, {"ok": False, "error": "Invalid control token"}

        if action == "stop":
            self.stop_reason = "control_stop"
            threading.Thread(target=self._shutdown_async, daemon=True).start()
            return 200, {"ok": True, "stopping": True, "reason": self.stop_reason}

        return 400, {"ok": False, "error": f"Unsupported control action: {action}"}

    def _shutdown_async(self):
        time.sleep(0.05)
        if self.server is not None:
            self.server.shutdown()

    def write_pid_file(self):
        atomic_write_text(self.pid_file, str(os.getpid()))

    def remove_pid_file(self):
        try:
            if os.path.exists(self.pid_file):
                os.unlink(self.pid_file)
        except Exception:
            pass


def make_handler(service: QQBotService):
    class Handler(BaseHTTPRequestHandler):
        server_version = "QQBotTerminalService/0.1"

        def log_message(self, format, *args):
            return

        def _send_json(self, status_code: int, payload):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)

        def _send_text(self, status_code: int, body_text: str):
            body = body_text.encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            path = urllib.parse.urlsplit(self.path)
            if path.path != service.control_path:
                self._send_json(404, {"ok": False, "error": f"Unexpected path: {path.path}"})
                return

            status_code, payload = service.handle_control(urllib.parse.parse_qs(path.query, keep_blank_values=True))
            self._send_json(status_code, payload)

        def do_POST(self):
            path = urllib.parse.urlsplit(self.path)
            remote_address = self.client_address[0] if self.client_address else "unknown"
            content_length = int(self.headers.get("Content-Length", "0") or "0")
            body_bytes = self.rfile.read(content_length) if content_length > 0 else b""
            body_text = body_bytes.decode("utf-8", errors="replace")

            with service.lock:
                service.last_packet_at = now_ms()
                service.packet_count += 1

            if path.path != service.callback_path:
                service.persist_started()
                self._send_json(404, {"ok": False, "error": f"Unexpected path: {path.path}"})
                return

            signature = first_non_blank(
                self.headers.get("X-Signature-Ed25519"),
                self.headers.get("x-signature-ed25519"),
            )
            timestamp = first_non_blank(
                self.headers.get("X-Signature-Timestamp"),
                self.headers.get("x-signature-timestamp"),
            )
            if not signature or not timestamp:
                service.persist_started()
                self._send_json(401, {"ok": False, "error": "Missing QQ Bot signature headers"})
                return

            payload_bytes = build_callback_payload_bytes(timestamp, body_bytes)
            if not verify_signature_hex(service.app_secret, payload_bytes, signature):
                service.persist_started()
                self._send_json(401, {"ok": False, "error": "QQ Bot signature verification failed"})
                return

            try:
                payload = json.loads(body_text) if body_text.strip() else {}
                if not is_object(payload):
                    payload = {}
            except Exception:
                service.persist_started()
                self._send_json(400, {"ok": False, "error": "Invalid JSON payload"})
                return

            op = int(payload.get("op", -1) or -1)

            if op == OPCODE_CALLBACK_VALIDATION:
                data = payload.get("d") if is_object(payload.get("d")) else {}
                plain_token = first_non_blank(data.get("plain_token"))
                event_ts = first_non_blank(data.get("event_ts"), timestamp)
                validation_signature = generate_signature_hex(
                    service.app_secret,
                    build_callback_payload_bytes(event_ts, plain_token.encode("utf-8")),
                )
                service.persist_started()
                self._send_json(200, {"plain_token": plain_token, "signature": validation_signature})
                return

            if op == OPCODE_HEARTBEAT:
                service.persist_started()
                self._send_json(200, {"op": OPCODE_HEARTBEAT_ACK, "d": payload.get("d", 0)})
                return

            if op == OPCODE_DISPATCH:
                event = service.build_event(payload, body_text, remote_address)
                with service.lock:
                    service.last_event_at = now_ms()
                    service.event_count += 1
                service.append_event(event)
                service.persist_started()
                self._send_json(200, {"op": OPCODE_CALLBACK_ACK, "d": 0})
                return

            service.persist_started()
            self._send_text(200, "")

    return Handler


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", required=True)
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--callback-path", required=True)
    parser.add_argument("--control-path", required=True)
    parser.add_argument("--app-secret", required=True)
    parser.add_argument("--public-base-url", default="")
    parser.add_argument("--source", default="manual")
    parser.add_argument("--package-version", required=True)
    parser.add_argument("--control-token", required=True)
    args = parser.parse_args()

    service = QQBotService(args)
    service.write_pid_file()

    try:
        server = ReusableThreadingHTTPServer((service.host, service.port), make_handler(service))
        service.server = server
        service.started_at = now_ms()
        service.persist_started()
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        service.stop_reason = first_non_blank(service.stop_reason, "keyboard_interrupt")
    except Exception as error:
        service.last_error = f"{error.__class__.__name__}: {error}"
        service.stop_reason = first_non_blank(service.stop_reason, "service_error")
    finally:
        if service.server is not None:
            try:
                service.server.server_close()
            except Exception:
                pass
        service.persist_stopped()
        service.remove_pid_file()


if __name__ == "__main__":
    main()
