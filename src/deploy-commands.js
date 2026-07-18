require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  commands.push(command.data.toJSON());
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`⏳ Deploying ${commands.length} slash commands...`);

    if (process.env.GUILD_ID) {
      // Instant update — good for development/testing
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands },
      );
      console.log(`✅ Deployed to guild ${process.env.GUILD_ID} (instant).`);
    } else {
      // Global — takes up to 1 hour to propagate
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands },
      );
      console.log('✅ Deployed globally (may take up to 1 hour to show up).');
    }
  } catch (err) {
    console.error(err);
  }
})();
