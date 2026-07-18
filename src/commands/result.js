const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { TIERS, GAME_MODES, RESULTS_TITLE } = require('../config');
const db = require('../database');
const { isTesterOrAdmin } = require('../utils/permissions');
const { refreshQueueDisplay } = require('../utils/queueDisplay');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('result')
    .setDescription('[Tester] Submit a test result for a player')
    .addUserOption(opt => opt.setName('player').setDescription('Player being tested').setRequired(true))
    .addIntegerOption(opt => opt.setName('points').setDescription('Points earned').setRequired(true))
    .addStringOption(opt =>
      opt.setName('rank').setDescription('Tier earned').setRequired(true)
        .addChoices(...TIERS.map(t => ({ name: t, value: t }))))
    .addStringOption(opt => opt.setName('region').setDescription('Region').setRequired(true))
    .addStringOption(opt =>
      opt.setName('outcome').setDescription('Test result').setRequired(true)
        .addChoices({ name: 'Pass', value: 'Pass' }, { name: 'Fail', value: 'Fail' })),

  async execute(interaction) {
    if (!isTesterOrAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ Only Testers/Admins can use this command.', ephemeral: true });
    }

    const guild = interaction.guild;
    const player = interaction.options.getUser('player');
    const points = interaction.options.getInteger('points');
    const rank = interaction.options.getString('rank');
    const region = interaction.options.getString('region');
    const outcome = interaction.options.getString('outcome');

    if (!db.isRegistered(guild.id, player.id)) {
      return interaction.reply({ content: `❌ ${player} is not registered, so a result cannot be submitted.`, ephemeral: true });
    }

    await interaction.deferReply();

    const cfg = db.getGuildConfig(guild.id);
    if (!cfg) return interaction.editReply('⚠️ The bot has not been set up yet. Please run `/setup` first.');

    // Figure out which mode this result is for — prefer the open ticket in this channel, else any mode player is queued in
    let gameMode = null;
    const ticket = db.getTicket(interaction.channel.id);
    if (ticket) gameMode = ticket.game_mode;

    if (!gameMode) {
      const anyEntry = db.findAnyQueueEntry(guild.id, player.id);
      if (anyEntry) gameMode = anyEntry.game_mode;
    }

    if (!gameMode) {
      return interaction.editReply('⚠️ Could not determine the game mode (it is not set on this ticket, and the player is not in any queue). Use `/result` inside a ticket, or make sure the player is in a queue.');
    }

    // Capture previous rank BEFORE overwriting, for the result template
    const previousRankRow = db.getRank(guild.id, player.id, gameMode);
    const previousRank = previousRankRow?.tier ?? 'Untested';

    // Save rank + points, remove from just this mode's queue (not other modes)
    db.setRank(guild.id, player.id, gameMode, rank, points);
    db.addWeeklyPoints(guild.id, player.id, points);
    db.leaveQueue(guild.id, player.id, gameMode);
    await refreshQueueDisplay(guild, cfg, gameMode);

    // Assign the tier role, remove other tier roles for this mode
    const member = await guild.members.fetch(player.id).catch(() => null);
    if (member) {
      const modeTierRoleIds = TIERS.map(t => cfg.tier_roles[`${gameMode}:${t}`]).filter(Boolean);
      const toRemove = member.roles.cache.filter(r => modeTierRoleIds.includes(r.id));
      if (toRemove.size) await member.roles.remove(toRemove).catch(() => {});

      const newRoleId = cfg.tier_roles[`${gameMode}:${rank}`];
      if (newRoleId) await member.roles.add(newRoleId).catch(() => {});

      // remove the "in queue" role for this mode since they're done
      const queueRoleId = cfg.mode_roles[gameMode];
      if (queueRoleId && member.roles.cache.has(queueRoleId)) {
        await member.roles.remove(queueRoleId).catch(() => {});
      }
    }

    // Close ticket if this was run inside one
    if (ticket && ticket.status === 'open') {
      db.closeTicket(interaction.channel.id);
    }

    const playerRow = db.getPlayer(guild.id, player.id);
    const modeLabel = GAME_MODES.find(m => m.id === gameMode)?.label ?? gameMode;
    const resultNumber = db.nextResultNumber(guild.id);

    // ---- Formatted result template ----
    const resultEmbed = new EmbedBuilder()
      .setTitle(`${resultNumber}. ${RESULTS_TITLE}`)
      .setColor(outcome === 'Pass' ? 0x57f287 : 0xed4245)
      .addFields(
        { name: 'Tester', value: `${interaction.user}`, inline: true },
        { name: 'Region', value: region, inline: true },
        { name: 'Account Type', value: playerRow?.launcher ?? 'N/A', inline: true },
        { name: 'IGN', value: playerRow?.ign ?? 'N/A', inline: true },
        { name: 'Previous Rank', value: previousRank, inline: true },
        { name: 'Tier Earned', value: rank, inline: true },
        { name: 'Points Earned', value: String(points), inline: true },
        { name: 'Gamemode', value: modeLabel, inline: true },
        { name: 'Test Result', value: outcome, inline: true },
      );

    // Post to the results log channel if one exists, otherwise fall back to this channel
    const resultsChannel = cfg.results_channel_id
      ? await guild.channels.fetch(cfg.results_channel_id).catch(() => null)
      : null;

    if (resultsChannel) {
      await resultsChannel.send({ content: `${player}`, embeds: [resultEmbed] });
      await interaction.editReply(`✅ Result submitted and posted in ${resultsChannel}.`);
    } else {
      await interaction.editReply({ embeds: [resultEmbed] });
    }

    if (ticket) {
      await interaction.channel.send('🔒 This ticket can now be closed. An admin can delete or archive this channel.');
    }
  },
};
