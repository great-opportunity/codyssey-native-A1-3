# Rewind — 화상영어 복습 도우미

화상영어 수업 대화를 붙여넣으면 AI가 내가 말한 문장 중 어색한 부분을 찾아,
더 자연스러운 표현과 그 이유(학습 포인트)를 알려주는 웹 서비스입니다.

**배포 URL**: _(배포 후 이곳에 Vercel URL을 채워주세요, 예: https://rewind-english.vercel.app)_

## 서비스 소개

- 텍스트 붙여넣기 / txt 파일 업로드 / 짧은 mp3 업로드(3MB 이하) 세 가지 방식으로 수업 내용을 입력
- AI(OpenAI GPT)가 화자 표시(`Me:` / `Tutor:`)를 참고해 학습자가 말한 문장만 골라 분석
- 어색한 문장별로 원문 → 자연스러운 표현 → 이유(문법/표현 포인트)를 카드로 제공
- mp3 업로드 시 OpenAI Whisper API로 먼저 텍스트 전사 후 동일한 분석 파이프라인 사용

## 페이지 구성

| 페이지 | 경로 | 설명 |
| --- | --- | --- |
| 홈 | `index.html` | 서비스 소개, 사용법 3단계 |
| 분석하기 | `analyze.html` | 핵심 기능 — 입력 → AI 분석 → 결과 표시 |
| 가이드 | `guide.html` | 사용법, 자주 하는 실수 유형, FAQ |

## 기술 스택

- **프론트엔드**: HTML / CSS / Vanilla JavaScript (프레임워크 없음)
- **백엔드**: Python — Vercel Serverless Functions (`api/analyze.py`, `api/transcribe.py`)
- **AI API**: OpenAI (`gpt-4o-mini` for 분석, `whisper-1` for 음성 전사)
- **배포**: Vercel (GitHub 연동 자동 배포)

## 프로젝트 구조

```
.
├── index.html
├── analyze.html
├── guide.html
├── css/
│   └── style.css
├── js/
│   ├── main.js        # 공통 (모바일 내비게이션)
│   └── analyze.js      # 분석 페이지 로직 (입력, fetch, 결과 렌더링)
├── api/
│   ├── analyze.py       # POST /api/analyze — 텍스트 분석
│   └── transcribe.py    # POST /api/transcribe — mp3 → 텍스트 전사
├── requirements.txt
├── vercel.json
└── .env.example
```

## 로컬 실행 방법

1. 저장소 클론 후 디렉터리 이동
2. Vercel CLI 설치 (최초 1회)
   ```bash
   npm i -g vercel
   ```
3. 프로젝트 루트에 `.env` 파일 생성 후 `.env.example` 참고해 `OPENAI_API_KEY` 입력
4. 로컬 개발 서버 실행 (정적 파일 + Python 서버리스 함수를 함께 구동)
   ```bash
   vercel dev
   ```
5. 브라우저에서 안내된 로컬 주소(기본 `http://localhost:3000`)로 접속

> 정적 파일만 확인할 때는 `index.html`을 브라우저로 바로 열어도 되지만,
> `/api/*` 호출이 필요한 분석 기능은 `vercel dev`(또는 배포 환경)에서만 동작합니다.

## 배포 방법 (Vercel)

1. GitHub에 저장소를 push
2. [vercel.com](https://vercel.com)에서 New Project → 해당 GitHub 저장소 Import
3. Framework Preset은 **Other**로 두고 그대로 진행 (별도 빌드 명령 불필요)
4. **Settings → Environment Variables**에서 아래 환경 변수를 추가
   - `OPENAI_API_KEY` = 발급받은 OpenAI API 키
5. Deploy 후 발급된 URL로 접속해 홈/분석하기/가이드 페이지와 AI 분석 기능이 정상 동작하는지 확인
6. 코드 수정 후 다시 `git push`하면 Vercel이 자동으로 재배포합니다

## 환경 변수

| 변수명 | 설명 | 어디서 설정 |
| --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI API 키. `api/analyze.py`, `api/transcribe.py`에서 사용 | 로컬: `.env` (git에 커밋 금지) / 배포: Vercel Project Settings → Environment Variables |

API 키는 절대 프론트엔드 코드나 GitHub에 직접 노출하지 않고, 서버리스 함수(`api/`) 안에서만
환경 변수로 읽어 사용합니다. `.env`는 `.gitignore`에 포함되어 있어 커밋되지 않습니다.

## AI 기능 실패 처리

- **빈 입력**: 텍스트/파일이 비어있으면 요청 전 프론트에서 막고 안내 메시지 표시
- **API 오류(4xx/5xx)**: 서버 응답 에러 시 화면에 친절한 오류 메시지 표시
- **지연/타임아웃**: 30초 이상 응답이 없으면 요청을 중단하고 재시도 안내 메시지 표시
