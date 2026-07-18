const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { GAME_MODES, TIERS, ROLE_NAMES, CHANNEL_NAMES, DEFAULT_QUEUE_THRESHOLD } = require('../config');
const { saveGuildConfig, getGuildConfig } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('[Admin] Auto-create all roles, channels, and the registration panel for this bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;

    // ---- Roles ----
    const registeredRole = await findOrCreateRole(guild, ROLE_NAMES.registered);
    const testerRole = await findOrCreateRole(guild, ROLE_NAMES.tester);
    const adminRole = await findOrCreateRole(guild, ROLE_NAMES.admin);

    const modeRoles = {};
    const tierRoles = {};
    for (const mode of GAME_MODES) {
      modeRoles[mode.id] = (await findOrCreateRole(guild, `${ROLE_NAMES.queuePrefix}${mode.label}`)).id;
      for (const tier of TIERS) {
        const roleName = `${mode.label} ${tier}`;
        tierRoles[`${mode.id}:${tier}`] = (await findOrCreateRole(guild, roleName)).id;
      }
    }

    // ---- Category + Channels ----
    const category = await findOrCreateCategory(guild, CHANNEL_NAMES.category);
    const ticketCategory = await findOrCreateCategory(guild, CHANNEL_NAMES.ticketCategory);

    const modeChannels = {};
    for (const mode of GAME_MODES) {
      const chName = `${CHANNEL_NAMES.queuePrefix}${mode.id}`;
      const ch = await findOrCreateTextChannel(guild, chName, category.id, [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] },
      ]);
      modeChannels[mode.id] = ch.id;
    }

    const lockChannel = await findOrCreateTextChannel(guild, CHANNEL_NAMES.lockChannel, category.id, [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] },
    ]);

    const interfaceChannel = await findOrCreateTextChannel(guild, CHANNEL_NAMES.interfacePanel, category.id, [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] },
    ]);

    // ---- Thresholds ----
    const existing = getGuildConfig(guild.id);
    const thresholds = existing?.thresholds || {};
    for (const mode of GAME_MODES) {
      if (!(mode.id in thresholds)) thresholds[mode.id] = DEFAULT_QUEUE_THRESHOLD;
    }

    // ---- Save config ----
    saveGuildConfig(guild.id, {
      category_id: category.id,
      ticket_category_id: ticketCategory.id,
      lock_channel_id: lockChannel.id,
      interface_channel_id: interfaceChannel.id,
      registered_role_id: registeredRole.id,
      tester_role_id: testerRole.id,
      admin_role_id: adminRole.id,
      mode_roles: modeRoles,
      mode_channels: modeChannels,
      tier_roles: tierRoles,
      thresholds,
    });

    // ---- Post the registration panel ----
    const embed = new EmbedBuilder()
      .setTitle('🎮 PvP Testing Registration')
      .setDescription('Click **Register** below to sign up before you can join any queue.')
      .setColor(0x5865f2);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_register_modal').setLabel('Register').setStyle(ButtonStyle.Success).setEmoji('📝'),
      new ButtonBuilder().setCustomId('open_queue_menu').setLabel('Queue').setStyle(ButtonStyle.Primary).setEmoji('⚔️'),
    );

    const msg = await interfaceChannel.send({ embeds: [embed], components: [row] });
    saveGuildConfig(guild.id, { interface_message_id: msg.id });

    await interaction.editReply(
      `✅ Setup complete!\n` +
      `- Category: ${category}\n` +
      `- Registration panel: ${interfaceChannel}\n` +
      `- Lock/alerts channel: ${lockChannel}\n` +
      `- Ticket category: ${ticketCategory}\n` +
      `- Created ${GAME_MODES.length} queue channels, ${GAME_MODES.length} queue roles, and ${GAME_MODES.length * TIERS.length} tier roles.\n\n` +
      `Give trusted members the **${ROLE_NAMES.tester}** or **${ROLE_NAMES.admin}** role to unlock tester/admin commands.`
    );
  },
};

async function findOrCreateRole(guild, name) {
  let role = guild.roles.cache.find(r => r.name === name);
  if (!role) role = await guild.roles.create({ name, mentionable: false });
  return role;
}

async function findOrCreateCategory(guild, name) {
  let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === name);
  if (!cat) cat = await guild.channels.create({ name, type: ChannelType.GuildCategory });
  return cat;
}

async function findOrCreateTextChannel(guild, name, parentId, overwrites) {
  let ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name && c.parentId === parentId);
  if (!ch) {
    ch = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: parentId,
      permissionOverwrites: overwrites,
    });
  }
  return ch;
}
