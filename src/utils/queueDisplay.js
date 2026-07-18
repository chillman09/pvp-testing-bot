const { EmbedBuilder } = require('discord.js');
const { GAME_MODES } = require('../config');
const db = require('../database');

/**
 * Builds and posts/edits the live queue-list embed for a given mode's channel.
 * Shows waiting players (boosters first, marked ⭐) and anyone currently being tested
 * along with the tester's name. Call this after any queue join/leave/testing/result change.
 */
async function refreshQueueDisplay(guild, cfg, mode) {
  const channelId = cfg.mode_channels[mode];
  if (!channelId) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const modeLabel = GAME_MODES.find(m => m.id === mode)?.label ?? mode;
  const waiting = db.getWaitingQueue(guild.id, mode);
  const testing = db.getTestingQueue(guild.id, mode);

  const waitingLines = waiting.length
    ? waiting.map((q, i) => {
        const player = db.getPlayer(guild.id, q.discord_id);
        const name = player?.ign ?? `<@${q.discord_id}>`;
        return `${i + 1}. ${q.is_booster ? '⭐ ' : ''}${name}`;
      }).join('\n')
    : '_No one waiting._';

  const testingLines = testing.length
    ? testing.map(q => {
        const player = db.getPlayer(guild.id, q.discord_id);
        const name = player?.ign ?? `<@${q.discord_id}>`;
        return `🎫 ${name} — being tested by <@${q.tester_id}>`;
      }).join('\n')
    : '_No one currently being tested._';

  const threshold = cfg.thresholds?.[mode] ?? 8;

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ ${modeLabel} Queue`)
    .setColor(0x5865f2)
    .addFields(
      { name: `⏳ Waiting (${waiting.length}/${threshold})`, value: waitingLines },
      { name: '🎫 Currently Testing', value: testingLines },
    )
    .setTimestamp();

  const existingMessageId = cfg.queue_messages?.[mode];
  let message = null;
  if (existingMessageId) {
    message = await channel.messages.fetch(existingMessageId).catch(() => null);
  }

  if (message) {
    await message.edit({ embeds: [embed] }).catch(() => {});
  } else {
    const sent = await channel.send({ embeds: [embed] }).catch(() => null);
    if (sent) {
      const queueMessages = { ...(cfg.queue_messages || {}), [mode]: sent.id };
      db.saveGuildConfig(guild.id, { queue_messages: queueMessages });
      cfg.queue_messages = queueMessages; // keep in-memory cfg fresh for this call chain
    }
  }
}

module.exports = { refreshQueueDisplay };
