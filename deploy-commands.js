import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

const commands = [
  new SlashCommandBuilder()
    .setName('karaoke')
    .setDescription('나츠미 노래방 메인 커맨드입니다.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('간지나는 노래방 AI 채점 패널을 현재 채널에 설치합니다.'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('start')
        .setDescription('내가 들어간 음성채널에서 원곡 비교 채점을 시작합니다.')
        .addStringOption((option) =>
          option
            .setName('song')
            .setDescription('기준곡 ID입니다. 기본값은 scale_practice 입니다.')
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('score')
        .setDescription('현재 노래방 채점 결과를 이미지 카드로 보여줍니다.'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('stop')
        .setDescription('현재 노래방 채점을 종료합니다.'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('현재 서버의 노래방 채점 데이터를 초기화합니다.'),
    ),
  new SlashCommandBuilder()
    .setName('karaoke-setup')
    .setDescription('원곡 비교 노래방 AI 채점 패널을 현재 채널에 설치합니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('record')
    .setDescription('내가 들어간 음성채널에서 원곡 비교 노래방 AI 채점을 시작합니다.')
    .addStringOption((option) =>
      option
        .setName('song')
        .setDescription('기준곡 ID입니다. 기본값은 scale_practice 입니다.')
        .setRequired(false),
    ),
].map((command) => command.toJSON());

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  throw new Error('DISCORD_TOKEN and CLIENT_ID are required');
}

const rest = new REST({ version: '10' }).setToken(token);

const route = guildId
  ? Routes.applicationGuildCommands(clientId, guildId)
  : Routes.applicationCommands(clientId);

await rest.put(route, { body: commands });
console.log(guildId ? 'Guild commands deployed.' : 'Global commands deployed.');
