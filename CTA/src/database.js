const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      signup_channel_id TEXT,
      spreadsheet_id TEXT,
      sheet_tab TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getGuildSettings(guildId) {
  const result = await pool.query(
    'SELECT signup_channel_id, spreadsheet_id, sheet_tab FROM guild_settings WHERE guild_id = $1',
    [guildId]
  );
  return result.rows[0] || null;
}

async function saveGuildSettings(guildId, updates) {
  const result = await pool.query(
    `INSERT INTO guild_settings (guild_id, signup_channel_id, spreadsheet_id, sheet_tab)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (guild_id) DO UPDATE SET
       signup_channel_id = COALESCE($2, guild_settings.signup_channel_id),
       spreadsheet_id = COALESCE($3, guild_settings.spreadsheet_id),
       sheet_tab = COALESCE($4, guild_settings.sheet_tab),
       updated_at = NOW()
     RETURNING signup_channel_id, spreadsheet_id, sheet_tab`,
    [
      guildId,
      updates.signupChannelId || null,
      updates.spreadsheetId || null,
      updates.sheetTab || null
    ]
  );
  return result.rows[0];
}

async function closeDatabase() {
  await pool.end();
}

module.exports = { closeDatabase, getGuildSettings, initializeDatabase, saveGuildSettings };
