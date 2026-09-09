from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import os
import io

from openai import OpenAI

# Vercel 함수의 요청 본문 상한이 4.5MB라 그보다 조금 낮게 잡는다.
# 프론트에서 16kHz 모노로 압축해 보내므로 20분 남짓까지 들어온다.
MAX_AUDIO_BYTES = 4_300_000

# 60분 수업 녹취록도 잘리지 않을 만한 상한 (영어 기준 약 1만 토큰)
MAX_TRANSCRIPT_CHARS = 40000

# 환경 변수로 모델을 바꿔 끼울 수 있게 해둔다 (배포 없이 실험 가능)
ANALYSIS_MODEL = os.environ.get("ANALYSIS_MODEL", "gpt-5-mini")
TRANSCRIBE_MODEL = os.environ.get("TRANSCRIBE_MODEL", "gpt-4o-transcribe-diarize")

SYSTEM_PROMPT = """당신은 한국인 영어 학습자의 화상영어 수업 녹취록을 검토하는 전문 \
영어 튜터입니다.

입력은 음성 인식으로 자동 전사된 녹취록입니다. 구두점과 문장 경계가 없고, 학습자와 \
튜터의 말이 끊김 없이 이어져 있을 수 있습니다.

# 화자 구분
녹취록은 세 가지 형태 중 하나로 들어옵니다.

1. "Me:"(학습자), "Tutor:"(튜터)처럼 역할이 적혀 있는 경우 → 학습자 부분만 분석합니다.
2. "A:", "B:"처럼 익명 화자 기호만 있는 경우 → 어느 쪽이 학습자인지 문맥으로 판단한 \
뒤, 그 화자의 발화만 분석합니다. 긴 녹음은 구간을 나눠 받아쓰기 때문에 **같은 기호가 \
구간마다 다른 사람을 가리킬 수 있습니다.** 시각이 처음으로 되돌아가거나 흐름이 끊기면 \
새 구간이 시작된 것이니, 누가 학습자인지 그 구간에서 다시 판단하세요.
3. 화자 표시가 아예 없는 경우 → 문맥으로 학습자의 말을 골라냅니다.

학습자는 보통 이런 쪽입니다:
- 질문을 받고 대답하는 쪽
- 한국 생활, 한국어 단어, 자기 가족 이야기를 하는 쪽
- 문법 오류나 어색한 표현이 나타나는 쪽

튜터는 수업을 이끌고 설명하며 "can you read", "let's see here", "exactly", "right" \
같은 말을 자주 합니다. 튜터의 발화는 분석 대상에서 제외하세요. 누가 말했는지 확실하지 \
않은 부분은 그냥 넘어가세요.

# 절대 지적하지 말아야 할 것
- 구두점과 대소문자: 전사기가 만든 것입니다. 교정문이 원문과 **구두점이나 대소문자만 \
다르다면 그 항목은 만들지 마세요.** 쉼표, 마침표, 물음표를 넣고 빼는 것은 학습 \
포인트가 아닙니다.
- 음성 인식 오류: 발음이 비슷한 엉뚱한 단어, 한국어를 소리 나는 대로 받아적은 것, \
문맥상 말이 안 되는 단어. 학습자의 실수가 아닙니다.
- 필러와 말더듬: um, uh, you know, I mean, like, yeah yeah 같은 것과 단어 반복.
- 자기 수정: 학습자가 말하다가 스스로 고친 경우(예: "invokes... involve involve"), \
최종적으로 맞게 고쳤다면 지적하지 마세요.

# 분석할 것
원어민이 듣기에 어색하거나 부자연스럽거나 문법적으로 틀린 문장을 찾으세요. \
문법 오류뿐 아니라 **뜻은 통하지만 원어민이라면 그렇게 말하지 않을 표현**도 \
적극적으로 잡아주세요. 학습자에게는 이런 것이 가장 도움이 됩니다.

각 항목마다:
- "original": 학습자가 말한 부분을 알아볼 수 있게 옮기세요. 원문에 구두점이 없으므로 \
읽기 쉽도록 최소한의 구두점과 대문자만 복원해도 됩니다. 단어를 바꾸거나 없던 문장을 \
지어내지 마세요. 화자 기호와 시각 표시는 빼고 발화 내용만 담으세요.
- "suggestion": 자연스럽게 교정한 문장
- "reason": 왜 어색했는지와 학습 포인트(문법 규칙, 자연스러운 표현 등)를 한국어로 \
간단히 설명
- "timestamp": 녹취록에 "[12:34]" 같은 시각 표시가 있으면 그 발화가 시작된 시각을 \
"12:34" 형태로 넣으세요. 시각 표시가 없으면 빈 문자열로 두세요.

이미 자연스러운 문장은 제외하되, 고칠 거리가 있는데 그냥 넘어가지는 마세요. \
녹취록이 길면 보통 5~8개는 나옵니다. 최대 8개까지, 가장 도움이 될 것 위주로 고르세요.

# 반복 패턴
위에서 고른 항목들을 훑어보고, 학습자가 **반복적으로** 저지르는 실수 유형을 최대 \
4개까지 뽑으세요. 항목에서 실제로 관찰된 것만 패턴으로 만들고, 한 번만 나온 유형은 \
넣지 마세요. 각 항목마다:
- "label": 패턴 이름 (예: "과거시제 누락", "관사 빠뜨림", "전치사 오용")
- "count": 위 항목들에서 이 유형이 나타난 횟수 (숫자)
- "advice": 다음 수업에서 의식하면 좋을 점을 한국어 한두 문장으로

# 출력 형식
다른 텍스트 없이 아래와 정확히 같은 형태의 JSON 객체로만 응답하세요:
{
  "summary": "<전반적인 피드백 한두 문장, 한국어>",
  "patterns": [
    {"label": "...", "count": 3, "advice": "..."}
  ],
  "items": [
    {"original": "...", "suggestion": "...", "reason": "...", "timestamp": "12:34"}
  ]
}

어색한 문장이 없으면 items와 patterns를 빈 배열로 두고, 긍정적이고 격려하는 요약을 \
작성하세요."""


def _format_timestamp(seconds):
    try:
        total = int(float(seconds))
    except (TypeError, ValueError):
        return ""
    return f"{total // 60:02d}:{total % 60:02d}"


def _segments_to_text(segments, offset_seconds=0.0):
    """화자분리 결과를 '[분:초] 화자: 발화' 줄들로 바꾼다.

    전사기는 한 사람의 말도 숨 쉬는 지점마다 잘라서 돌려주기 때문에
    ("Hi," / "how are you doing today?") 같은 화자가 이어 말한 조각은
    한 줄로 합친다. 문장이 온전해야 분석 단계에서 제대로 판단할 수 있다.
    """
    lines = []
    current_speaker = None
    current_stamp = ""
    buffer = []

    def flush():
        if not buffer:
            return
        prefix = f"[{current_stamp}] " if current_stamp else ""
        lines.append(f"{prefix}{current_speaker}: {' '.join(buffer)}")

    for seg in segments:
        text = (getattr(seg, "text", None) or "").strip()
        if not text:
            continue
        speaker = getattr(seg, "speaker", None) or "?"

        if speaker != current_speaker:
            flush()
            buffer = []
            current_speaker = speaker
            start = getattr(seg, "start", None)
            try:
                current_stamp = _format_timestamp(float(start) + offset_seconds)
            except (TypeError, ValueError):
                current_stamp = ""

        buffer.append(text)

    flush()
    return "\n".join(lines)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        query = parse_qs(urlparse(self.path).query)
        if (query.get("action") or [None])[0] == "transcribe":
            try:
                offset = float((query.get("offset") or ["0"])[0])
            except ValueError:
                offset = 0.0
            self._handle_transcribe(offset)
            return

        try:
            content_length = int(self.headers.get("Content-Length", 0) or 0)
            raw_body = self.rfile.read(content_length) if content_length else b""
            data = json.loads(raw_body or b"{}")
        except Exception:
            self._send_json(400, {"error": "요청 형식이 올바르지 않습니다."})
            return

        if data.get("action") == "analyze":
            self._handle_analyze(data)
        else:
            self._send_json(400, {"error": "알 수 없는 요청입니다."})

    def _handle_analyze(self, data):
        transcript = (data.get("transcript") or "").strip()
        if not transcript:
            self._send_json(
                400, {"error": "빈 입력입니다. 텍스트를 입력하거나 파일을 업로드해주세요."}
            )
            return

        if len(transcript) > MAX_TRANSCRIPT_CHARS:
            transcript = transcript[:MAX_TRANSCRIPT_CHARS]

        try:
            client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
            completion = client.chat.completions.create(
                model=ANALYSIS_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": transcript},
                ],
                response_format={"type": "json_object"},
                timeout=240,
            )
            result = json.loads(completion.choices[0].message.content)
        except Exception:
            self._send_json(
                502,
                {"error": "AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."},
            )
            return

        result.setdefault("items", [])
        result.setdefault("patterns", [])
        result.setdefault("summary", "")

        self._send_json(200, result)

    def _handle_transcribe(self, offset_seconds=0.0):
        """압축된 오디오 조각을 본문 그대로 받아 화자분리 전사한다.

        base64로 감싸면 용량이 1.33배가 되어 4.5MB 상한에 금방 걸리므로
        바이너리를 그대로 싣는다. offset_seconds는 이 조각이 원본 녹음에서
        시작하는 위치이며, 타임스탬프를 원본 기준으로 되돌리는 데 쓴다.
        """
        content_length = int(self.headers.get("Content-Length", 0) or 0)

        if content_length <= 0:
            self._send_json(400, {"error": "음성 파일이 비어있습니다."})
            return

        if content_length > MAX_AUDIO_BYTES:
            self._send_json(
                413,
                {
                    "error": "압축한 뒤에도 파일이 너무 큽니다. 녹음을 나눠서 올리거나 "
                    "텍스트로 변환해 붙여넣어 주세요."
                },
            )
            return

        audio_bytes = self.rfile.read(content_length)

        # 프론트에서 항상 mp3로 변환해 보내므로 파일명은 고정한다.
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = "lesson.mp3"

        try:
            client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
            transcription = client.audio.transcriptions.create(
                model=TRANSCRIBE_MODEL,
                file=audio_file,
                response_format="diarized_json",
                # 화자분리 모델은 이 값을 반드시 요구한다.
                chunking_strategy="auto",
                timeout=240,
            )
        except Exception:
            self._send_json(
                502,
                {"error": "음성 전사 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."},
            )
            return

        segments = getattr(transcription, "segments", None) or []
        text = _segments_to_text(segments, offset_seconds)

        if not text:
            text = (getattr(transcription, "text", None) or "").strip()

        if not text:
            self._send_json(
                502, {"error": "전사 결과가 비어있습니다. 녹음 상태를 확인해주세요."}
            )
            return

        speakers = sorted(
            {getattr(seg, "speaker", None) for seg in segments if getattr(seg, "speaker", None)}
        )

        self._send_json(
            200,
            {
                "transcript": text,
                "speakers": speakers,
                "duration": getattr(transcription, "duration", None),
            },
        )

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
