const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { isTesterOrAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('[Tester] Show the top 10 players this week by points'),

  async execute(interaction) {
    if (!isTesterOrAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ Ye command sirf Tester/Admin use kar sakte hain.', ephemeral: true });
    }

    const rows = db.getLeaderboard(interaction.guild.id, 10);
    if (!rows.length) {
      return interaction.reply({ content: 'Is hafte abhi tak koi points nahi hain.', ephemeral: true });
    }

    const lines = await Promise.all(rows.map(async (r, i) => {
      const player = db.getPlayer(interaction.guild.id, r.discord_id);
      const name = player?.ign ?? `<@${r.discord_id}>`;
      const medal = ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
      return `${medal} **${name}** — ${r.points} pts`;
    }));

    const embed = new EmbedBuilder()
      .setTitle(`🏆 Weekly Leaderboard (week of ${db.getWeekStart()})`)
      .setDescription(lines.join('\n'))
      .setColor(0xfee75c);

    return interaction.reply({ embeds: [embed] });
  },
};
