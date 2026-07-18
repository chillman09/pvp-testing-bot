// ==========================================
// CENTRAL CONFIG — edit this file to change modes, tiers, thresholds
// ==========================================

module.exports = {
  // All game modes. "id" is used internally (db, role names), "label" is what shows in menus.
  GAME_MODES: [
    { id: 'nethpot', label: 'Nethpot' },
    { id: 'mace', label: 'Mace' },
    { id: 'spearmace', label: 'Spearmace' },
    { id: 'cart', label: 'Cart' },
    { id: 'rocketmace', label: 'Rocketmace' },
    { id: 'axe', label: 'Axe' },
    { id: 'tank', label: 'Tank' },
    { id: 'diapot', label: 'Diapot' },
    { id: 'lifesteal', label: 'Lifesteal' },
    { id: 'uhc', label: 'UHC' },
    { id: 'crystal', label: 'Crystal' },
  ],

  // Tier list per mode (High Tier / Low Tier, 1 = best, 5 = worst)
  TIERS: ['HT1', 'LT1', 'HT2', 'LT2', 'HT3', 'LT3', 'HT4', 'LT4', 'HT5', 'LT5'],

  // Launcher versions selectable at registration
  LAUNCHER_VERSIONS: ['Official', 'Crack'],

  // Default number of players in a mode's queue before the lock-channel ping fires.
  // Can be overridden per-mode later via /setup or editing guild_config in DB.
  DEFAULT_QUEUE_THRESHOLD: 8,

  // Names for auto-created roles/channels (used only during /setup)
  ROLE_NAMES: {
    registered: 'Registered',
    tester: 'Tester',
    admin: 'Admin',
    queuePrefix: 'Queue: ', // e.g. "Queue: Nethpot"
  },

  CHANNEL_NAMES: {
    category: 'PvP Testing',
    ticketCategory: 'Tickets',
    lockChannel: 'queue-alerts',
    interfacePanel: 'register-here',
    queuePrefix: 'queue-', // e.g. queue-nethpot
  },
};
