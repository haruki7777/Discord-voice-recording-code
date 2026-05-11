import 'dotenv/config';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  AudioPlayerStatus,
  EndBehaviorType,
  createAudioPlayer,
  createAudioResource,
  getVoiceConnection,
  joinVoiceChannel,
} from '@discordjs/voice';
import prism from 'prism-media';
import fs from 'node:fs';
import { Readable, PassThrough, pipeline } from 'node:stream';
import { getEnabledAiProviderNames, judgeWithAI } from './aiScorer.js';
import { getDifficulty, listDifficulties, localJudgeComment, scorePerformance } from './difficultyScorer.js';
import { createScoreCard } from './scoreCard.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const sessions = new Map();
const guildSettings = new Map();
const RECORDINGS_DIR = './recordings';

function ensureRecordingsDir() {
  if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

function getSettings(guildId) {
  if (!guildSettings.has(guildId)) {
    guildSettings.set(guildId, {
      songTitle: '자유곡',
      songSource: '',
      durationSeconds: Number(process.env.DEFAULT_KARAOKE_DURATION || 120),
      difficultyId: 'normal',
    });
  }
  return guildSettings.get(guildId);
}

function createEmptyStats() {
  return {
    chunks: 0,
    totalSamples: 0,
    loudness: [],
    zeroCrossings: [],
    peak: 0,
    files: [],
  };
}

function getUserStats(session, userId) {
  if (!session.userStats.has(userId)) session.userStats.set(userId, createEmptyStats());
  return session.userStats.get(userId);
}

function updateAudioStats(stats, pcmChunk) {
  if (!pcmChunk || pcmChunk.length < 4) return;

  let sumSquares = 0;
  let samples = 0;
  let zeroCrossings = 0;
  let previousSign = 0;
  let peak = 0;

  for (let offset = 0; offset + 1 < pcmChunk.length; offset += 2) {
    const sample = pcmChunk.readInt16LE(offset);
    const abs = Math.abs(sample);
    const sign = sample > 0 ? 1 : sample < 0 ? -1 : 0;
    if (previousSign !== 0 && sign !== 0 && sign !== previousSign) zeroCrossings++;
    if (sign !== 0) previousSign = sign;
    sumSquares += sample * sample;
    samples++;
    if (abs > peak) peak = abs;
  }

  if (!samples) return;

  const rms = Math.sqrt(sumSquares / samples) / 32768;
  const zcr = zeroCrossings / samples;

  stats.chunks++;
  stats.totalSamples += samples;
  stats.peak = Math.max(stats.peak, peak / 32768);
  stats.loudness.push(rms);
  stats.zeroCrossings.push(zcr);

  if (stats.loudness.length > 800) stats.loudness.shift();
  if (stats.zeroCrossings.length > 800) stats.zeroCrossings.shift();
}

function createPanel(guildId) {
  const settings = getSettings(guildId);
  const providers = getEnabledAiProviderNames();
  const providerText = providers.length ? providers.join(' → ') : 'local only';
  const difficulty = getDifficulty(settings.difficultyId);

  const embed = new EmbedBuilder()
    .setTitle('🎤 NATSUMI KARAOKE STAGE')
    .setDescription('노래를 지정하고, 모드를 고른 뒤, 버튼 한 번으로 채점 시작. 끝나면 자동 퇴장 + 캔버스 점수카드 출력!')
    .addFields(
      { name: '🎵 지정곡', value: settings.songTitle || '자유곡', inline: true },
      { name: '⚙️ 난이도', value: `${difficulty.emoji} ${difficulty.label}`, inline: true },
      { name: '⏱️ 제한시간', value: `${settings.durationSeconds}초`, inline: true },
      { name: '🤖 AI 심사', value: providerText, inline: false },
      { name: '🦊 사용 순서', value: '1. 곡 설정 → 2. EASY/NORMAL/HARD 선택 → 3. 시작 → 4. 노래 끝나면 자동 채점' },
    )
    .setColor(0xff9f43);

  const mainRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('karaoke:config').setLabel('🎵 곡 설정').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('karaoke:start').setLabel('🎙️ 스테이지 시작').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('karaoke:score').setLabel('🏆 점수카드').setStyle(ButtonStyle.Secondary),
  );

  const difficultyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('karaoke:difficulty:easy').setLabel('🟢 EASY').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('karaoke:difficulty:normal').setLabel('🟡 NORMAL').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('karaoke:difficulty:hard').setLabel('🔴 HARD').setStyle(ButtonStyle.Danger),
  );

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('karaoke:stop').setLabel('⏹️ 강제 종료').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('karaoke:reset').setLabel('🧹 초기화').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [mainRow, difficultyRow, controlRow] };
}

function createConfigModal(guildId) {
  const settings = getSettings(guildId);
  return new ModalBuilder()
    .setCustomId('karaoke:modal:config')
    .setTitle('나츠미 노래방 곡 설정')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('songTitle')
          .setLabel('부를 노래 제목')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(settings.songTitle || '자유곡')
          .setPlaceholder('예: KING, 밤양갱, 아이돌 등'),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('songSource')
          .setLabel('반주 파일 경로 또는 URL')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(settings.songSource || '')
          .setPlaceholder('예: ./songs/song.mp3 또는 https://.../song.mp3'),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('durationSeconds')
          .setLabel('자동 종료 시간초')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(settings.durationSeconds || 120))
          .setPlaceholder('예: 120'),
      ),
    );
}

async function createSongStream(source) {
  if (!source) return null;
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok || !response.body) throw new Error(`Audio URL HTTP ${response.status}`);
    return Readable.fromWeb(response.body);
  }
  if (!fs.existsSync(source)) throw new Error(`Audio file not found: ${source}`);
  return fs.createReadStream(source);
}

async function startKaraoke(interaction) {
  const member = interaction.member;
  const voiceChannel = member.voice?.channel;
  if (!voiceChannel) return interaction.reply({ content: '먼저 음성채널에 들어와야지, 바보야 🦊', ephemeral: true });

  const existing = sessions.get(interaction.guildId);
  if (existing?.isRecording) return interaction.reply({ content: '이미 스테이지가 열렸어. 끝나고 다시 해.', ephemeral: true });

  ensureRecordingsDir();
  const settings = { ...getSettings(interaction.guildId) };
  const difficulty = getDifficulty(settings.difficultyId);

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: interaction.guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  const session = {
    connection,
    voiceChannelId: voiceChannel.id,
    textChannelId: interaction.channelId,
    startedAt: Date.now(),
    isRecording: true,
    activeUsers: new Set(),
    userStats: new Map(),
    settings,
    difficulty,
    timer: null,
    player: null,
    finished: false,
  };
  sessions.set(interaction.guildId, session);

  connection.receiver.speaking.on('start', (userId) => {
    if (!session.isRecording || session.activeUsers.has(userId)) return;
    session.activeUsers.add(userId);

    const stats = getUserStats(session, userId);
    const opusStream = connection.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 1800 },
    });

    const oggInput = new PassThrough();
    const decodeInput = new PassThrough();
    opusStream.on('data', (chunk) => {
      oggInput.write(chunk);
      decodeInput.write(chunk);
    });
    opusStream.on('end', () => {
      oggInput.end();
      decodeInput.end();
      session.activeUsers.delete(userId);
    });
    opusStream.on('error', (error) => {
      oggInput.destroy(error);
      decodeInput.destroy(error);
      session.activeUsers.delete(userId);
    });

    const oggStream = new prism.opus.OggLogicalBitstream({
      opusHead: new prism.opus.OpusHead({ channelCount: 2, sampleRate: 48000 }),
      pageSizeControl: { maxPackets: 10 },
    });

    const safeDate = new Date().toISOString().replaceAll(':', '-');
    const filename = `${RECORDINGS_DIR}/${interaction.guildId}-${userId}-${safeDate}.ogg`;
    stats.files.push(filename);

    pipeline(oggInput, oggStream, fs.createWriteStream(filename), (error) => {
      if (error) console.error('Recording save failed:', error);
    });

    const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
    decodeInput.pipe(decoder).on('data', (pcmChunk) => updateAudioStats(stats, pcmChunk));
    decoder.on('error', (error) => console.error('Decoder error:', error));
  });

  await interaction.reply({
    content: `🎙️ **${voiceChannel.name}**에서 **${settings.songTitle}** 스테이지 시작! 모드: ${difficulty.emoji} **${difficulty.label}**`,
    ephemeral: true,
  });

  if (settings.songSource) {
    try {
      const songStream = await createSongStream(settings.songSource);
      const player = createAudioPlayer();
      const resource = createAudioResource(songStream, { inlineVolume: true });
      resource.volume?.setVolume(Number(process.env.KARAOKE_VOLUME || 0.55));
      session.player = player;
      connection.subscribe(player);
      player.play(resource);
      player.once(AudioPlayerStatus.Idle, () => finishAndScore(interaction.guildId, 'song-ended'));
      player.on('error', (error) => {
        console.error('Audio player error:', error);
        finishAndScore(interaction.guildId, 'song-error');
      });
    } catch (error) {
      console.error(error);
      await interaction.followUp({ content: `반주 재생 실패: ${error.message}\n그래도 녹음 채점은 제한시간 기준으로 계속할게.`, ephemeral: true });
    }
  }

  session.timer = setTimeout(() => finishAndScore(interaction.guildId, 'timer-ended'), settings.durationSeconds * 1000);
}

async function buildScoreResults(session) {
  const results = [...session.userStats.entries()]
    .map(([userId, stats]) => ({ userId, stats, score: scorePerformance(stats, session.difficulty.id) }))
    .filter((result) => result.score.durationSeconds >= 1)
    .sort((a, b) => b.score.total - a.score.total);

  const judgedResults = [];
  for (const result of results.slice(0, 10)) {
    const fallbackComment = localJudgeComment(result.score);
    const ai = await judgeWithAI({ userId: result.userId, score: result.score, song: session.settings, fallbackComment });
    judgedResults.push({ ...result, ai });
  }
  return judgedResults;
}

async function sendScoreCard(target, guild, session, results) {
  if (!results.length) {
    return target.send?.({ content: '노래 데이터가 너무 짧아서 채점할 수 없어. 최소 1초 이상은 불러줘.' })
      ?? target.editReply({ content: '노래 데이터가 너무 짧아서 채점할 수 없어. 최소 1초 이상은 불러줘.' });
  }

  const winner = results[0];
  const user = await client.users.fetch(winner.userId).catch(() => null);
  const buffer = await createScoreCard({
    userTag: user?.tag || winner.userId,
    songTitle: session.settings.songTitle,
    rank: 1,
    finalScore: winner.score.total,
    score: winner.score,
    aiProvider: winner.ai.provider,
    aiComment: winner.ai.comment,
  });
  const attachment = new AttachmentBuilder(buffer, { name: 'natsumi-karaoke-score.png' });

  const rankingText = results.map((result, index) => {
    const d = result.score.difficulty;
    return [
      `**${index + 1}위** <@${result.userId}> — **${result.score.total}점** ${d.emoji} ${d.label}`,
      `톤 ${result.score.toneStability} / 성량 ${result.score.volumeScore} / 유지 ${result.score.volumeConsistency} / 파워 ${result.score.powerScore}`,
      `💬 [${result.ai.provider}] ${result.ai.comment}`,
    ].join('\n');
  }).join('\n\n');

  const embed = new EmbedBuilder()
    .setTitle('🏆 NATSUMI KARAOKE RESULT')
    .setDescription(rankingText)
    .addFields(
      { name: '🎵 곡', value: session.settings.songTitle || '자유곡', inline: true },
      { name: '⚙️ 모드', value: `${session.difficulty.emoji} ${session.difficulty.label}`, inline: true },
      { name: '🤖 채점', value: '캔버스 점수카드 + AI 심사평', inline: true },
    )
    .setImage('attachment://natsumi-karaoke-score.png')
    .setColor(0xfeca57);

  const payload = { embeds: [embed], files: [attachment] };
  if (target.editReply) return target.editReply(payload);
  return target.send(payload);
}

async function showScores(interaction) {
  const session = sessions.get(interaction.guildId);
  if (!session || session.userStats.size === 0) return interaction.reply({ content: '아직 채점할 노래 데이터가 없어.', ephemeral: true });
  await interaction.deferReply();
  const results = await buildScoreResults(session);
  return sendScoreCard(interaction, interaction.guild, session, results);
}

async function finishAndScore(guildId, reason = 'ended') {
  const session = sessions.get(guildId);
  if (!session || session.finished) return;
  session.finished = true;
  session.isRecording = false;
  if (session.timer) clearTimeout(session.timer);
  session.player?.stop(true);

  const channel = await client.channels.fetch(session.textChannelId).catch(() => null);
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  const results = await buildScoreResults(session);
  await channel?.send({ content: `🎬 스테이지 종료! 사유: ${reason}. 채점표를 공개할게.` });
  if (channel && guild) await sendScoreCard(channel, guild, session, results);
  session.connection?.destroy();
  sessions.delete(guildId);
}

async function stopKaraoke(interaction) {
  const session = sessions.get(interaction.guildId);
  if (!session) return interaction.reply({ content: '진행 중인 스테이지가 없어.', ephemeral: true });
  await interaction.reply({ content: '⏹️ 스테이지를 종료하고 자동 채점할게.', ephemeral: true });
  return finishAndScore(interaction.guildId, 'manual-stop');
}

async function resetKaraoke(interaction) {
  const session = sessions.get(interaction.guildId);
  if (session) {
    session.isRecording = false;
    if (session.timer) clearTimeout(session.timer);
    session.player?.stop(true);
    session.connection?.destroy();
  }
  sessions.delete(interaction.guildId);
  return interaction.reply({ content: '🧹 현재 서버의 노래방 데이터를 초기화했어.', ephemeral: true });
}

async function setDifficulty(interaction, difficultyId) {
  const settings = getSettings(interaction.guildId);
  settings.difficultyId = difficultyId;
  const difficulty = getDifficulty(difficultyId);
  return interaction.reply({ content: `${difficulty.emoji} 난이도를 **${difficulty.label}**로 설정했어. ${difficulty.description}`, ephemeral: true });
}

async function saveConfig(interaction) {
  const settings = getSettings(interaction.guildId);
  settings.songTitle = interaction.fields.getTextInputValue('songTitle').trim() || '자유곡';
  settings.songSource = interaction.fields.getTextInputValue('songSource').trim();
  const duration = Number(interaction.fields.getTextInputValue('durationSeconds').trim());
  settings.durationSeconds = Number.isFinite(duration) ? Math.max(10, Math.min(900, Math.round(duration))) : 120;
  return interaction.reply({
    content: `🎵 곡 설정 완료\n곡: **${settings.songTitle}**\n반주: ${settings.songSource || '없음, 제한시간으로 자동 종료'}\n시간: ${settings.durationSeconds}초`,
    ephemeral: true,
  });
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user?.tag}`);
  const providers = getEnabledAiProviderNames();
  console.log(`AI providers enabled: ${providers.length ? providers.join(', ') : 'local only'}`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'karaoke-setup') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: '서버 관리 권한이 있어야 설치할 수 있어.', ephemeral: true });
        await interaction.channel.send(createPanel(interaction.guildId));
        return interaction.reply({ content: '노래방 스테이지 패널을 설치했어 🦊', ephemeral: true });
      }

      if (interaction.commandName === 'record') return startKaraoke(interaction);

      if (interaction.commandName === 'karaoke') {
        const sub = interaction.options.getSubcommand();
        if (sub === 'setup') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: '서버 관리 권한이 있어야 설치할 수 있어.', ephemeral: true });
          await interaction.channel.send(createPanel(interaction.guildId));
          return interaction.reply({ content: '노래방 스테이지 패널을 설치했어 🦊', ephemeral: true });
        }
        if (sub === 'start') return startKaraoke(interaction);
        if (sub === 'score') return showScores(interaction);
        if (sub === 'stop') return stopKaraoke(interaction);
        if (sub === 'reset') return resetKaraoke(interaction);
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'karaoke:modal:config') return saveConfig(interaction);

    if (!interaction.isButton()) return;
    if (interaction.customId === 'karaoke:config') return interaction.showModal(createConfigModal(interaction.guildId));
    if (interaction.customId.startsWith('karaoke:difficulty:')) return setDifficulty(interaction, interaction.customId.split(':').at(-1));
    if (interaction.customId === 'karaoke:start') return startKaraoke(interaction);
    if (interaction.customId === 'karaoke:score') return showScores(interaction);
    if (interaction.customId === 'karaoke:stop') return stopKaraoke(interaction);
    if (interaction.customId === 'karaoke:reset') return resetKaraoke(interaction);
  } catch (error) {
    console.error(error);
    const payload = { content: '처리 중 오류가 났어. 콘솔 로그를 확인해줘.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);
  }
});

if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN is required');
client.login(process.env.DISCORD_TOKEN);
