# 🎤 NATSUMI KARAOKE STAGE

디스코드 음성방에서 바로 쓰는 **노래방 AI 채점 봇**입니다.

곡을 미리 지정하고, EASY / NORMAL / HARD 중 하나를 고른 뒤, 버튼으로 스테이지를 시작합니다. 노래가 끝나거나 제한시간이 끝나면 봇이 자동으로 채점을 마치고 음성방에서 나간 뒤, **캔버스 이미지 점수카드**와 **AI 심사평**을 텍스트 채널에 보여줍니다.

기준곡 멜로디 파일 없이도 사용할 수 있게 바꿨습니다. 원곡 데이터와 직접 비교하는 방식이 아니라, 사용자의 음성에서 추출한 특징을 바탕으로 AI가 노래방 심사위원처럼 평가합니다.

---

## ✨ 핵심 기능

- `/karaoke setup` 또는 `/karaoke-setup`으로 노래방 패널 설치
- 버튼으로 곡 제목, 반주 URL 또는 파일 경로, 자동 종료 시간 설정
- 버튼으로 EASY / NORMAL / HARD 난이도 선택
- `🎙️ 스테이지 시작` 버튼으로 녹음과 채점 시작
- 반주가 끝나면 자동 종료
- 반주가 없으면 설정한 제한시간이 끝날 때 자동 종료
- 종료 후 봇이 자동으로 음성방에서 나감
- 점수는 캔버스 이미지 카드로 출력
- OpenAI / Gemini / Claude API 키 중 있는 것만 자동 사용
- API 키가 하나도 없으면 로컬 평가 멘트로 대체

---

## 🦊 컨셉

이 봇은 단순 녹음 봇이 아니라 **디스코드 노래방 스테이지 패널**처럼 동작합니다.

패널에는 이런 버튼이 붙습니다.

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

사용자는 복잡한 명령어를 계속 칠 필요 없이, 패널 버튼만 눌러서 노래방을 진행할 수 있습니다.

---

## 📁 파일 구조

```txt
index.js
aiScorer.js
difficultyScorer.js
scoreCard.js
deploy-commands.js
package.json
README.md
```

### `index.js`

디스코드 봇 본체입니다.

담당 기능:

- 슬래시 명령어 처리
- 버튼 처리
- 모달로 곡 설정 받기
- 음성 채널 입장
- 반주 재생
- 음성 녹음
- 자동 종료
- 점수 계산
- 캔버스 점수카드 전송

### `aiScorer.js`

OpenAI, Gemini, Claude API를 사용해 AI 심사평을 생성합니다.

사용 순서:

```txt
OpenAI → Gemini → Claude → local
```

예를 들어 `GEMINI_API_KEY`만 있으면 Gemini만 사용합니다. 없는 키는 오류로 처리하지 않고 자동으로 건너뜁니다.

### `difficultyScorer.js`

노래 점수 계산 엔진입니다.

기준 데이터 없이 아래 음성 특징으로 채점합니다.

```txt
톤 안정감
성량
성량 유지력
무대 파워
지속시간
활동량
```

### `scoreCard.js`

`@napi-rs/canvas`로 점수 이미지를 생성합니다.

점수카드에는 다음 내용이 들어갑니다.

```txt
가수 이름
곡 제목
난이도
최종 점수
등급
톤 안정감
성량
성량 유지력
무대 파워
AI 심사평
```

### `deploy-commands.js`

슬래시 명령어를 디스코드에 등록하는 파일입니다.

---

## ⚙️ 설치 방법

### 1. 저장소 받기

```bash
git clone https://github.com/haruki7777/Discord-voice-recording-code.git
cd Discord-voice-recording-code
```

### 2. 패키지 설치

```bash
npm install
```

`package.json`에는 기본적으로 아래 패키지가 포함됩니다.

```txt
discord.js
@discordjs/voice
@napi-rs/canvas
dotenv
prism-media
```

---

## 🔐 `.env` 설정

프로젝트 루트에 `.env` 파일을 만듭니다.

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

모델을 직접 지정하고 싶으면 아래처럼 넣습니다.

```env
OPENAI_MODEL=gpt-4o-mini
GEMINI_MODEL=gemini-1.5-flash
CLAUDE_MODEL=claude-3-5-haiku-latest
```

기본 자동 종료 시간과 반주 볼륨도 조절할 수 있습니다.

```env
DEFAULT_KARAOKE_DURATION=120
KARAOKE_VOLUME=0.55
```

`DEFAULT_KARAOKE_DURATION`은 반주를 넣지 않았을 때 자동 종료되는 시간입니다. 단위는 초입니다.

`KARAOKE_VOLUME`은 반주 재생 볼륨입니다. `0.55`는 55% 정도입니다.

---

## 🤖 디스코드 봇 설정

Discord Developer Portal에서 봇을 만들고 아래 설정을 확인합니다.

### 필요한 인텐트

이 코드는 기본적으로 다음 인텐트를 사용합니다.

```js
GatewayIntentBits.Guilds
GatewayIntentBits.GuildVoiceStates
```

### 봇 초대 권한

OAuth2 URL Generator에서 아래 스코프를 체크합니다.

```txt
bot
applications.commands
```

봇 권한은 최소 아래가 필요합니다.

```txt
View Channel
Send Messages
Use Slash Commands
Connect
Speak
Attach Files
Embed Links
```

`Attach Files`는 점수카드 이미지를 보내기 위해 필요합니다.

`Embed Links`는 결과 임베드를 예쁘게 보여주기 위해 필요합니다.

---

## 🚀 명령어 등록

```bash
npm run deploy
```

`GUILD_ID`를 넣은 상태면 해당 서버에 바로 등록됩니다.

`GUILD_ID`를 빼고 전역 명령어로 등록하면 반영까지 시간이 걸릴 수 있습니다.

---

## ▶️ 봇 실행

```bash
npm start
```

정상 실행되면 콘솔에 이런 식으로 표시됩니다.

```txt
Logged in as 봇이름#0000
AI providers enabled: openai, gemini
```

API 키가 없으면 이렇게 보입니다.

```txt
AI providers enabled: local only
```

이 상태여도 봇은 작동합니다. 단, AI 심사평 대신 로컬 멘트를 사용합니다.

---

## 🎮 사용 방법

### 1. 노래방 패널 설치

텍스트 채널에서 입력합니다.

```txt
/karaoke setup
```

또는 호환용 명령어를 써도 됩니다.

```txt
/karaoke-setup
```

그러면 노래방 패널이 생성됩니다.

---

### 2. 곡 설정

패널에서 `🎵 곡 설정` 버튼을 누릅니다.

모달이 뜨면 아래를 입력합니다.

```txt
부를 노래 제목
반주 파일 경로 또는 URL
자동 종료 시간초
```

예시 1. 반주 없이 자유곡으로 부르기:

```txt
부를 노래 제목: 자유곡
반주 파일 경로 또는 URL: 비워두기
자동 종료 시간초: 120
```

예시 2. 서버에 있는 파일 재생:

```txt
부를 노래 제목: KING
반주 파일 경로 또는 URL: ./songs/king.mp3
자동 종료 시간초: 180
```

예시 3. 직접 접근 가능한 URL 재생:

```txt
부를 노래 제목: 연습곡
반주 파일 경로 또는 URL: https://example.com/song.mp3
자동 종료 시간초: 180
```

주의: 유튜브 주소는 바로 재생용 파일 URL이 아니기 때문에 그대로 넣으면 실패할 수 있습니다. 직접 접근 가능한 mp3, ogg, wav 같은 오디오 파일 URL을 쓰는 쪽이 안정적입니다.

---

### 3. 난이도 선택

패널에서 난이도 버튼을 고릅니다.

```txt
🟢 EASY
🟡 NORMAL
🔴 HARD
```

### EASY

가볍게 즐기는 모드입니다.

특징:

```txt
기준이 널널함
점수 보정이 후함
초보자나 장난용 추천
```

### NORMAL

일반 노래방 느낌입니다.

특징:

```txt
기준이 균형적임
대부분의 서버에 추천
```

### HARD

빡센 심사 모드입니다.

특징:

```txt
성량 흔들림 감점 큼
톤 안정감 기준이 높음
고득점이 어려움
랭킹전 추천
```

---

### 4. 스테이지 시작

먼저 음성채널에 들어갑니다.

그 다음 패널에서 `🎙️ 스테이지 시작` 버튼을 누릅니다.

봇이 같은 음성채널에 들어오고, 반주가 설정되어 있으면 반주를 재생합니다.

반주가 없으면 제한시간 동안 녹음하고 채점합니다.

---

### 5. 자동 종료와 자동 채점

종료 조건은 둘 중 하나입니다.

```txt
반주가 끝남
설정한 제한시간이 끝남
```

종료되면 봇이 자동으로 다음을 처리합니다.

```txt
녹음 중지
점수 계산
AI 심사평 생성
캔버스 점수카드 생성
텍스트 채널에 결과 전송
음성방에서 나가기
```

---

### 6. 수동으로 점수 보기

스테이지 도중 또는 종료 전 결과를 보고 싶으면 `🏆 점수카드` 버튼을 누릅니다.

또는 명령어를 사용할 수 있습니다.

```txt
/karaoke score
```

---

### 7. 강제 종료

중간에 끝내고 바로 채점하고 싶으면 `⏹️ 강제 종료` 버튼을 누릅니다.

또는 명령어를 사용합니다.

```txt
/karaoke stop
```

---

### 8. 초기화

현재 서버의 노래방 세션을 지우려면 `🧹 초기화` 버튼을 누릅니다.

또는 명령어를 사용합니다.

```txt
/karaoke reset
```

---

## 🖼️ 캔버스 점수카드

점수는 그냥 텍스트만 보여주는 것이 아니라 이미지로 출력됩니다.

이미지에는 다음 정보가 들어갑니다.

```txt
NATSUMI KARAOKE STAGE
유저명
곡 제목
순위
난이도
최종 점수
등급
톤 안정감
성량
성량 유지력
무대 파워
AI 심사평
```

점수카드는 `@napi-rs/canvas`를 사용해서 생성합니다.

서버 환경에 따라 canvas 설치가 실패하면 Node.js 버전을 18 이상으로 맞추고 다시 설치하세요.

```bash
npm install
```

---

## 📊 채점 기준

기준곡 데이터 없이도 돌아가게 만든 버전이라, 원곡의 실제 멜로디와 1:1 비교하지 않습니다.

대신 사용자의 음성 자체를 분석합니다.

채점 요소는 다음과 같습니다.

### 톤 안정감

목소리의 흔들림이 얼마나 적은지 봅니다.

### 성량

노래가 충분히 들릴 정도로 힘이 있는지 봅니다.

### 성량 유지력

처음부터 끝까지 볼륨이 안정적인지 봅니다.

### 무대 파워

피크 성량과 에너지를 봅니다.

### 지속시간

얼마나 충분히 노래했는지 봅니다.

### 활동량

노래 중 실제로 목소리가 들어온 구간이 얼마나 있는지 봅니다.

---

## 🧠 AI 심사 구조

점수 계산 자체는 로컬 코드에서 먼저 합니다.

그 다음 AI에게 아래 정보를 넘깁니다.

```txt
곡 제목
난이도
최종 점수
원점수
톤 안정감
성량
성량 유지력
파워
지속력
노래 길이
```

AI는 이 정보를 바탕으로 짧은 심사평과 개선 팁을 작성합니다.

중요: AI가 점수를 마음대로 바꾸지는 않습니다. 점수는 로컬 채점 엔진이 결정합니다.

---

## 🔁 API 키 우선순위

API 키가 여러 개 있으면 아래 순서로 사용합니다.

```txt
OpenAI → Gemini → Claude → local
```

예시:

```env
GEMINI_API_KEY=너의_제미나이_API키
```

Gemini 키만 있어도 정상 작동합니다.

OpenAI 키가 없다고 봇이 꺼지지 않습니다.

Claude 키가 없다고 봇이 꺼지지 않습니다.

---

## 🎵 반주 파일 준비 방법

가장 안정적인 방식은 서버 안에 `songs` 폴더를 만들고 파일을 넣는 것입니다.

```txt
songs/king.mp3
songs/practice.ogg
songs/test.wav
```

그 다음 곡 설정에서 이렇게 입력합니다.

```txt
./songs/king.mp3
```

URL을 쓰려면 직접 접근 가능한 오디오 파일 URL이어야 합니다.

가능한 예:

```txt
https://example.com/music/song.mp3
```

불안정한 예:

```txt
https://youtube.com/watch?v=xxxx
```

유튜브 주소는 일반 파일 URL이 아니라서 이 코드에서 바로 반주로 쓰기 어렵습니다.

---

## 🧪 빠른 테스트 순서

1. `.env` 작성
2. `npm install`
3. `npm run deploy`
4. `npm start`
5. 디스코드에서 `/karaoke setup`
6. `🎵 곡 설정` 클릭
7. 제목은 `테스트곡`, 반주는 비우고 시간은 `30` 입력
8. `🟡 NORMAL` 클릭
9. 음성채널 입장
10. `🎙️ 스테이지 시작` 클릭
11. 30초 동안 노래
12. 자동으로 결과 이미지 확인

---

## ⚠️ 주의사항

음성 녹음과 분석은 반드시 참여자에게 알리고 동의를 받아야 합니다.

이 프로젝트는 학습용 예제입니다.

현재 버전은 기준곡 파일 없이 부르는 자유 채점 방식입니다. 진짜 금영/태진처럼 원곡의 정확한 멜로디, 박자, 가사 싱크와 비교하려면 별도의 MIDI, MusicXML, 피치 트래킹, 싱크 보정 시스템이 추가로 필요합니다.
