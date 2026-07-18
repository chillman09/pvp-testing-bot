const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'bot.sqlite'));
db.pragma('journal_mode = WAL');

// ==========================================
// SCHEMA
// ==========================================
db.exec(`
CREATE TABLE IF NOT EXISTS players (
  discord_id   TEXT PRIMARY KEY,
  guild_id     TEXT NOT NULL,
  ign          TEXT NOT NULL,
  region       TEXT NOT NULL,
  launcher     TEXT NOT NULL,
  registered_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS queues (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  discord_id   TEXT NOT NULL,
  game_mode    TEXT NOT NULL,
  joined_at    INTEGER NOT NULL,
  UNIQUE(guild_id, discord_id, game_mode)
);

CREATE TABLE IF NOT EXISTS ranks (
  guild_id     TEXT NOT NULL,
  discord_id   TEXT NOT NULL,
  game_mode    TEXT NOT NULL,
  tier         TEXT,
  points       INTEGER DEFAULT 0,
  updated_at   INTEGER,
  PRIMARY KEY (guild_id, discord_id, game_mode)
);

CREATE TABLE IF NOT EXISTS weekly_points (
  guild_id     TEXT NOT NULL,
  discord_id   TEXT NOT NULL,
  points       INTEGER DEFAULT 0,
  week_start   TEXT NOT NULL,
  PRIMARY KEY (guild_id, discord_id, week_start)
);

CREATE TABLE IF NOT EXISTS tickets (
  channel_id   TEXT PRIMARY KEY,
  guild_id     TEXT NOT NULL,
  discord_id   TEXT NOT NULL,
  tester_id    TEXT NOT NULL,
  game_mode    TEXT,
  status       TEXT DEFAULT 'open',
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS guild_config (
  guild_id          TEXT PRIMARY KEY,
  category_id       TEXT,
  ticket_category_id TEXT,
  lock_channel_id   TEXT,
  interface_channel_id TEXT,
  interface_message_id TEXT,
  registered_role_id TEXT,
  tester_role_id    TEXT,
  admin_role_id     TEXT,
  mode_roles_json   TEXT,   -- { modeId: roleId }
  mode_channels_json TEXT,  -- { modeId: channelId }
  tier_roles_json   TEXT,   -- { "modeId:TIER": roleId }
  thresholds_json   TEXT    -- { modeId: number }
);
`);

// ==========================================
// PLAYERS
// ==========================================
function isRegistered(guildId, discordId) {
  return !!db.prepare('SELECT 1 FROM players WHERE guild_id=? AND discord_id=?').get(guildId, discordId);
}

function registerPlayer(guildId, discordId, ign, region, launcher) {
  db.prepare(`
    INSERT INTO players (discord_id, guild_id, ign, region, launcher, registered_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET ign=excluded.ign, region=excluded.region, launcher=excluded.launcher
  `).run(discordId, guildId, ign, region, launcher, Date.now());
}

function getPlayer(guildId, discordId) {
  return db.prepare('SELECT * FROM players WHERE guild_id=? AND discord_id=?').get(guildId, discordId);
}

// ==========================================
// QUEUES
// ==========================================
function joinQueue(guildId, discordId, gameMode) {
  db.prepare(`
    INSERT OR IGNORE INTO queues (guild_id, discord_id, game_mode, joined_at)
    VALUES (?, ?, ?, ?)
  `).run(guildId, discordId, gameMode, Date.now());
}

function leaveQueue(guildId, discordId, gameMode) {
  db.prepare('DELETE FROM queues WHERE guild_id=? AND discord_id=? AND game_mode=?').run(guildId, discordId, gameMode);
}

function removeFromAllQueues(guildId, discordId) {
  db.prepare('DELETE FROM queues WHERE guild_id=? AND discord_id=?').run(guildId, discordId);
}

function getQueue(guildId, gameMode) {
  return db.prepare('SELECT * FROM queues WHERE guild_id=? AND game_mode=? ORDER BY joined_at ASC').all(guildId, gameMode);
}

function getQueueCount(guildId, gameMode) {
  return db.prepare('SELECT COUNT(*) c FROM queues WHERE guild_id=? AND game_mode=?').get(guildId, gameMode).c;
}

function isInQueue(guildId, discordId, gameMode) {
  return !!db.prepare('SELECT 1 FROM queues WHERE guild_id=? AND discord_id=? AND game_mode=?').get(guildId, discordId, gameMode);
}

// ==========================================
// RANKS / RESULTS
// ==========================================
function setRank(guildId, discordId, gameMode, tier, points) {
  db.prepare(`
    INSERT INTO ranks (guild_id, discord_id, game_mode, tier, points, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, discord_id, game_mode) DO UPDATE SET tier=excluded.tier, points=excluded.points, updated_at=excluded.updated_at
  `).run(guildId, discordId, gameMode, tier, points, Date.now());
}

function getRanks(guildId, discordId) {
  return db.prepare('SELECT * FROM ranks WHERE guild_id=? AND discord_id=?').all(guildId, discordId);
}

function getRank(guildId, discordId, gameMode) {
  return db.prepare('SELECT * FROM ranks WHERE guild_id=? AND discord_id=? AND game_mode=?').get(guildId, discordId, gameMode);
}

// ==========================================
// WEEKLY POINTS / LEADERBOARD
// ==========================================
function getWeekStart() {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday as start
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

function addWeeklyPoints(guildId, discordId, points) {
  const week = getWeekStart();
  db.prepare(`
    INSERT INTO weekly_points (guild_id, discord_id, points, week_start)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, discord_id, week_start) DO UPDATE SET points = points + excluded.points
  `).run(guildId, discordId, points, week);
}

function getLeaderboard(guildId, limit = 10) {
  const week = getWeekStart();
  return db.prepare(`
    SELECT * FROM weekly_points WHERE guild_id=? AND week_start=? ORDER BY points DESC LIMIT ?
  `).all(guildId, week, limit);
}

// ==========================================
// TICKETS
// ==========================================
function createTicket(channelId, guildId, discordId, testerId, gameMode) {
  db.prepare(`
    INSERT INTO tickets (channel_id, guild_id, discord_id, tester_id, game_mode, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'open', ?)
  `).run(channelId, guildId, discordId, testerId, gameMode, Date.now());
}

function closeTicket(channelId) {
  db.prepare("UPDATE tickets SET status='closed' WHERE channel_id=?").run(channelId);
}

function getTicket(channelId) {
  return db.prepare('SELECT * FROM tickets WHERE channel_id=?').get(channelId);
}

function getOpenTicketForPlayer(guildId, discordId) {
  return db.prepare("SELECT * FROM tickets WHERE guild_id=? AND discord_id=? AND status='open'").get(guildId, discordId);
}

// ==========================================
// GUILD CONFIG
// ==========================================
function getGuildConfig(guildId) {
  const row = db.prepare('SELECT * FROM guild_config WHERE guild_id=?').get(guildId);
  if (!row) return null;
  return {
    ...row,
    mode_roles: JSON.parse(row.mode_roles_json || '{}'),
    mode_channels: JSON.parse(row.mode_channels_json || '{}'),
    tier_roles: JSON.parse(row.tier_roles_json || '{}'),
    thresholds: JSON.parse(row.thresholds_json || '{}'),
  };
}

function saveGuildConfig(guildId, data) {
  const existing = db.prepare('SELECT * FROM guild_config WHERE guild_id=?').get(guildId);
  const merged = {
    category_id: data.category_id ?? existing?.category_id ?? null,
    ticket_category_id: data.ticket_category_id ?? existing?.ticket_category_id ?? null,
    lock_channel_id: data.lock_channel_id ?? existing?.lock_channel_id ?? null,
    interface_channel_id: data.interface_channel_id ?? existing?.interface_channel_id ?? null,
    interface_message_id: data.interface_message_id ?? existing?.interface_message_id ?? null,
    registered_role_id: data.registered_role_id ?? existing?.registered_role_id ?? null,
    tester_role_id: data.tester_role_id ?? existing?.tester_role_id ?? null,
    admin_role_id: data.admin_role_id ?? existing?.admin_role_id ?? null,
    mode_roles_json: JSON.stringify(data.mode_roles ?? (existing ? JSON.parse(existing.mode_roles_json || '{}') : {})),
    mode_channels_json: JSON.stringify(data.mode_channels ?? (existing ? JSON.parse(existing.mode_channels_json || '{}') : {})),
    tier_roles_json: JSON.stringify(data.tier_roles ?? (existing ? JSON.parse(existing.tier_roles_json || '{}') : {})),
    thresholds_json: JSON.stringify(data.thresholds ?? (existing ? JSON.parse(existing.thresholds_json || '{}') : {})),
  };

  db.prepare(`
    INSERT INTO guild_config (guild_id, category_id, ticket_category_id, lock_channel_id, interface_channel_id, interface_message_id, registered_role_id, tester_role_id, admin_role_id, mode_roles_json, mode_channels_json, tier_roles_json, thresholds_json)
    VALUES (@guild_id, @category_id, @ticket_category_id, @lock_channel_id, @interface_channel_id, @interface_message_id, @registered_role_id, @tester_role_id, @admin_role_id, @mode_roles_json, @mode_channels_json, @tier_roles_json, @thresholds_json)
    ON CONFLICT(guild_id) DO UPDATE SET
      category_id=excluded.category_id,
      ticket_category_id=excluded.ticket_category_id,
      lock_channel_id=excluded.lock_channel_id,
      interface_channel_id=excluded.interface_channel_id,
      interface_message_id=excluded.interface_message_id,
      registered_role_id=excluded.registered_role_id,
      tester_role_id=excluded.tester_role_id,
      admin_role_id=excluded.admin_role_id,
      mode_roles_json=excluded.mode_roles_json,
      mode_channels_json=excluded.mode_channels_json,
      tier_roles_json=excluded.tier_roles_json,
      thresholds_json=excluded.thresholds_json
  `).run({ guild_id: guildId, ...merged });
}

module.exports = {
  db,
  isRegistered, registerPlayer, getPlayer,
  joinQueue, leaveQueue, removeFromAllQueues, getQueue, getQueueCount, isInQueue,
  setRank, getRanks, getRank,
  addWeeklyPoints, getLeaderboard, getWeekStart,
  createTicket, closeTicket, getTicket, getOpenTicketForPlayer,
  getGuildConfig, saveGuildConfig,
};
