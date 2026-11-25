# CTA Albion Sign-up Bot

A Discord bot for CTA roster signups. Members submit their Albion in-game name, preferred role, and at least three weapons they can play. Signups are appended to a Google Sheet.

Each Discord server connects its own spreadsheet with `/sheet-setup`. The server owner or a member with a role named `Officer` authorizes a Google account in the browser; Google tokens are encrypted before they are stored in PostgreSQL. When the bot joins a server, it posts setup instructions in the system channel or another text channel where it can send messages. Its Discord presence is set to online while connected.

## What you need

- A Discord application and bot token from the [Discord Developer Portal](https://discord.com/developers/applications).
- A Railway project with a PostgreSQL service.
- A Google Cloud project with the Google Sheets API enabled and a Web application OAuth client.

## Google OAuth setup

1. In Google Cloud Console, enable the Google Sheets API and configure the OAuth consent screen. If the app is in testing mode, add the Google accounts that will connect sheets as test users. Google may expire refresh tokens for apps left in testing mode, requiring the server to reconnect.
2. Create an OAuth client ID with application type **Web application**.
3. Deploy the bot and generate a public domain for its Railway service. Set the OAuth redirect URI to `https://YOUR-DOMAIN/google/oauth/callback` in the OAuth client configuration. The redirect URI must exactly match `GOOGLE_OAUTH_REDIRECT_URI`.
4. Add the OAuth client ID and secret to the bot service variables as `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.

The OAuth app credentials are configured once by the deployer. Server owners and Officers then authorize their own Google accounts from `/sheet-setup`; they do not need to edit host variables for each sheet.
`GOOGLE_SERVICE_ACCOUNT_JSON` is not used by this OAuth flow.

## Railway deployment

1. Push this project to a GitHub repository and create a Railway project from that repository. Railway uses the included `Dockerfile` to build with Node.js 22.
2. Add a **PostgreSQL** service to the project.
3. In the bot service's Variables, add:
   - `DISCORD_TOKEN`: bot token.
   - `DISCORD_CLIENT_ID`: Discord application ID.
   - `DATABASE_URL`: reference the PostgreSQL service's `DATABASE_URL`.
   - `GOOGLE_OAUTH_CLIENT_ID`: Google OAuth Web application client ID.
   - `GOOGLE_OAUTH_CLIENT_SECRET`: Google OAuth Web application client secret.
   - `GOOGLE_OAUTH_REDIRECT_URI`: `https://YOUR-DOMAIN/google/oauth/callback`, matching the URI configured in Google Cloud.
   - `GOOGLE_TOKEN_ENCRYPTION_KEY`: base64-encoded random 32-byte key. Generate one locally with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Keep this value stable; changing it prevents the bot from decrypting saved Google authorizations.
   - `DISCORD_GUILD_ID` (recommended): your Discord server ID. This registers commands to that server so they appear quickly. Omit it to register global commands, which can take longer to appear.
4. In Railway, generate a public domain for the bot service so Google can reach the OAuth callback. The bot listens on Railway's `PORT`.
5. In the Discord Developer Portal, enable the **Guild Install** installation context and add the `bot` and `applications.commands` scopes. Grant the bot permission to view channels, send messages, and embed links. Invite it to each server.
6. Deploy. The logs should report that the bot is online and the OAuth callback is listening.
7. In each server, an administrator runs `/setup` and selects the signup channel.
8. The server owner or a member with a role named `Officer` (case-insensitive) runs `/sheet-setup`, enters that server's Google Sheet URL and tab name, then opens the private link and authorizes a Google account that can edit the spreadsheet.
9. Members sign up with the panel's **Sign up** button or `/signup`.

The bot creates its PostgreSQL tables automatically. PostgreSQL stores each server's settings and encrypted Google refresh token; signup rows are written to the connected Google Sheet. Never share OAuth secrets or the encryption key.

## Local development

Use Node.js 22 or newer. Copy `.env.example` to `.env`, fill in the required values, and run:

```sh
npm install
npm test
npm start
```

For local OAuth, register `http://localhost:3000/google/oauth/callback` as an authorized redirect URI and use that value for `GOOGLE_OAUTH_REDIRECT_URI`.
