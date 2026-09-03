from http.server import BaseHTTPRequestHandler
import json
import os
import base64
import io

from openai import OpenAI

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

MAX_AUDIO_BYTES = 3 * 1024 * 1024


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0) or 0)
            raw_body = self.rfile.read(content_length) if content_length else b""
            data = json.loads(raw_body or b"{}")
        except Exception:
            self._send_json(400, {"error": "요청 형식이 올바르지 않습니다."})
            return

        audio_b64 = data.get("audio_base64") or ""
        filename = data.get("filename") or "audio.mp3"

        if not audio_b64:
            self._send_json(400, {"error": "음성 파일이 비어있습니다."})
            return

        try:
            audio_bytes = base64.b64decode(audio_b64)
        except Exception:
            self._send_json(400, {"error": "음성 파일을 읽을 수 없습니다."})
            return

        if len(audio_bytes) > MAX_AUDIO_BYTES:
            self._send_json(
                400,
                {
                    "error": "음성 파일이 너무 큽니다(3MB 이하만 지원). "
                    "다른 도구로 텍스트 변환 후 txt로 업로드해주세요."
                },
            )
            return

        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = filename

        try:
            transcript = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                timeout=25,
            )
        except Exception:
            self._send_json(
                502,
                {"error": "음성 전사 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."},
            )
            return

        self._send_json(200, {"transcript": transcript.text})

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors_headers()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
