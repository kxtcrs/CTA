const http = require('node:http');
const {
  consumePendingGoogleAuth,
  saveGuildSheetConfig
} = require('./database');
const { createGoogleOAuthClient, hashAuthorizationState } = require('./googleAuth');
const { encryptToken } = require('./tokenEncryption');
const { prepareSheet } = require('./sheets');

function respond(response, statusCode, message) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/html; charset=utf-8',
    'Referrer-Policy': 'no-referrer'
  });
  response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>CTA sign-up bot</title><body><p>${message}</p></body></html>`);
}

async function handleCallback(requestUrl, response) {
  const state = requestUrl.searchParams.get('state');
  if (!state) {
    respond(response, 400, 'This authorization link is invalid. Run /sheet-setup again in Discord.');
    return;
  }

  const authRequest = await consumePendingGoogleAuth(hashAuthorizationState(state));
  if (!authRequest) {
    respond(response, 400, 'This authorization link has expired or was already used. Run /sheet-setup again in Discord.');
    return;
  }

  if (requestUrl.searchParams.get('error')) {
    respond(response, 400, 'Google authorization was canceled. Run /sheet-setup again if you want to connect a sheet.');
    return;
  }

  const code = requestUrl.searchParams.get('code');
  if (!code) {
    respond(response, 400, 'Google did not return an authorization code. Run /sheet-setup again.');
    return;
  }

  try {
    const oauthClient = createGoogleOAuthClient();
    const { tokens } = await oauthClient.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error('Google did not provide a refresh token. Revoke the app access in your Google account and run /sheet-setup again.');
    }

    oauthClient.setCredentials(tokens);
    await prepareSheet(oauthClient, authRequest.spreadsheet_id, authRequest.sheet_tab);
    await saveGuildSheetConfig(
      authRequest.guild_id,
      authRequest.spreadsheet_id,
      authRequest.sheet_tab,
      encryptToken(tokens.refresh_token)
    );
    respond(response, 200, 'Google Sheets is connected. You can close this page and return to Discord.');
  } catch (error) {
    console.error('Google OAuth callback failed:', error.message);
    respond(response, 400, 'Could not connect that sheet. Check that the signed-in Google account can edit it, then run /sheet-setup again.');
  }
}

function startOAuthServer() {
  const callbackPath = new URL(process.env.GOOGLE_OAUTH_REDIRECT_URI).pathname;
  const port = Number(process.env.PORT) || 3000;
  const server = http.createServer((request, response) => {
    let requestUrl;
    try {
      requestUrl = new URL(request.url, 'http://localhost');
    } catch {
      respond(response, 400, 'Invalid request.');
      return;
    }

    if (request.method !== 'GET' || requestUrl.pathname !== callbackPath) {
      respond(response, 404, 'Not found.');
      return;
    }

    handleCallback(requestUrl, response).catch((error) => {
      console.error('Google OAuth callback failed:', error.message);
      if (!response.headersSent) {
        respond(response, 500, 'Google authorization failed. Please return to Discord and try /sheet-setup again.');
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      console.log(`Google OAuth callback listening on port ${port}.`);
      resolve(server);
    });
  });
}

module.exports = { startOAuthServer };
