const crypto = require('node:crypto');
const { google } = require('googleapis');
const { getGuildGoogleToken } = require('./database');
const { decryptToken } = require('./tokenEncryption');

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

function createGoogleOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

function createAuthorizationState() {
  return crypto.randomBytes(32).toString('hex');
}

function hashAuthorizationState(state) {
  return crypto.createHash('sha256').update(state).digest('hex');
}

function createGoogleAuthorizationUrl(state) {
  return createGoogleOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [SHEETS_SCOPE],
    state
  });
}

async function getGoogleOAuthClientForGuild(guildId) {
  const encryptedRefreshToken = await getGuildGoogleToken(guildId);
  if (!encryptedRefreshToken) {
    throw new Error('This server has not connected a Google account. Ask an Officer or the server owner to run `/sheet-setup`.');
  }

  const oauthClient = createGoogleOAuthClient();
  oauthClient.setCredentials({ refresh_token: decryptToken(encryptedRefreshToken) });
  return oauthClient;
}

module.exports = {
  createAuthorizationState,
  createGoogleAuthorizationUrl,
  createGoogleOAuthClient,
  getGoogleOAuthClientForGuild,
  hashAuthorizationState
};
