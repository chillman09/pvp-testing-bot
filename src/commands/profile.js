const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GAME_MODES } = require('../config');
const db = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View a player\'s registration info and ranks in every mode')
    .addUserOption(opt => opt.setName('user').setDescription('Player to view (defaults to you)').setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const player = db.getPlayer(interaction.guild.id, target.id);

    if (!player) {
      return interaction.reply({ content: `❌ ${target} abhi registered nahi hai.`, ephemeral: true });
    }

    const ranks = db.getRanks(interaction.guild.id, target.id);
    const rankMap = Object.fromEntries(ranks.map(r => [r.game_mode, r]));

    const lines = GAME_MODES.map(mode => {
      const r = rankMap[mode.id];
      return r ? `**${mode.label}**: ${r.tier} (${r.points} pts)` : `**${mode.label}**: _Untested_`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`👤 ${player.ign}`)
      .setThumbnail(target.displayAvatarURL())
      .setColor(0x5865f2)
      .addFields(
        { name: 'Region', value: player.region, inline: true },
        { name: 'Launcher', value: player.launcher, inline: true },
        { name: 'Discord', value: `${target}`, inline: true },
        { name: 'Ranks', value: lines.join('\n') },
      );

    return interaction.reply({ embeds: [embed] });
  },
};
