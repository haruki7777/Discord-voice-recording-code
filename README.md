# Discord Voice Recording Code

Discord.js v14 and @discordjs/voice example for recording audio from a Discord voice channel.

## Files

- `index.js`: basic voice recording bot example
- `recordings/`: generated audio files are saved here when the bot runs

## Install

```bash
npm install discord.js @discordjs/voice prism-media
```

Node.js 18 or newer is recommended.

## How it works

1. Run a slash command named `/record`.
2. The bot joins the voice channel you are currently in.
3. When a user starts speaking, the bot subscribes to that user's Opus audio stream.
4. The stream is wrapped as Ogg audio through prism-media.
5. The result is saved as `.ogg` inside the `recordings` folder.

## Important

- The bot must have permission to view and connect to the voice channel.
- `selfDeaf` must be `false`, otherwise the bot cannot receive voice audio.
- Always notify users and get consent before recording voice audio.
