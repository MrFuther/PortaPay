/**
 * Simple JSON-based persistent storage for per-guild bot settings.
 * Stores config like operationalChannelId and dashboardMessageId per Discord server.
 */
const fs = require('fs')
const path = require('path')

const SETTINGS_FILE = path.join(__dirname, 'guild_settings.json')

function loadSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) return {}
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8')
}

function getGuildSettings(guildId) {
  const settings = loadSettings()
  return settings[guildId] || {}
}

function setGuildSettings(guildId, data) {
  const settings = loadSettings()
  settings[guildId] = { ...settings[guildId], ...data }
  saveSettings(settings)
}

module.exports = { getGuildSettings, setGuildSettings }
