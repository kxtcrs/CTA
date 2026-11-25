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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guild_google_tokens (
      guild_id TEXT PRIMARY KEY,
      encrypted_refresh_token TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pending_google_auths (
      state_hash TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      spreadsheet_id TEXT NOT NULL,
      sheet_tab TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guild_welcome_messages (
      guild_id TEXT PRIMARY KEY,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getGuildSettings(guildId) {
  const result = await pool.query(
    'SELECT guild_id, signup_channel_id, spreadsheet_id, sheet_tab FROM guild_settings WHERE guild_id = $1',
    [guildId]
  );
  return result.rows[0] || null;
}

async function hasGuildWelcomeMessage(guildId) {
  const result = await pool.query(
    'SELECT 1 FROM guild_welcome_messages WHERE guild_id = $1',
    [guildId]
  );
  return result.rowCount > 0;
}

async function markGuildWelcomeMessageSent(guildId) {
  await pool.query(
    'INSERT INTO guild_welcome_messages (guild_id) VALUES ($1) ON CONFLICT (guild_id) DO NOTHING',
    [guildId]
  );
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

async function createPendingGoogleAuth(authRequest) {
  await pool.query('DELETE FROM pending_google_auths WHERE expires_at <= NOW()');
  await pool.query(
    `INSERT INTO pending_google_auths
      (state_hash, guild_id, spreadsheet_id, sheet_tab, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
    [
      authRequest.stateHash,
      authRequest.guildId,
      authRequest.spreadsheetId,
      authRequest.sheetTab
    ]
  );
}

async function consumePendingGoogleAuth(stateHash) {
  const result = await pool.query(
    `DELETE FROM pending_google_auths
     WHERE state_hash = $1 AND expires_at > NOW()
     RETURNING guild_id, spreadsheet_id, sheet_tab`,
    [stateHash]
  );
  return result.rows[0] || null;
}

async function getGuildGoogleToken(guildId) {
  const result = await pool.query(
    'SELECT encrypted_refresh_token FROM guild_google_tokens WHERE guild_id = $1',
    [guildId]
  );
  return result.rows[0] ? result.rows[0].encrypted_refresh_token : null;
}

async function saveGuildSheetConfig(guildId, spreadsheetId, sheetTab, encryptedRefreshToken) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO guild_google_tokens (guild_id, encrypted_refresh_token)
       VALUES ($1, $2)
       ON CONFLICT (guild_id) DO UPDATE SET
         encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
         updated_at = NOW()`,
      [guildId, encryptedRefreshToken]
    );
    await client.query(
      `INSERT INTO guild_settings (guild_id, spreadsheet_id, sheet_tab)
       VALUES ($1, $2, $3)
       ON CONFLICT (guild_id) DO UPDATE SET
         spreadsheet_id = EXCLUDED.spreadsheet_id,
         sheet_tab = EXCLUDED.sheet_tab,
         updated_at = NOW()`,
      [guildId, spreadsheetId, sheetTab]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function closeDatabase() {
  await pool.end();
}

module.exports = {
  closeDatabase,
  consumePendingGoogleAuth,
  createPendingGoogleAuth,
  getGuildGoogleToken,
  getGuildSettings,
  hasGuildWelcomeMessage,
  initializeDatabase,
  markGuildWelcomeMessageSent,
  saveGuildSheetConfig,
  saveGuildSettings
};
