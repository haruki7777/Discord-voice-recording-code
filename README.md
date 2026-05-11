# 디스코드 원곡 비교 노래방 AI 채점 봇

Discord.js v14와 @discordjs/voice를 사용해서 디스코드 음성방 노래를 녹음하고, 기준 멜로디와 비교해 노래방식 점수를 계산하는 예제입니다.

AI 평가도 같이 붙어 있습니다. OpenAI, Gemini, Claude API 키 중 있는 것만 자동으로 사용하고, 없는 키는 그냥 무시합니다.

## 현재 가능한 기능

- `/karaoke-setup` 명령어로 버튼 패널 설치
- `🎙️ 채점 시작` 버튼으로 음성방 채점 시작
- `🏆 점수 보기` 버튼으로 랭킹 출력
- `⏹️ 종료` 버튼으로 음성 연결 종료
- `🧹 초기화` 버튼으로 세션 초기화
- `/record song:곡ID` 명령어로 바로 채점 시작
- 유저별 음성 OGG 저장
- 원곡 멜로디 데이터와 피치 비교
- 기본 성량/안정감/지속시간 점수 계산
- AI 심사평 생성

## 진짜 금영/태진식 채점이 가능한가요?

완전히 똑같이는 어렵습니다. 금영/태진의 실제 채점 알고리즘은 공개되어 있지 않아서 그대로 복제할 수 없습니다.

하지만 비슷한 구조는 만들 수 있습니다.

이 프로젝트는 다음 방식으로 흉내냅니다.

1. 기준곡의 멜로디 데이터를 준비합니다.
2. 사용자의 목소리에서 피치를 추정합니다.
3. 현재 시간의 기준 음과 사용자의 음을 비교합니다.
4. 피치 오차, 리듬, 멜로디 커버리지, 성량을 점수화합니다.
5. AI가 결과를 읽고 심사평을 작성합니다.

최종 점수는 기본적으로 이렇게 계산됩니다.

```txt
최종점수 = 원곡 비교 점수 65% + 기본 음성 점수 35%
```

## 파일 구조

```txt
index.js
aiScorer.js
karaokeScorer.js
referenceSongs.js
deploy-commands.js
package.json
```

### index.js

디스코드 봇 본체입니다. 버튼, 명령어, 음성 수신, 점수 출력을 담당합니다.

### aiScorer.js

OpenAI, Gemini, Claude API를 호출해서 AI 심사평을 만듭니다.

토큰이 없으면 자동으로 건너뜁니다.

사용 순서는 다음과 같습니다.

```txt
OpenAI → Gemini → Claude → local
```

### karaokeScorer.js

원곡 비교 채점 엔진입니다.

PCM 음성에서 피치를 추정하고, 기준 멜로디와 비교해서 점수를 냅니다.

### referenceSongs.js

기준곡 멜로디 데이터가 들어갑니다.

현재 기본 예제는 `scale_practice`입니다.

```js
scale_practice: {
  id: 'scale_practice',
  title: '연습용 도레미 스케일',
  bpm: 90,
  offsetSeconds: 0,
  notes: [
    { start: 0.0, duration: 0.8, midi: 60, lyric: '도' },
    { start: 0.8, duration: 0.8, midi: 62, lyric: '레' }
  ]
}
```

## 설치 방법

```bash
npm install
```

## .env 설정

필수값입니다.

```env
DISCORD_TOKEN=디스코드_봇_토큰
CLIENT_ID=디스코드_애플리케이션_ID
GUILD_ID=테스트할_서버_ID
```

AI 심사평을 쓰고 싶으면 아래 중 하나 이상 넣으면 됩니다.

```env
OPENAI_API_KEY=오픈AI_API키
GEMINI_API_KEY=제미나이_API키
ANTHROPIC_API_KEY=클로드_API키
```

모델을 바꾸고 싶으면 선택적으로 넣습니다.

```env
OPENAI_MODEL=gpt-4o-mini
GEMINI_MODEL=gemini-1.5-flash
CLAUDE_MODEL=claude-3-5-haiku-latest
```

기본 기준곡을 바꾸고 싶으면 넣습니다.

```env
DEFAULT_SONG_ID=scale_practice
```

## 명령어 등록

```bash
npm run deploy
```

## 봇 실행

```bash
npm start
```

## 디스코드 권한

봇에게 아래 권한이 필요합니다.

```txt
View Channel
Send Messages
Use Slash Commands
Connect
Speak
```

Developer Portal에서는 봇 초대 시 `bot`과 `applications.commands`를 포함해야 합니다.

## 사용 방법

### 버튼 방식

1. 텍스트 채널에서 `/karaoke-setup` 입력
2. 생성된 패널에서 `🎙️ 채점 시작` 클릭
3. 음성방에서 기준 멜로디에 맞춰 노래
4. `🏆 점수 보기` 클릭
5. 결과 확인

### 명령어 방식

```txt
/record song:scale_practice
```

`song` 값은 `referenceSongs.js` 안의 곡 ID입니다.

## 내 노래를 기준곡으로 추가하는 방법

`referenceSongs.js`에 새 곡을 추가하면 됩니다.

```js
my_song: {
  id: 'my_song',
  title: '내 노래 제목',
  bpm: 120,
  offsetSeconds: 0,
  notes: [
    { start: 0.0, duration: 0.5, midi: 64, lyric: '가사1' },
    { start: 0.5, duration: 0.5, midi: 67, lyric: '가사2' },
  ],
}
```

`midi` 값은 음 높이입니다.

예시:

```txt
C4 = 60
D4 = 62
E4 = 64
F4 = 65
G4 = 67
A4 = 69
B4 = 71
C5 = 72
```

## 정확도를 높이려면

현재 피치 추정은 가벼운 기본 구현입니다. 실제 서비스 수준으로 만들려면 아래를 붙이는 것이 좋습니다.

- CREPE, pYIN, YIN 같은 피치 추적 알고리즘
- MIDI 또는 MusicXML 기반 기준 멜로디
- 가사 싱크 데이터
- 반주 음원과 보컬 분리
- 시작 싱크 보정
- 음역 자동 보정

## 주의사항

음성 녹음과 분석은 반드시 참여자에게 알리고 동의를 받아야 합니다.

이 코드는 학습용 예제입니다. 실제 금영/태진 알고리즘을 복제한 것이 아니라, 비슷한 방식으로 원곡 비교 채점을 구현한 구조입니다.
