const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { TIERS } = require('../config');
const db = require('../database');
const { isTesterOrAdmin } = require('../utils/permissions');
const { getTicket, closeTicket } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('result')
    .setDescription('[Tester] Submit a test result for a player')
    .addUserOption(opt => opt.setName('player').setDescription('Player being tested').setRequired(true))
    .addIntegerOption(opt => opt.setName('points').setDescription('Points earned').setRequired(true))
    .addStringOption(opt =>
      opt.setName('rank').setDescription('Tier earned').setRequired(true)
        .addChoices(...TIERS.map(t => ({ name: t, value: t }))))
    .addStringOption(opt => opt.setName('region').setDescription('Region').setRequired(true)),

  async execute(interaction) {
    if (!isTesterOrAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ Ye command sirf Tester/Admin use kar sakte hain.', ephemeral: true });
    }

    const guild = interaction.guild;
    const player = interaction.options.getUser('player');
    const points = interaction.options.getInteger('points');
    const rank = interaction.options.getString('rank');
    const region = interaction.options.getString('region');

    if (!db.isRegistered(guild.id, player.id)) {
      return interaction.reply({ content: `❌ ${player} registered nahi hai, result submit nahi ho sakta.`, ephemeral: true });
    }

    await interaction.deferReply();

    const cfg = db.getGuildConfig(guild.id);
    if (!cfg) return interaction.editReply('⚠️ Bot setup nahi hua. Pehle `/setup` chalao.');

    // Figure out which mode this result is for — prefer the open ticket in this channel, else any mode player is queued in
    let gameMode = null;
    const ticket = getTicket(interaction.channel.id);
    if (ticket) gameMode = ticket.game_mode;

    if (!gameMode) {
      // fallback: find a mode the player is currently queued in
      for (const mid of Object.keys(cfg.mode_channels)) {
        if (db.isInQueue(guild.id, player.id, mid)) { gameMode = mid; break; }
      }
    }

    if (!gameMode) {
      return interaction.editReply('⚠️ Game mode determine nahi ho paya (na ticket mein set hai, na player kisi queue mein hai). Ticket ke andar `/result` use karo ya player ko queue mein daalo.');
    }

    // Save rank + points
    db.setRank(guild.id, player.id, gameMode, rank, points);
    db.addWeeklyPoints(guild.id, player.id, points);
    db.removeFromAllQueues(guild.id, player.id);

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
      closeTicket(interaction.channel.id);
    }

    const player_ = db.getPlayer(guild.id, player.id);
    const embed = new EmbedBuilder()
      .setTitle('✅ Result Submitted')
      .setColor(0x57f287)
      .addFields(
        { name: 'Player', value: `${player} (${player_?.ign ?? 'N/A'})`, inline: true },
        { name: 'Mode', value: gameMode, inline: true },
        { name: 'Rank', value: rank, inline: true },
        { name: 'Points', value: String(points), inline: true },
        { name: 'Region', value: region, inline: true },
      );

    await interaction.editReply({ embeds: [embed] });

    if (ticket) {
      await interaction.channel.send('🔒 Ye ticket ab close ho sakta hai. Admin isse delete/archive kar sakta hai.');
    }
  },
};
