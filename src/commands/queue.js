const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { GAME_MODES } = require('../config');
const db = require('../database');
const { isTesterOrAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('[Tester] Check queue counts or open a ticket with a player')
    .addSubcommand(sub =>
      sub.setName('check')
        .setDescription('See how many players are in a mode queue')
        .addStringOption(opt =>
          opt.setName('game_mode').setDescription('Game mode').setRequired(true)
            .addChoices(...GAME_MODES.map(m => ({ name: m.label, value: m.id })))))
    .addSubcommand(sub =>
      sub.setName('open-ticket')
        .setDescription('Open a private ticket channel with a queued player')
        .addUserOption(opt => opt.setName('player').setDescription('The player to open a ticket with').setRequired(true))
        .addStringOption(opt =>
          opt.setName('game_mode').setDescription('Which mode is this ticket for').setRequired(false)
            .addChoices(...GAME_MODES.map(m => ({ name: m.label, value: m.id }))))),

  async execute(interaction) {
    if (!isTesterOrAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ Ye command sirf Tester/Admin use kar sakte hain.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const cfg = db.getGuildConfig(guild.id);
    if (!cfg) return interaction.reply({ content: '⚠️ Bot abhi setup nahi hua. Pehle `/setup` chalao.', ephemeral: true });

    if (sub === 'check') {
      const mode = interaction.options.getString('game_mode');
      const count = db.getQueueCount(guild.id, mode);
      const threshold = cfg.thresholds[mode] ?? 8;
      const modeLabel = GAME_MODES.find(m => m.id === mode)?.label ?? mode;
      const embed = new EmbedBuilder()
        .setTitle(`📋 ${modeLabel} Queue`)
        .setDescription(`**${count} / ${threshold}** players in queue`)
        .setColor(0x5865f2);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'open-ticket') {
      const player = interaction.options.getUser('player');
      const mode = interaction.options.getString('game_mode');

      if (!db.isRegistered(guild.id, player.id)) {
        return interaction.reply({ content: `❌ ${player} abhi registered nahi hai.`, ephemeral: true });
      }

      const existingTicket = db.getOpenTicketForPlayer(guild.id, player.id);
      if (existingTicket) {
        return interaction.reply({ content: `⚠️ ${player} ka ek ticket already open hai: <#${existingTicket.channel_id}>`, ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const channelName = `ticket-${(player.username || 'player').toLowerCase().slice(0, 20)}`;
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: cfg.ticket_category_id || undefined,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: player.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          ...(cfg.admin_role_id ? [{ id: cfg.admin_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
        ],
      });

      db.createTicket(ticketChannel.id, guild.id, player.id, interaction.user.id, mode || null);

      const embed = new EmbedBuilder()
        .setTitle('🎫 Testing Ticket')
        .setDescription(`Tester: ${interaction.user}\nPlayer: ${player}${mode ? `\nMode: ${GAME_MODES.find(m => m.id === mode)?.label}` : ''}\n\nTester, jab test complete ho jaye, \`/result\` command use karo.`)
        .setColor(0x57f287);

      await ticketChannel.send({ content: `${player} ${interaction.user}`, embeds: [embed] });
      return interaction.editReply(`✅ Ticket ban gaya: ${ticketChannel}`);
    }
  },
};
