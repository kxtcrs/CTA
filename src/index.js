require('dotenv').config();

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  ActivityType,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const {
  closeDatabase,
  createPendingGoogleAuth,
  hasGuildWelcomeMessage,
  getGuildSettings,
  initializeDatabase,
  markGuildWelcomeMessageSent,
  saveGuildSettings
} = require('./database');
const {
  createAuthorizationState,
  createGoogleAuthorizationUrl,
  hashAuthorizationState
} = require('./googleAuth');
const { startOAuthServer } = require('./oauthServer');
const { canConfigureSheet } = require('./permissions');
const { appendSignup } = require('./sheets');
const { getEncryptionKey } = require('./tokenEncryption');
const { cleanSheetTab, cleanText, extractSpreadsheetId, parseWeapons } = require('./validation');

const requiredEnvironment = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DATABASE_URL',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REDIRECT_URI',
  'GOOGLE_TOKEN_ENCRYPTION_KEY'
];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
if (missingEnvironment.length) {
  console.error(`Missing required environment variables: ${missingEnvironment.join(', ')}`);
  process.exit(1);
}

try {
  getEncryptionKey();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Set the CTA signup channel and post a signup panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Text channel where members will sign up')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('sheet-setup')
    .setDescription('Authorize Google and connect this server to a signup sheet.')
    .addStringOption((option) =>
      option
        .setName('spreadsheet')
        .setDescription('Google Sheets URL or spreadsheet ID')
        .setMaxLength(300)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('tab')
        .setDescription('Worksheet tab to store signups')
        .setMaxLength(100)
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('signup')
    .setDescription('Sign up for the CTA roster.')
].map((command) => command.toJSON());

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const route = process.env.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID)
    : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);
  await rest.put(route, { body: commands });
  console.log(process.env.DISCORD_GUILD_ID
    ? `Registered commands in guild ${process.env.DISCORD_GUILD_ID}.`
    : 'Registered global commands (Discord may take time to display them).');
}

function buildSignupPanel() {
  const embed = new EmbedBuilder()
    .setTitle('CTA Albion Sign-up')
    .setDescription('Use the button below to join the roster. Enter your Albion in-game name, preferred role, and at least 3 weapons you can play.')
    .setColor(0x5865f2);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('cta:signup')
      .setLabel('Sign up')
      .setStyle(ButtonStyle.Primary)
  );
  return { embeds: [embed], components: [row] };
}

function canSendWelcome(channel, guild) {
  const botMember = guild.members.me;
  if (!botMember) return false;
  const permissions = channel.permissionsFor(botMember);
  return Boolean(
    permissions &&
    permissions.has(PermissionFlagsBits.ViewChannel) &&
    permissions.has(PermissionFlagsBits.SendMessages)
  );
}

function findWelcomeChannel(guild) {
  if (guild.systemChannel && canSendWelcome(guild.systemChannel, guild)) {
    return guild.systemChannel;
  }
  return guild.channels.cache.find((channel) =>
    (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) &&
    canSendWelcome(channel, guild)
  ) || null;
}

async function sendGuildWelcome(guild) {
  const channel = findWelcomeChannel(guild);
  if (!channel) {
    console.warn(`Could not post setup instructions in guild ${guild.id}: no writable text channel.`);
    return false;
  }

  await channel.send([
    'Thanks for adding the CTA Albion Sign-up bot!',
    '',
    '**Server setup**',
    '1. An administrator runs `/setup` and chooses the signup channel.',
    '2. The server owner or a member with a role named **Officer** (case-insensitive) runs `/sheet-setup`, enters the Google Sheet URL and tab, then follows the private Google sign-in link.',
    '',
    '**Member signup**',
    'Members click the **Sign up** button in the configured channel or run `/signup`, then enter their Albion name, preferred role, and at least three weapons.'
  ].join('\n'));
  return true;
}

const welcomeTasks = new Map();

async function sendGuildWelcomeOnce(guild) {
  if (welcomeTasks.has(guild.id)) return welcomeTasks.get(guild.id);

  const task = (async () => {
    if (await hasGuildWelcomeMessage(guild.id)) return;
    if (await sendGuildWelcome(guild)) {
      await markGuildWelcomeMessageSent(guild.id);
    }
  })();
  welcomeTasks.set(guild.id, task);

  try {
    await task;
  } finally {
    welcomeTasks.delete(guild.id);
  }
}

function buildSignupModal() {
  return new ModalBuilder()
    .setCustomId('cta:signup-modal')
    .setTitle('CTA Albion Sign-up')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ign')
          .setLabel('Albion in-game name')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(50)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('role')
          .setLabel('Preferred role')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(80)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('weapons')
          .setLabel('Weapons you can use (at least 3)')
          .setPlaceholder('Example: Great Holy, Hallowfall, Fallen Staff')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(true)
      )
    );
}

async function handleCommand(interaction) {
  if (interaction.commandName === 'setup') {
    const channel = interaction.options.getChannel('channel', true);
    if (!channel.isTextBased() || !channel.guild) {
      await interaction.reply({ content: 'Choose a text channel in this server.', flags: MessageFlags.Ephemeral });
      return;
    }
    await channel.send(buildSignupPanel());
    await saveGuildSettings(interaction.guildId, { signupChannelId: channel.id });
    await interaction.reply({
      content: `CTA signup panel posted in <#${channel.id}>.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (interaction.commandName === 'sheet-setup') {
    if (!canConfigureSheet(interaction)) {
      await interaction.reply({
        content: 'Only a member with the Officer role or the server owner can configure the Google Sheet.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    const spreadsheetId = extractSpreadsheetId(interaction.options.getString('spreadsheet', true));
    const sheetTab = cleanSheetTab(interaction.options.getString('tab', true));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const state = createAuthorizationState();
    await createPendingGoogleAuth({
      stateHash: hashAuthorizationState(state),
      guildId: interaction.guildId,
      spreadsheetId,
      sheetTab
    });
    const authorizationUrl = createGoogleAuthorizationUrl(state);
    await interaction.editReply(
      `Finish connecting this server's Google Sheet by signing in here (link expires in 10 minutes):\n${authorizationUrl}`
    );
    return;
  }

  if (interaction.commandName === 'signup') {
    const settings = await getGuildSettings(interaction.guildId);
    if (!settings || !settings.signup_channel_id || !settings.spreadsheet_id || !settings.sheet_tab) {
      await interaction.reply({
        content: 'An admin must run `/setup` and `/sheet-setup` before signups are available.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    await interaction.showModal(buildSignupModal());
  }
}

async function handleModalSubmit(interaction) {
  const settings = await getGuildSettings(interaction.guildId);
  if (!settings || !settings.signup_channel_id || !settings.spreadsheet_id || !settings.sheet_tab) {
    await interaction.reply({
      content: 'Signups are not fully configured yet. Please contact a server admin.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const ign = cleanText(interaction.fields.getTextInputValue('ign'), 'Albion in-game name', 50);
  const role = cleanText(interaction.fields.getTextInputValue('role'), 'Preferred role', 80);
  const weapons = parseWeapons(interaction.fields.getTextInputValue('weapons'));
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await appendSignup(settings, [
    new Date().toISOString(),
    interaction.user.id,
    interaction.user.globalName || interaction.user.username,
    ign,
    role,
    weapons.join(', ')
  ]);
  await interaction.editReply('You are signed up! Your details have been added to the CTA Google Sheet.');
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
    } else if (interaction.isButton() && interaction.customId === 'cta:signup') {
      await interaction.showModal(buildSignupModal());
    } else if (interaction.isModalSubmit() && interaction.customId === 'cta:signup-modal') {
      await handleModalSubmit(interaction);
    }
  } catch (error) {
    console.error('Interaction failed:', error.message);
    let message = 'That action failed. Please check the bot setup or contact a server admin.';
    if (interaction.isChatInputCommand() &&
        (interaction.commandName === 'setup' || interaction.commandName === 'sheet-setup')) {
      message = `Setup failed: ${error.message}`;
    } else if (interaction.isModalSubmit() && !interaction.deferred && !interaction.replied) {
      message = error.message;
    } else if (interaction.isModalSubmit()) {
      message = 'Could not save your signup to Google Sheets. It was not confirmed; please contact an admin.';
    }
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message).catch((replyError) => {
        console.error('Could not send interaction error response:', replyError);
      });
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch((replyError) => {
        console.error('Could not send interaction error response:', replyError);
      });
    }
  }
});

client.once(Events.ClientReady, (readyClient) => {
  readyClient.user.setPresence({
    status: 'online',
    activities: [{ name: 'CTA signups | /signup', type: ActivityType.Playing }]
  });
  console.log(`CTA signup bot is online as ${readyClient.user.tag}.`);
  for (const guild of readyClient.guilds.cache.values()) {
    sendGuildWelcomeOnce(guild).catch((error) => {
      console.error(`Could not post setup instructions in guild ${guild.id}:`, error.message);
    });
  }
});

client.on(Events.GuildCreate, (guild) => {
  sendGuildWelcomeOnce(guild).catch((error) => {
    console.error(`Could not post setup instructions in guild ${guild.id}:`, error.message);
  });
});

let oauthServer;

async function start() {
  await initializeDatabase();
  await registerCommands();
  oauthServer = await startOAuthServer();
  await client.login(process.env.DISCORD_TOKEN);
}

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down.`);
  if (oauthServer) {
    await new Promise((resolve) => oauthServer.close(resolve));
  }
  client.destroy();
  await closeDatabase();
  process.exit(0);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

start().catch(async (error) => {
  console.error('Bot startup failed:', error);
  if (oauthServer) {
    await new Promise((resolve) => oauthServer.close(resolve));
  }
  client.destroy();
  await closeDatabase().catch((closeError) => console.error('Database shutdown failed:', closeError));
  process.exit(1);
});
