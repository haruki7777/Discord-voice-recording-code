# Discord Voice Recording Code

Discord.js v14 voice recording example expanded into a karaoke AI scoring bot.

## Features

- `/karaoke-setup` creates the scoring button panel.
- Start, score, stop, and reset buttons are included.
- The bot records voice chunks as Ogg files.
- Local scoring uses loudness, stability, power, and duration.
- AI judging supports OpenAI, Gemini, and Claude.
- Missing API tokens are ignored automatically.

## Install

```bash
npm install
```

## Environment variables

Required:

```env
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_id
GUILD_ID=your_test_server_id
```

Optional AI keys:

```env
OPENAI_API_KEY=optional
GEMINI_API_KEY=optional
ANTHROPIC_API_KEY=optional
```

Optional models:

```env
OPENAI_MODEL=gpt-4o-mini
GEMINI_MODEL=gemini-1.5-flash
CLAUDE_MODEL=claude-3-5-haiku-latest
```

## Run

```bash
npm run deploy
npm start
```

## Notes

If no AI key exists, the bot uses local comments instead. If one provider fails, the next available provider is tried.

Always notify users and get consent before recording or analyzing voice audio.
