# CTA Albion Sign-up Bot

A Discord bot for CTA roster signups. Members submit their Albion in-game name, preferred role, and at least three weapons they can play. Signups are appended to a Google Sheet; the bot creates the worksheet tab and headers for you.

## What you need

- A Discord application and bot token from the [Discord Developer Portal](https://discord.com/developers/applications).
- A Railway project with a PostgreSQL service.
- A Google service account with the Google Sheets API enabled.

## Railway deployment

1. Push this project to a GitHub repository and create a Railway project from that repository.
2. Add a **PostgreSQL** service to the Railway project. Railway provides `DATABASE_URL` to services connected to that database.
3. In the bot service's Variables, add:
   - `DISCORD_TOKEN`: bot token.
   - `DISCORD_CLIENT_ID`: Discord application ID.
   - `DATABASE_URL`: reference the PostgreSQL service's `DATABASE_URL` if Railway does not add it automatically.
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: the complete service-account JSON key as one JSON value.
   - `DISCORD_GUILD_ID` (recommended): your Discord server ID. This registers commands to that server so they appear quickly. Omit it to register global commands, which can take longer to appear.
4. In the Discord Developer Portal, enable the **Guild Install** installation context and add the `bot` and `applications.commands` scopes. Grant the bot permission to view channels, send messages, and embed links. Invite it to your server.
5. Deploy. Check Railway's deployment logs; a successful start reports that the bot is online.
6. In your CTA server, an administrator runs `/setup` and selects the signup channel.
7. An administrator runs `/sheet-setup`, pastes the Google Sheet URL, and enters a tab name (for example `Signups`).
8. Members use the panel's **Sign up** button or run `/signup`.

This is a background Discord bot, not a web server; it does not need a public domain or exposed port.

## Google Sheets setup

Create a Google Cloud service account, enable the Google Sheets API for its project, and create a JSON key. Add the entire key JSON to Railway as `GOOGLE_SERVICE_ACCOUNT_JSON`. Share the target spreadsheet with the service account's `client_email` as an editor. The `/sheet-setup` command checks access and creates the requested tab and its header row. Use a new or empty tab; existing data is not overwritten.

The sheet records the UTC signup time, Discord user ID and name, Albion in-game name, preferred role, and weapon list. New signups are appended as new rows.

## Local development

Use Node.js 22 or newer. Copy `.env.example` to `.env`, fill in the same values, and run:

```sh
npm install
npm test
npm start
```

The bot creates its PostgreSQL table automatically at startup. Never commit `.env` or the service-account key.
