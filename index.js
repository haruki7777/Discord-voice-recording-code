import 'dotenv/config';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
} from 'discord.js';
import { EndBehaviorType, getVoiceConnection, joinVoiceChannel } from '@discordjs/voice';
import prism from 'prism-media';
import fs from 'node:fs';
import { PassThrough, pipeline } from 'node:stream';
import { getEnabledAiProviderNames, judgeWithAI } from './aiScorer.js';
import { combineScores, createEmptyReferenceStats, scoreAgainstReference, updateReferenceStats } from './karaokeScorer.js';
import { getReferenceSong, listReferenceSongs } from './referenceSongs.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const sessions = new Map();
const RECORDINGS_DIR = './recordings';

function ensureRecordingsDir() {
  if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createEmptyStats() {
  return {
    chunks: 0,
    totalSamples: 0,
    loudness: [],
    zeroCrossings: [],
    peak: 0,
    files: [],
    reference: createEmptyReferenceStats(),
  };
}

function getUserStats(session, userId) {
  if (!session.userStats.has(userId)) session.userStats.set(userId, createEmptyStats());
  return session.userStats.get(userId);
}

function updateAudioStats(stats, pcmChunk, session) {
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

  const elapsedSeconds = (Date.now() - session.startedAt) / 1000;
  updateReferenceStats(stats.reference, pcmChunk, session.referenceSong, elapsedSeconds);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const avg = average(values);
  const variance = average(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function scoreStats(stats) {
  const durationSeconds = stats.totalSamples / 48000 / 2;
  const loudnessAvg = average(stats.loudness);
  const loudnessDev = standardDeviation(stats.loudness);
  const zcrAvg = average(stats.zeroCrossings);
  const zcrDev = standardDeviation(stats.zeroCrossings);

  const volumeScore = clamp(loudnessAvg * 320, 0, 100);
  const powerScore = clamp(stats.peak * 130, 0, 100);
  const volumeConsistency = clamp(100 - (loudnessDev / Math.max(loudnessAvg, 0.001)) * 90, 0, 100);
  const pitchStability = clamp(100 - (zcrDev / Math.max(zcrAvg, 0.001)) * 120, 0, 100);
  const durationScore = clamp(durationSeconds * 9, 0, 100);

  const total = Math.round(
    pitchStability * 0.3 +
      volumeConsistency * 0.25 +
      volumeScore * 0.18 +
      powerScore * 0.12 +
      durationScore * 0.15,
  );

  return {
    total: clamp(total, 0, 100),
    durationSeconds,
    pitchStability: Math.round(pitchStability),
    volumeConsistency: Math.round(volumeConsistency),
    volumeScore: Math.round(volumeScore),
    powerScore: Math.round(powerScore),
  };
}

function getAiComment(finalScore) {
  if (finalScore >= 90) return '원곡 싱크가 꽤 맞았어. 레전드라고 불러도 봐줄게.';
  if (finalScore >= 80) return '음정이 제법 원곡을 따라갔어. 흥, 인정은 해줄게.';
  if (finalScore >= 70) return '괜찮아. 후렴 음정이랑 박자만 더 맞추면 올라가.';
  if (finalScore >= 60) return '가능성은 있어. 원곡 멜로디를 더 듣고 박자를 맞춰봐.';
  return '오늘은 예능 점수야. 그래도 도망 안 간 건 칭찬해줄게.';
}

function createPanel() {
  const providers = getEnabledAiProviderNames();
  const providerText = providers.length ? providers.join(', ') : 'local only';
  const songs = listReferenceSongs().map((song) => `${song.id}: ${song.title}`).join('\n');
  const embed = new EmbedBuilder()
    .setTitle('🦊 나츠미 노래방 AI 원곡 채점')
    .setDescription('음성방에서 노래하면 원곡 멜로디 데이터와 비교해서 금영/태진식에 가까운 점수를 내볼게.')
    .addFields(
      { name: '사용법', value: '1. 음성채널 입장\n2. 시작 버튼 클릭\n3. 기준 멜로디에 맞춰 노래\n4. 점수 보기 클릭' },
      { name: '현재 기준곡', value: songs || '등록된 곡 없음' },
      { name: 'AI 평가', value: `사용 가능 API: ${providerText}` },
      { name: '주의', value: '녹음/분석이 진행될 수 있으니 참여자 동의를 받고 사용해줘.' },
    )
    .setColor(0xff9f43);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('karaoke:start').setLabel('🎙️ 채점 시작').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('karaoke:score').setLabel('🏆 점수 보기').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('karaoke:stop').setLabel('⏹️ 종료').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('karaoke:reset').setLabel('🧹 초기화').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

async function startKaraoke(interaction, songId) {
  const member = interaction.member;
  const voiceChannel = member.voice?.channel;

  if (!voiceChannel) return interaction.reply({ content: '먼저 음성채널에 들어와야지, 바보야 🦊', ephemeral: true });

  const existing = sessions.get(interaction.guildId);
  if (existing?.isRecording) return interaction.reply({ content: '이미 채점 중이야. 노래나 불러, 흥.', ephemeral: true });

  ensureRecordingsDir();
  const referenceSong = getReferenceSong(songId);

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
    referenceSong,
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
    decodeInput.pipe(decoder).on('data', (pcmChunk) => updateAudioStats(stats, pcmChunk, session));
    decoder.on('error', (error) => console.error('Decoder error:', error));
  });

  return interaction.reply({ content: `🎙️ **${voiceChannel.name}**에서 **${referenceSong.title}** 원곡 비교 채점을 시작했어!`, ephemeral: true });
}

async function showScores(interaction) {
  const session = sessions.get(interaction.guildId);
  if (!session || session.userStats.size === 0) return interaction.reply({ content: '아직 채점할 노래 데이터가 없어.', ephemeral: true });

  await interaction.deferReply();

  const results = [...session.userStats.entries()]
    .map(([userId, stats]) => {
      const localScore = scoreStats(stats);
      const referenceScore = scoreAgainstReference(stats.reference, session.referenceSong);
      const finalScore = combineScores(localScore, referenceScore);
      return { userId, stats, localScore, referenceScore, finalScore };
    })
    .filter((result) => result.localScore.durationSeconds >= 1)
    .sort((a, b) => b.finalScore - a.finalScore);

  if (!results.length) return interaction.editReply({ content: '노래가 너무 짧아. 최소 1초 이상은 불러줘야 점수를 낼 수 있어.' });

  const judgedResults = [];
  for (const result of results.slice(0, 10)) {
    const fallbackComment = getAiComment(result.finalScore);
    const ai = await judgeWithAI({
      userId: result.userId,
      localScore: result.localScore,
      referenceScore: result.referenceScore,
      finalScore: result.finalScore,
      song: session.referenceSong,
      fallbackComment,
    });
    judgedResults.push({ ...result, ai });
  }

  const description = judgedResults.map((result, index) => {
    const { userId, localScore, referenceScore, finalScore, ai } = result;
    return [
      `**${index + 1}위** <@${userId}> — **${finalScore}점**`,
      `원곡 ${referenceScore.referenceTotal} / 음정 ${referenceScore.pitchAccuracy} / 리듬 ${referenceScore.rhythm} / 성량 ${localScore.volumeScore}`,
      `오차 ${referenceScore.medianPitchErrorCents} cents / AI: [${ai.provider}]`,
      `💬 ${ai.comment}`,
    ].join('\n');
  }).join('\n\n');

  const embed = new EmbedBuilder()
    .setTitle('🏆 나츠미 AI 원곡 비교 채점 결과')
    .setDescription(description)
    .addFields({ name: '기준곡', value: `${session.referenceSong.title} (${session.referenceSong.id})` })
    .setFooter({ text: '최종점수 = 원곡 비교 65% + 기본 음성점수 35%' })
    .setColor(0xfeca57);

  return interaction.editReply({ embeds: [embed] });
}

async function stopKaraoke(interaction) {
  const session = sessions.get(interaction.guildId);
  if (!session) return interaction.reply({ content: '진행 중인 채점이 없어.', ephemeral: true });
  session.isRecording = false;
  const connection = getVoiceConnection(interaction.guildId);
  if (connection) connection.destroy();
  return interaction.reply({ content: '⏹️ 채점을 종료했어. 점수 보기 버튼으로 결과 확인해.', ephemeral: true });
}

async function resetKaraoke(interaction) {
  const session = sessions.get(interaction.guildId);
  if (session) {
    session.isRecording = false;
    session.connection?.destroy();
  }
  sessions.delete(interaction.guildId);
  return interaction.reply({ content: '🧹 현재 서버의 노래방 채점 데이터를 초기화했어.', ephemeral: true });
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
        await interaction.channel.send(createPanel());
        return interaction.reply({ content: '원곡 비교 노래방 AI 채점 패널을 설치했어 🦊', ephemeral: true });
      }

      if (interaction.commandName === 'record') {
        const songId = interaction.options.getString('song') || undefined;
        return startKaraoke(interaction, songId);
      }
    }

    if (!interaction.isButton()) return;
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
