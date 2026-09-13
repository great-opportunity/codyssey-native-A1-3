# Rewind — 화상영어 복습 도우미

화상영어 수업 대화를 붙여넣으면 AI가 내가 말한 문장 중 어색한 부분을 찾아,
더 자연스러운 표현과 그 이유(학습 포인트)를 알려주는 웹 서비스입니다.

**배포 URL**: <https://rewind-eng-mvp.vercel.app>

## 서비스 소개

- 텍스트 붙여넣기 / txt 파일 / 녹음 파일(m4a·mp3·wav, 20분 내외) 세 가지 방식으로 입력
- 녹음을 올리면 화자를 구분해 받아쓰고, **학습자가 말한 부분만** 골라 분석
- 어색한 문장별로 원문 → 자연스러운 표현 → 이유(문법/표현 포인트)를 카드로 제공
- 반복되는 실수 유형을 따로 묶어 "내 습관"으로 보여줌
- 녹음에서 분석된 문장에는 **그 말을 한 시각**이 표시돼 해당 대목을 다시 들어볼 수 있음

### 녹음 처리 방식

Vercel 함수에는 요청 본문 4.5MB, 실행 시간 5분이라는 제약이 있어서 20분짜리 녹음을
그대로 보낼 수 없다. 그래서 두 단계로 우회한다.

1. **브라우저에서 압축** — Web Audio로 디코딩해 16kHz 모노로 낮추고 mp3(48kbps)로 다시
   인코딩한다. 더 낮추면 용량은 줄지만 목소리의 음색이 뭉개져 화자 구분이 어긋난다.
2. **조각내어 동시 전사** — 2분 30초 단위로 잘라 여러 요청으로 나눠 보낸다. 각 조각은
   실행 시간 제한 안에 끝나고, 동시에 처리되므로 전체 대기 시간도 짧아진다. 각 조각은
   자신이 원본에서 시작하는 위치를 함께 보내 타임스탬프를 원본 기준으로 되돌린다.
   한 조각이 실패해도 나머지로 분석을 이어간다.

## 페이지 구성

| 페이지 | 경로 | 설명 |
| --- | --- | --- |
| 홈 | `index.html` | 서비스 소개, 사용법 3단계 |
| 분석하기 | `analyze.html` | 핵심 기능 — 입력 → AI 분석 → 결과 표시 |
| 가이드 | `guide.html` | 사용법, 자주 하는 실수 유형, FAQ |

## 기술 스택

- **프론트엔드**: HTML / CSS / Vanilla JavaScript (프레임워크 없음)
- **백엔드**: Python — Vercel Serverless Functions (`api/index.py`, 단일 엔드포인트에서 `action` 값으로 분기)
- **AI API**: OpenAI (`gpt-5-mini` for 분석, `gpt-4o-transcribe-diarize` for 화자분리 전사)
  - 모델은 `ANALYSIS_MODEL`, `TRANSCRIBE_MODEL` 환경 변수로 교체 가능
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
│   ├── audio.js        # 녹음 파일 압축·분할 (Web Audio + lamejs)
│   └── analyze.js      # 분석 페이지 로직 (입력, fetch, 결과 렌더링)
├── api/
│   └── index.py          # POST /api — { action: "analyze" | "transcribe", ... }
├── submission/          # 과제 제출용 증빙 (배포에는 쓰이지 않음)
├── deploy.sh            # 배포 스크립트
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

### 처음 한 번

1. Vercel CLI 로그인
   ```bash
   vercel login
   ```
2. 프로젝트 연결 (이름은 소문자만 가능)
   ```bash
   vercel link --yes --project rewind-eng-mvp
   ```
3. [vercel.com](https://vercel.com) → 프로젝트 → **Settings → Environment Variables**에서
   `OPENAI_API_KEY`를 Production 환경에 추가

### 이후 배포할 때마다

```bash
./deploy.sh
```

배포 후 홈/분석하기/가이드 페이지와 AI 분석 기능이 정상 동작하는지 확인합니다.

> **주의** — 이 프로젝트는 `vercel.json`에 `"framework": null`이 필요합니다. 없으면
> Vercel이 `openai` 의존성을 보고 Python 웹 프레임워크 프로젝트로 판단해, 정적 페이지
> 요청까지 전부 `api/index.py`로 보내버립니다.
>
> GitHub 저장소와 Vercel을 연결해 push할 때마다 자동 배포되게 할 수도 있습니다. 다만
> 저장소 소유 계정과 Vercel 계정이 다르면 연결이 실패하므로, 두 계정을 먼저 연결해야
> 합니다.

## 환경 변수

| 변수명 | 설명 | 어디서 설정 |
| --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI API 키. `api/index.py`에서 사용 | 로컬: `.env` (git에 커밋 금지) / 배포: Vercel Project Settings → Environment Variables |

API 키는 절대 프론트엔드 코드나 GitHub에 직접 노출하지 않고, 서버리스 함수(`api/`) 안에서만
환경 변수로 읽어 사용합니다. `.env`는 `.gitignore`에 포함되어 있어 커밋되지 않습니다.

## AI 기능 실패 처리

- **빈 입력**: 텍스트/파일이 비어있으면 요청 전 프론트에서 막고 안내 메시지 표시
- **API 오류(4xx/5xx)**: 서버 응답 에러 시 화면에 친절한 오류 메시지 표시
- **지연/타임아웃**: 응답이 없으면 요청을 중단하고 재시도 안내 메시지 표시. 처리 중에는
  경과 시간과 진행 단계(`화자 나눠서 받아쓰는 중 3/6`)를 표시해 멈춘 것이 아님을 알림
- **일부 구간 실패**: 녹음 조각 하나가 실패해도 나머지로 분석하고, 몇 구간이 빠졌는지 안내
