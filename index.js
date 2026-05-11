/*
 * index.js
 *
 * This file implements a basic Discord bot using discord.js v14 that can record
 * voice from users in a voice channel. It demonstrates how to connect to a
 * voice channel, subscribe to a user's voice stream, decode Opus packets and
 * write them to an Ogg file using prism-media. The bot listens for a slash
 * command called `record`, joins the caller's voice channel, and begins
 * recording when it detects speech. Audio files are saved in a `recordings`
 * directory with filenames based on the user ID and timestamp.
 */

import { Client, GatewayIntentBits } from 'discord.js';
import { joinVoiceChannel, EndBehaviorType } from '@discordjs/voice';
import prism from 'prism-media';
import fs from 'node:fs';
import { pipeline } from 'node:stream';

// Initialize the Discord client with the intents required for voice and guilds.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// When the client is ready, log to the console.
client.once('ready', () => {
  console.log(`Logged in as ${client.user?.tag}`);
});

// Handler for slash commands. In a full application you would register
// commands via the REST API. Here we assume a command `/record` is already
// registered that triggers recording from the user's voice channel.
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;
  if (interaction.commandName !== 'record') return;

  const member = interaction.member;
  // @ts-ignore – interaction.member may be a GuildMember when cached.
  const voiceChannel = member.voice?.channel;
  if (!voiceChannel) {
    return interaction.reply({
      content: 'You must be in a voice channel to start recording.',
      ephemeral: true,
    });
  }

  // Join the user's voice channel. selfDeaf must be false to receive audio.
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  // Confirm to the user that recording has started.
  await interaction.reply(`Recording started in **${voiceChannel.name}**.`);

  // Ensure the recordings directory exists.
  if (!fs.existsSync('./recordings')) {
    fs.mkdirSync('./recordings');
  }

  // Listen for speaking events and subscribe to each user when they speak.
  connection.receiver.speaking.on('start', (userId) => {
    console.log(`${userId} started speaking`);
    const opusStream = connection.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 1000, // End after 1 second of silence
      },
    });
    // Convert the Opus stream to an Ogg file using prism-media.
    const oggStream = new prism.opus.OggLogicalBitstream({
      opusHead: new prism.opus.OpusHead({ channelCount: 2, sampleRate: 48000 }),
      pageSizeControl: { maxPackets: 10 },
    });
    const filename = `./recordings/${userId}-${Date.now()}.ogg`;
    pipeline(opusStream, oggStream, fs.createWriteStream(filename), (err) => {
      if (err) {
        console.error('Failed to save recording:', err);
      } else {
        console.log('Recording saved:', filename);
      }
    });
  });
});

// Log in to Discord using the bot token from the DISCORD_TOKEN environment.
if (!process.env.DISCORD_TOKEN) {
  throw new Error('Environment variable DISCORD_TOKEN must be set');
}
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('Failed to login:', err);
});
