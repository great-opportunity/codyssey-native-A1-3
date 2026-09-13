# 제출 패키지 준비

미션 요구사항 5번(증빙 자료)을 챙기기 위한 폴더입니다.

## 1. AI 코딩 도구 사용 기록 — 완료

[`ai-coding-log.md`](ai-coding-log.md) — Claude Code로 이 서비스를 만드는 동안 주고받은
대화 605개입니다. 도구 호출은 한 줄로 줄였고, 키·토큰으로 보이는 값은 지웠습니다.

기록이 더 쌓인 뒤 다시 만들려면:

```bash
python3 submission/make-log.py
```

## 2. 스크린샷 — 완료

`screenshots/` 에 7장이 들어 있습니다 — 데스크톱 2장, AI 기능 동작 3장, 모바일 2장.
무엇을 담았는지는 [`screenshots/README.md`](screenshots/README.md)에 정리했습니다.

아래는 화면을 더 보탤 때 참고할 내용입니다.

macOS는 `Cmd + Shift + 4`로 영역을 선택해 캡처합니다. 찍은 파일은 이 폴더에
`screenshots/` 를 만들어 넣으면 됩니다.

### 데스크톱 (3장)

브라우저를 넓게 연 상태로 아래 주소를 각각 캡처합니다.

| 화면 | 주소 |
| --- | --- |
| 홈 | https://rewind-eng-mvp.vercel.app/ |
| 분석하기 | https://rewind-eng-mvp.vercel.app/analyze.html |
| 가이드 | https://rewind-eng-mvp.vercel.app/guide.html |

### 모바일 (1장)

[`capture-mobile.html`](capture-mobile.html) 파일을 브라우저로 열면 세 페이지가
폰 크기(390px) 화면으로 나란히 뜹니다. 한 번에 캡처하면 됩니다.

실제 휴대폰으로 접속해 찍어도 되고, 그편이 더 확실한 증빙이 됩니다.

### AI 기능 동작 장면 (2장 이상)

가장 중요한 증빙입니다. 분석하기 페이지에서 실제로 돌린 화면을 찍습니다.

1. **분석 중** — 입력한 내용과 `분석 중 12초` 진행 표시가 함께 보이는 화면
2. **결과** — `반복되는 실수 패턴` 카드와 `문장별 피드백` 카드가 보이는 화면

녹음 파일로 돌렸다면 아래도 함께 찍어두면 좋습니다.

3. **받아쓰는 중** — `화자 나눠서 받아쓰는 중 3/6` 처럼 진행 상황이 보이는 화면
4. **전체 대화** — 결과 아래 `전체 대화 보기`를 펼쳐 `나` / `튜터` 구분이 보이는 화면

입력할 대화가 마땅치 않으면 아래를 붙여넣어 쓰면 됩니다. 과거시제·주어일치·전치사
오류가 고루 들어 있어 결과가 풍성하게 나옵니다.

```
so how was your weekend did you do anything special

yeah I go to Busan with my family it was my first time

oh nice how long did you stay there

we stay two nights the weather was very good so we can walk a lot near the beach

that sounds lovely what did you eat

we eat a lot of seafood my mother she like very much the raw fish but I am little scared about it

haha that's understandable did you try it anyway

yes I try one piece because my father said me to try it actually it was not bad

good for you so would you go back again

yes of course I want go again in summer maybe I will can swim in the sea
```

## 3. 나머지 제출물 — 이미 준비됨

| 항목 | 위치 |
| --- | --- |
| 배포된 웹 서비스 | https://rewind-eng-mvp.vercel.app |
| GitHub 저장소 | https://github.com/great-opportunity/codyssey-native-A1-3 |
| README | [`../README.md`](../README.md) |
| 서비스 기획서 | [`../PLANNING.md`](../PLANNING.md) |
