from http.server import BaseHTTPRequestHandler
import json
import os
import base64
import io

from openai import OpenAI

MAX_AUDIO_BYTES = 3 * 1024 * 1024

SYSTEM_PROMPT = """You are an expert English tutor reviewing a transcript of a Korean \
English learner's video-call English lesson.

The transcript may include speaker labels such as "Me:" (the learner) and "Tutor:" \
(the teacher). If speaker labels exist, only analyze sentences spoken by "Me" (the \
learner). If no speaker labels exist, treat the entire text as spoken by the learner.

Find sentences that sound awkward, unnatural, or grammatically incorrect for a native \
English speaker. For each one, provide:
- "original": the exact original sentence as spoken
- "suggestion": a natural, corrected version of the sentence
- "reason": a brief explanation IN KOREAN of why it was awkward and what the learning \
point is (grammar rule, natural phrasing, etc.)

Only include genuinely awkward or incorrect sentences - skip sentences that are \
already natural. Limit to at most 8 items, prioritizing the most useful learning \
points.

Respond with ONLY a JSON object in this exact shape, no extra text:
{
  "summary": "<one or two sentence overall feedback, in Korean>",
  "items": [
    {"original": "...", "suggestion": "...", "reason": "..."}
  ]
}

If there are no awkward sentences, return an empty items array and a positive, \
encouraging summary."""


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0) or 0)
            raw_body = self.rfile.read(content_length) if content_length else b""
            data = json.loads(raw_body or b"{}")
        except Exception:
            self._send_json(400, {"error": "요청 형식이 올바르지 않습니다."})
            return

        action = data.get("action")

        if action == "analyze":
            self._handle_analyze(data)
        elif action == "transcribe":
            self._handle_transcribe(data)
        else:
            self._send_json(400, {"error": "알 수 없는 요청입니다."})

    def _handle_analyze(self, data):
        transcript = (data.get("transcript") or "").strip()
        if not transcript:
            self._send_json(
                400, {"error": "빈 입력입니다. 텍스트를 입력하거나 파일을 업로드해주세요."}
            )
            return

        if len(transcript) > 12000:
            transcript = transcript[:12000]

        try:
            client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
            completion = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": transcript},
                ],
                response_format={"type": "json_object"},
                temperature=0.3,
                timeout=25,
            )
            result = json.loads(completion.choices[0].message.content)
        except Exception:
            self._send_json(
                502,
                {"error": "AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."},
            )
            return

        if "items" not in result:
            result["items"] = []
        if "summary" not in result:
            result["summary"] = ""

        self._send_json(200, result)

    def _handle_transcribe(self, data):
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
            client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
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
