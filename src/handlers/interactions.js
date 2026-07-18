const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
} = require('discord.js');
const { GAME_MODES, LAUNCHER_VERSIONS, BOOSTER_ROLE_NAME } = require('../config');
const db = require('../database');
const { refreshQueueDisplay } = require('../utils/queueDisplay');

function isServerBooster(member, cfg) {
  if (member.premiumSince) return true; // real Discord Nitro boost
  if (cfg?.booster_role_id && member.roles.cache.has(cfg.booster_role_id)) return true;
  if (member.roles.cache.some(r => r.name === BOOSTER_ROLE_NAME)) return true;
  return false;
}

// Holds { ign, region } between "submit modal" and "pick launcher button" steps.
// Cleared once registration finalizes, or after 5 minutes if abandoned.
const pendingRegistrations = new Map();

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
      if (interaction.customId.startsWith('select_launcher_')) return finalizeRegistration(interaction);
      if (interaction.customId.startsWith('leave_queue_')) return leaveQueue(interaction);
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'register_modal') return submitRegisterModal(interaction);
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'queue_mode_select') return joinQueueMode(interaction);
    }
  } catch (err) {
    console.error('Interaction error:', err);
    const payload = { content: '⚠️ Something went wrong. Please try again.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
}

// ==========================================
// REGISTRATION (Step 1: modal for text fields)
// ==========================================
async function openRegisterModal(interaction) {
  const modal = new ModalBuilder().setCustomId('register_modal').setTitle('Player Registration');

  const ignInput = new TextInputBuilder()
    .setCustomId('ign').setLabel('In-Game Name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32);

  const regionInput = new TextInputBuilder()
    .setCustomId('region').setLabel('Region (e.g. Asia, EU, NA)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32);

  modal.addComponents(
    new ActionRowBuilder().addComponents(ignInput),
    new ActionRowBuilder().addComponents(regionInput),
  );

  await interaction.showModal(modal);
}

// ==========================================
// REGISTRATION (Step 2: pick launcher via buttons)
// ==========================================
async function submitRegisterModal(interaction) {
  const ign = interaction.fields.getTextInputValue('ign').trim();
  const region = interaction.fields.getTextInputValue('region').trim();

  pendingRegistrations.set(interaction.user.id, { ign, region });
  setTimeout(() => pendingRegistrations.delete(interaction.user.id), 5 * 60 * 1000);

  const row = new ActionRowBuilder().addComponents(
    ...LAUNCHER_VERSIONS.map((v, i) =>
      new ButtonBuilder()
        .setCustomId(`select_launcher_${v}`)
        .setLabel(v)
        .setStyle(i === 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
    )
  );

  await interaction.reply({
    content: 'One last step — select your launcher type:',
    components: [row],
    ephemeral: true,
  });
}

async function finalizeRegistration(interaction) {
  const launcher = interaction.customId.replace('select_launcher_', '');
  const pending = pendingRegistrations.get(interaction.user.id);

  if (!pending) {
    return interaction.update({
      content: '⚠️ Your registration session expired. Please click **Register** again.',
      components: [],
    });
  }

  db.registerPlayer(interaction.guild.id, interaction.user.id, pending.ign, pending.region, launcher);
  pendingRegistrations.delete(interaction.user.id);

  const cfg = db.getGuildConfig(interaction.guild.id);
  if (cfg?.registered_role_id) {
    await interaction.member.roles.add(cfg.registered_role_id).catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setTitle('✅ Registered!')
    .setColor(0x57f287)
    .addFields(
      { name: 'In-Game Name', value: pending.ign, inline: true },
      { name: 'Region', value: pending.region, inline: true },
      { name: 'Launcher', value: launcher, inline: true },
    );

  await interaction.update({ content: null, embeds: [embed], components: [] });
}

// ==========================================
// QUEUE
// ==========================================
async function openQueueMenu(interaction) {
  if (!db.isRegistered(interaction.guild.id, interaction.user.id)) {
    return interaction.reply({ content: '❌ Please **Register** first before joining a queue.', ephemeral: true });
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId('queue_mode_select')
    .setPlaceholder('Select a game mode to queue for')
    .addOptions(GAME_MODES.map(m => ({ label: m.label, value: m.id })));

  const row = new ActionRowBuilder().addComponents(menu);
  await interaction.reply({ content: 'Which game mode would you like to queue for?', components: [row], ephemeral: true });
}

async function joinQueueMode(interaction) {
  if (!db.isRegistered(interaction.guild.id, interaction.user.id)) {
    return interaction.reply({ content: '❌ Please **Register** first.', ephemeral: true });
  }

  const mode = interaction.values[0];
  const guild = interaction.guild;
  const cfg = db.getGuildConfig(guild.id);
  if (!cfg) return interaction.update({ content: '⚠️ The bot has not been set up yet. Ask an admin to run `/setup`.', components: [] });

  if (db.isInQueue(guild.id, interaction.user.id, mode)) {
    return interaction.update({ content: `⚠️ You are already in the **${mode}** queue.`, components: [] });
  }

  const isBooster = isServerBooster(interaction.member, cfg);
  db.joinQueue(guild.id, interaction.user.id, mode, isBooster);

  // Assign mode-queue role
  const roleId = cfg.mode_roles[mode];
  if (roleId) await interaction.member.roles.add(roleId).catch(() => {});

  const modeLabel = GAME_MODES.find(m => m.id === mode)?.label ?? mode;

  // Refresh the live queue-list embed (boosters show at the top, marked ⭐)
  await refreshQueueDisplay(guild, cfg, mode);

  const boosterNote = isBooster ? ' (⭐ Booster priority — you were placed at the top!)' : '';
  await interaction.update({ content: `✅ You've been added to the **${modeLabel}** queue!${boosterNote}`, components: [] });

  // Check threshold (only counts players still waiting, not already in testing)
  const count = db.getQueueCount(guild.id, mode);
  const threshold = cfg.thresholds[mode] ?? 8;
  if (count >= threshold && cfg.lock_channel_id) {
    const lockCh = await guild.channels.fetch(cfg.lock_channel_id).catch(() => null);
    if (lockCh) {
      const players = db.getWaitingQueue(guild.id, mode).map(q => `<@${q.discord_id}>`).join(', ');
      await lockCh.send(`🚨 The **${modeLabel}** queue is full! (${count}/${threshold})\nPlayers: ${players}`);
    }
  }
}

async function leaveQueue(interaction) {
  const mode = interaction.customId.replace('leave_queue_', '');
  db.leaveQueue(interaction.guild.id, interaction.user.id, mode);
  const cfg = db.getGuildConfig(interaction.guild.id);
  if (cfg) await refreshQueueDisplay(interaction.guild, cfg, mode);
  await interaction.reply({ content: `You've been removed from the **${mode}** queue.`, ephemeral: true });
}

module.exports = { handleInteraction };
