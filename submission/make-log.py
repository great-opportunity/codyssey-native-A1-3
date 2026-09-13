#!/usr/bin/env python3
"""Claude Code 세션 기록을 제출용 대화록으로 바꾼다.

원본은 도구 호출까지 전부 담긴 9MB짜리 JSONL이라 그대로는 읽을 수 없다.
사람이 읽을 수 있게 주고받은 말만 남기고, 도구 사용은 어떤 작업을 했는지만
한 줄로 줄인다. 토큰처럼 보이는 문자열은 지운다.
"""
import json
import re
import sys
from pathlib import Path

SESSION = Path.home() / ".claude/projects/-Users-jy-codyssey-codyssey-native-A1-3"
OUT = Path(__file__).parent / "ai-coding-log.md"

# 로그에 섞여 들어갔을 수 있는 비밀값 (JWT, OpenAI/Vercel 키 등)
SECRET_PATTERNS = [
    re.compile(r"eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}"),
    re.compile(r"sk-[A-Za-z0-9_\-]{20,}"),
    re.compile(r"gho_[A-Za-z0-9]{20,}"),
    re.compile(r"ghp_[A-Za-z0-9]{20,}"),
]

TOOL_LABEL = {
    "Write": "파일 작성",
    "Edit": "파일 수정",
    "Read": "파일 확인",
    "Bash": "명령 실행",
    "WebFetch": "문서 조회",
    "WebSearch": "웹 검색",
}


def scrub(text):
    for pattern in SECRET_PATTERNS:
        text = pattern.sub("[비밀값 삭제됨]", text)
    return text


def extract(entry):
    """한 줄의 기록에서 (역할, 내용)을 뽑는다. 남길 게 없으면 None."""
    role = entry.get("message", {}).get("role")
    content = entry.get("message", {}).get("content")

    if role not in ("user", "assistant") or content is None:
        return None

    if isinstance(content, str):
        return (role, content.strip()) if content.strip() else None

    texts = []
    for block in content:
        if not isinstance(block, dict):
            continue
        kind = block.get("type")
        if kind == "text":
            body = block.get("text", "").strip()
            if body:
                texts.append(body)
        elif kind == "tool_use":
            name = block.get("name", "")
            label = TOOL_LABEL.get(name, name)
            target = block.get("input", {}).get("file_path") or \
                block.get("input", {}).get("description") or ""
            target = Path(target).name if "/" in str(target) else target
            texts.append(f"_[{label}{': ' + target if target else ''}]_")

    return (role, "\n\n".join(texts)) if texts else None


def main():
    files = sorted(SESSION.glob("*.jsonl"))
    if not files:
        sys.exit(f"세션 기록을 찾지 못했습니다: {SESSION}")

    turns = []
    for path in files:
        with path.open() as f:
            for line in f:
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                # 요약·메타 항목은 대화가 아니다
                if entry.get("isMeta") or entry.get("type") == "summary":
                    continue
                found = extract(entry)
                if found:
                    turns.append(found)

    lines = [
        "# AI 코딩 도구 사용 기록",
        "",
        "**도구**: Claude Code (Anthropic)  ",
        "**프로젝트**: Rewind — 화상영어 복습 도우미  ",
        f"**주고받은 메시지**: {len(turns)}개",
        "",
        "도구 호출 내역은 `_[파일 작성: index.html]_`처럼 한 줄로 줄였고, "
        "키나 토큰으로 보이는 값은 지웠습니다.",
        "",
        "---",
        "",
    ]

    last_role = None
    for role, text in turns:
        speaker = "🧑 나" if role == "user" else "🤖 Claude"
        if role != last_role:
            lines.append(f"### {speaker}")
            lines.append("")
        lines.append(scrub(text))
        lines.append("")
        last_role = role

    OUT.write_text("\n".join(lines), encoding="utf-8")
    size_kb = OUT.stat().st_size / 1024
    print(f"{OUT.name} 생성 완료 — 메시지 {len(turns)}개, {size_kb:.0f}KB")


if __name__ == "__main__":
    main()
