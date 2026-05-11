# 🎤 NATSUMI KARAOKE STAGE

디스코드 음성방에서 바로 쓰는 **노래방 AI 채점 봇 풀버전**입니다.

곡을 미리 지정하고, EASY / NORMAL / HARD 중 하나를 고른 뒤 버튼으로 스테이지를 시작합니다. 노래가 끝나거나 제한시간이 끝나면 봇이 자동으로 채점을 마치고 음성방에서 나간 뒤, **캔버스 이미지 점수카드**와 **AI 심사평**을 텍스트 채널에 보여줍니다.

---

## 🔗 버전 선택

### 🎛️ 풀버전

현재 저장소입니다.

```txt
https://github.com/haruki7777/Discord-voice-recording-code
```

추천 상황:

```txt
반주 재생 사용
곡 설정 버튼 사용
EASY / NORMAL / HARD 난이도 사용
캔버스 점수카드 사용
OpenAI / Gemini / Claude AI 심사평 사용
1GB RAM 이상 VPS 사용
```

### 🪶 중간 경량화 버전

```txt
https://github.com/haruki7777/Discord-Voice-Scoring-Lightweight
```

추천 상황:

```txt
512MB~1GB RAM VPS에서 돌릴 때
한 명씩만 노래방 채점을 할 때
녹음 파일을 저장하지 않고 점수만 필요할 때
캔버스 점수카드와 선택적 AI 심사평은 유지하고 싶을 때
```

### 🪶 초경량 버전

```txt
https://github.com/haruki7777/Discord-Voice-Scoring-Ultra-Lightweight
```

추천 상황:

```txt
384MB~512MB RAM VPS에서 테스트할 때
최대한 단순한 텍스트 점수만 필요할 때
캔버스, AI, 반주, 녹음 저장 없이 아주 가볍게 쓰고 싶을 때
```

---

## ✨ 풀버전 핵심 기능

```txt
/karaoke setup 또는 /karaoke-setup 으로 노래방 패널 설치
곡 제목, 반주 URL 또는 파일 경로, 자동 종료 시간 설정
EASY / NORMAL / HARD 난이도 선택
스테이지 시작 버튼으로 녹음과 채점 시작
반주가 끝나면 자동 종료
반주가 없으면 제한시간 종료
종료 후 봇 자동 퇴장
캔버스 이미지 점수카드 출력
OpenAI / Gemini / Claude 중 있는 API 키만 자동 사용
API 키가 없으면 로컬 평가 멘트 사용
```

---

## 🦊 버튼 구성

```txt
🎵 곡 설정
🎙️ 스테이지 시작
🏆 점수카드
🟢 EASY
🟡 NORMAL
🔴 HARD
⏹️ 강제 종료
🧹 초기화
```

---

## 💻 권장 사양

### 풀버전 권장

```txt
CPU: 1 vCPU 이상
RAM: 1GB 권장
디스크: 5GB 이상 권장
Node.js: 20 이상 권장
```

### 중간 경량화 권장

```txt
CPU: 1 vCPU
RAM: 512MB ~ 1GB
디스크: 2GB ~ 5GB
```

### 초경량 권장

```txt
CPU: 1 vCPU
RAM: 384MB ~ 512MB
디스크: 1GB ~ 2GB
```

초경량은 테스트용에 가깝습니다. 안정 운영은 중간 경량화 또는 풀버전을 권장합니다.

---

## ⚙️ 설치 방법

```bash
git clone https://github.com/haruki7777/Discord-voice-recording-code.git
cd Discord-voice-recording-code
npm install
```

---

## 🔐 .env 설정

필수값:

```env
DISCORD_TOKEN=디스코드_봇_토큰
CLIENT_ID=디스코드_애플리케이션_ID
GUILD_ID=테스트할_서버_ID
```

선택값:

```env
OPENAI_API_KEY=오픈AI_API키
GEMINI_API_KEY=제미나이_API키
ANTHROPIC_API_KEY=클로드_API키
```

기본 설정:

```env
DEFAULT_KARAOKE_DURATION=120
KARAOKE_VOLUME=0.55
OPENAI_MODEL=gpt-4o-mini
GEMINI_MODEL=gemini-1.5-flash
CLAUDE_MODEL=claude-3-5-haiku-latest
```

---

## 🚀 명령어 등록

```bash
npm run deploy
```

---

## ▶️ 봇 실행

```bash
npm start
```

---

## 🎮 사용 방법

1. 디스코드 텍스트 채널에서 `/karaoke setup` 입력
2. `🎵 곡 설정` 버튼으로 노래 제목, 반주, 제한시간 설정
3. `🟢 EASY`, `🟡 NORMAL`, `🔴 HARD` 중 하나 선택
4. 음성채널에 들어가기
5. `🎙️ 스테이지 시작` 클릭
6. 노래 부르기
7. 반주 종료 또는 제한시간 종료 시 자동 채점
8. 캔버스 점수카드와 AI 심사평 확인

---

## 📊 채점 기준

현재 버전은 기준곡 파일 없이 부르는 자유 채점 방식입니다.

```txt
톤 안정감
성량
성량 유지력
무대 파워
지속시간
활동량
```

AI는 점수를 바꾸지 않고 심사평만 작성합니다.

---

## ⚠️ 주의사항

음성 녹음과 분석은 반드시 참여자에게 알리고 동의를 받아야 합니다.

이 프로젝트는 학습용 예제입니다. 실제 노래방 기계와 동일한 점수를 보장하지 않습니다.
