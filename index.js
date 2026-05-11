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

function getAiComment(score) {
  if (score.total >= 90) return '레전드급 콘서트였어. 여우 귀가 자동으로 쫑긋했다구!';
  if (score.total >= 80) return '오? 꽤 잘 부르는데. 인정하긴 싫지만 잘했어.';
  if (score.total >= 70) return '괜찮아. 음정이랑 성량만 조금 더 잡으면 더 좋아져.';
  if (score.total >= 60) return '가능성은 있어. 박자랑 숨 조절부터 다시 다듬자.';
  return '오늘은 예능 점수야. 그래도 용기는 100점 줘도 되겠네.';
}

function createPanel() {
  const embed = new EmbedBuilder()
    .setTitle('🦊 나츠미 노래방 AI 채점')
    .setDescription('음성방에서 노래하면 나츠미가 음정 안정감, 성량, 지속력을 기준으로 점수를 매겨줄게.')
    .addFields(
      { name: '사용법', value: '1. 음성채널 입장\n2. 시작 버튼 클릭\n3. 노래 부르기\n4. 종료 또는 채점 버튼 클릭' },
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

async function startKaraoke(interaction) {
  const member = interaction.member;
  const voiceChannel = member.voice?.channel;

  if (!voiceChannel) {
    return interaction.reply({ content: '먼저 음성채널에 들어와야지, 바보야 🦊', ephemeral: true });
  }

  const existing = sessions.get(interaction.guildId);
  if (existing?.isRecording) {
    return interaction.reply({ content: '이미 채점 중이야. 노래나 불러, 흥.', ephemeral: true });
  }

  ensureRecordingsDir();

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
      else console.log('Recording saved:', filename);
    });

    const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
    decodeInput.pipe(decoder).on('data', (pcmChunk) => updateAudioStats(stats, pcmChunk));
    decoder.on('error', (error) => console.error('Decoder error:', error));
  });

  return interaction.reply({ content: `🎙️ **${voiceChannel.name}**에서 AI 노래 채점을 시작했어!`, ephemeral: true });
}

async function showScores(interaction) {
  const session = sessions.get(interaction.guildId);
  if (!session || session.userStats.size === 0) {
    return interaction.reply({ content: '아직 채점할 노래 데이터가 없어. 먼저 시작 버튼 누르고 노래해줘.', ephemeral: true });
  }

  const results = [...session.userStats.entries()]
    .map(([userId, stats]) => ({ userId, stats, score: scoreStats(stats) }))
    .filter((result) => result.score.durationSeconds >= 1)
    .sort((a, b) => b.score.total - a.score.total);

  if (!results.length) {
    return interaction.reply({ content: '노래가 너무 짧아. 최소 1초 이상은 불러줘야 점수를 낼 수 있어.', ephemeral: true });
  }

  const description = results
    .slice(0, 10)
    .map((result, index) => {
      const rank = index + 1;
      const { userId, score } = result;
      return [
        `**${rank}위** <@${userId}> — **${score.total}점**`,
        `음정 안정 ${score.pitchStability} / 성량 ${score.volumeScore} / 유지력 ${score.volumeConsistency}`,
        `💬 ${getAiComment(score)}`,
      ].join('\n');
    })
    .join('\n\n');

  const embed = new EmbedBuilder()
    .setTitle('🏆 나츠미 AI 노래 채점 결과')
    .setDescription(description)
    .setFooter({ text: '참고: 기준곡 없이 음성 안정감/성량/지속력으로 계산하는 기본 채점 엔진입니다.' })
    .setColor(0xfeca57);

  return interaction.reply({ embeds: [embed] });
}

async function stopKaraoke(interaction) {
  const session = sessions.get(interaction.guildId);
  if (!session) {
    return interaction.reply({ content: '진행 중인 채점이 없어.', ephemeral: true });
  }

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
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'karaoke-setup') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({ content: '서버 관리 권한이 있어야 설치할 수 있어.', ephemeral: true });
        }
        await interaction.channel.send(createPanel());
        return interaction.reply({ content: '노래방 AI 채점 패널을 설치했어 🦊', ephemeral: true });
      }

      if (interaction.commandName === 'record') return startKaraoke(interaction);
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

if (!process.env.DISCORD_TOKEN) {
  throw new Error('DISCORD_TOKEN is required');
}

client.login(process.env.DISCORD_TOKEN);
