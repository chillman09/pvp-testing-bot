const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  StringSelectMenuBuilder, EmbedBuilder,
} = require('discord.js');
const { GAME_MODES, LAUNCHER_VERSIONS } = require('../config');
const db = require('../database');

async function handleInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.client.commands.get(interaction.commandName);
      if (!cmd) return;
      return cmd.execute(interaction);
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'open_register_modal') return openRegisterModal(interaction);
      if (interaction.customId === 'open_queue_menu') return openQueueMenu(interaction);
      if (interaction.customId.startsWith('leave_queue_')) return leaveQueue(interaction);
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'register_modal') return submitRegisterModal(interaction);
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'queue_mode_select') return joinQueueMode(interaction);
      if (interaction.customId === 'register_launcher_select') return; // handled via modal instead, unused
    }
  } catch (err) {
    console.error('Interaction error:', err);
    const payload = { content: '⚠️ Kuch error aa gaya. Dobara try karo.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
}

// ==========================================
// REGISTRATION
// ==========================================
async function openRegisterModal(interaction) {
  const modal = new ModalBuilder().setCustomId('register_modal').setTitle('Player Registration');

  const ignInput = new TextInputBuilder()
    .setCustomId('ign').setLabel('In-Game Name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32);

  const regionInput = new TextInputBuilder()
    .setCustomId('region').setLabel('Region (e.g. Asia, EU, NA)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32);

  const launcherInput = new TextInputBuilder()
    .setCustomId('launcher').setLabel(`Launcher: type ${LAUNCHER_VERSIONS.join(' or ')}`)
    .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(16);

  modal.addComponents(
    new ActionRowBuilder().addComponents(ignInput),
    new ActionRowBuilder().addComponents(regionInput),
    new ActionRowBuilder().addComponents(launcherInput),
  );

  await interaction.showModal(modal);
}

async function submitRegisterModal(interaction) {
  const ign = interaction.fields.getTextInputValue('ign').trim();
  const region = interaction.fields.getTextInputValue('region').trim();
  let launcher = interaction.fields.getTextInputValue('launcher').trim();

  const match = LAUNCHER_VERSIONS.find(v => v.toLowerCase() === launcher.toLowerCase());
  if (!match) {
    return interaction.reply({
      content: `❌ Launcher Version sirf **${LAUNCHER_VERSIONS.join('** ya **')}** ho sakta hai. Dobara register karo.`,
      ephemeral: true,
    });
  }
  launcher = match;

  db.registerPlayer(interaction.guild.id, interaction.user.id, ign, region, launcher);

  // Assign the "Registered" role
  const cfg = db.getGuildConfig(interaction.guild.id);
  if (cfg?.registered_role_id) {
    await interaction.member.roles.add(cfg.registered_role_id).catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setTitle('✅ Registered!')
    .setColor(0x57f287)
    .addFields(
      { name: 'In-Game Name', value: ign, inline: true },
      { name: 'Region', value: region, inline: true },
      { name: 'Launcher', value: launcher, inline: true },
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ==========================================
// QUEUE
// ==========================================
async function openQueueMenu(interaction) {
  if (!db.isRegistered(interaction.guild.id, interaction.user.id)) {
    return interaction.reply({ content: '❌ Pehle **Register** karo, uske baad Queue join kar sakte ho.', ephemeral: true });
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId('queue_mode_select')
    .setPlaceholder('Select a game mode to queue for')
    .addOptions(GAME_MODES.map(m => ({ label: m.label, value: m.id })));

  const row = new ActionRowBuilder().addComponents(menu);
  await interaction.reply({ content: 'Kis mode ke liye queue join karna hai?', components: [row], ephemeral: true });
}

async function joinQueueMode(interaction) {
  if (!db.isRegistered(interaction.guild.id, interaction.user.id)) {
    return interaction.reply({ content: '❌ Pehle **Register** karo.', ephemeral: true });
  }

  const mode = interaction.values[0];
  const guild = interaction.guild;
  const cfg = db.getGuildConfig(guild.id);
  if (!cfg) return interaction.update({ content: '⚠️ Bot setup nahi hua hai. Admin se `/setup` chalwao.', components: [] });

  if (db.isInQueue(guild.id, interaction.user.id, mode)) {
    return interaction.update({ content: `⚠️ Tum already **${mode}** queue mein ho.`, components: [] });
  }

  db.joinQueue(guild.id, interaction.user.id, mode);

  // Assign mode-queue role
  const roleId = cfg.mode_roles[mode];
  if (roleId) await interaction.member.roles.add(roleId).catch(() => {});

  const modeLabel = GAME_MODES.find(m => m.id === mode)?.label ?? mode;

  // Post/update queue list in that mode's channel
  const queueChannelId = cfg.mode_channels[mode];
  if (queueChannelId) {
    const ch = await guild.channels.fetch(queueChannelId).catch(() => null);
    if (ch) {
      const player = db.getPlayer(guild.id, interaction.user.id);
      await ch.send(`➕ **${player?.ign ?? interaction.user.username}** joined the **${modeLabel}** queue.`);
    }
  }

  await interaction.update({ content: `✅ Tum **${modeLabel}** queue mein add ho gaye ho!`, components: [] });

  // Check threshold
  const count = db.getQueueCount(guild.id, mode);
  const threshold = cfg.thresholds[mode] ?? 8;
  if (count >= threshold && cfg.lock_channel_id) {
    const lockCh = await guild.channels.fetch(cfg.lock_channel_id).catch(() => null);
    if (lockCh) {
      const players = db.getQueue(guild.id, mode).map(q => `<@${q.discord_id}>`).join(', ');
      await lockCh.send(`🚨 **${modeLabel}** queue full hai! (${count}/${threshold})\nPlayers: ${players}`);
    }
  }
}

async function leaveQueue(interaction) {
  const mode = interaction.customId.replace('leave_queue_', '');
  db.leaveQueue(interaction.guild.id, interaction.user.id, mode);
  await interaction.reply({ content: `Tumhe **${mode}** queue se hata diya gaya.`, ephemeral: true });
}

module.exports = { handleInteraction };
