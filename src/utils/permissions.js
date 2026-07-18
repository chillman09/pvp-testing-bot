const { getGuildConfig } = require('../database');
const { PermissionFlagsBits } = require('discord.js');

/** True if member is Administrator, or has the configured Tester/Admin role */
function isTesterOrAdmin(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  const cfg = getGuildConfig(member.guild.id);
  if (!cfg) return false;

  if (cfg.tester_role_id && member.roles.cache.has(cfg.tester_role_id)) return true;
  if (cfg.admin_role_id && member.roles.cache.has(cfg.admin_role_id)) return true;
  return false;
}

function isAdmin(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const cfg = getGuildConfig(member.guild.id);
  if (cfg?.admin_role_id && member.roles.cache.has(cfg.admin_role_id)) return true;
  return false;
}

module.exports = { isTesterOrAdmin, isAdmin };
