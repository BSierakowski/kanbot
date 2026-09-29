# Kanbot 

Kanbot can :).

Kanbot keeps a shared todo list for each Discord or Slack channel, where every item has a kanban status: todo, doing, or done.

## Commands

Discord and Slack share the same `/kanbot` slash command:
- /kanbot list [status]
- /kanbot add [status] [item]
- /kanbot bulkadd [item], [item]
- /kanbot remove [status] [position]
- /kanbot move [current_status] [position] [new_status]
- /kanbot help

Example:
- /kanbot list
- /kanbot list todo
- /kanbot add doing Build a Kanban Board
- /kanbot bulkadd Write docs, Ship Slack support
- /kanbot remove doing 1
- /kanbot move doing 1 done

In Discord, the options show up as fields once you pick a subcommand, for example `/kanbot move current_status:doing position:1 new_status:done`.

## How it works

Kanbot runs on Vercel:
- `public/` is the marketing page.
- `api/discord.ts` receives Discord slash commands at `/api/discord`.
- `api/slack.ts` receives the Slack slash command at `/api/slack`.
- `lib/board.ts` holds the board logic both platforms share, and `lib/discord.ts` and `lib/slack.ts` format the board for each platform. Items are stored in Postgres (Neon).

Lists are stored per channel, scoped by Discord server or Slack workspace.

## Development

1) `npm install`
2) Copy `.env.example` to `.env` and point `DATABASE_URL` at a local Postgres database
3) `npm run migrate`
4) `npx vercel dev` to serve the page and functions locally

`npm run typecheck` checks the TypeScript.

## Deployment

1) Import the GitHub repo into Vercel. No framework preset is needed. The first build fails until the database below is connected.
2) In the Vercel project's Storage tab, add a Neon Postgres database. Pick the AWS US East (N. Virginia) region so it sits next to Vercel's default function region. This sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
3) Add `DISCORD_PUBLIC_KEY` and `SLACK_SIGNING_SECRET` to the project's environment variables.
4) Deploy. Every build runs `npm run migrate`, so the database schema is ready before the new version goes live.

### Moving an existing Kanbot database

`npm run migrate` also upgrades tables from older versions of Kanbot, including the Discord-only table from before Slack support, so existing items stay on their channel's board.

If the old app already used Neon, you can skip the copy below and set `DATABASE_URL` in Vercel to that database instead of adding a new one.

Otherwise, copy the items from the old Heroku or Railway database into the new one before pointing Discord and Slack at Vercel. Stop the old worker and web processes first so nothing writes to the old database during the copy. Set `OLD_DATABASE_URL` to the old database (on Railway, use the Postgres service's `DATABASE_PUBLIC_URL`) and `DATABASE_URL` to the new one (Neon's unpooled connection string), then run:

```sh
npm run migrate
pg_dump --data-only --table=items "$OLD_DATABASE_URL" | psql "$DATABASE_URL"
npm run migrate
```

The first `npm run migrate` creates the table in the empty database, and the second fills in the channel columns for older Discord items.

### Discord Setup

Register the slash command, and run it again whenever the command definition in `lib/discord.ts` changes:

```sh
DISCORD_BOT_TOKEN=your-bot-token npm run discord:register
```

It also prints the app's public key, which is the value for `DISCORD_PUBLIC_KEY`.

Then, in the Discord Developer Portal, set the Kanbot application's Interactions Endpoint URL to:

```text
https://YOUR_VERCEL_DOMAIN/api/discord
```

Discord sends a test request when you save, so deploy with `DISCORD_PUBLIC_KEY` set first.

Install link: https://discord.com/oauth2/authorize?client_id=1182786391638298674&scope=applications.commands

### Slack Setup

Create a Slack app with a slash command named `/kanbot` and set its request URL to:

```text
https://YOUR_VERCEL_DOMAIN/api/slack
```

Add the Slack app's signing secret as `SLACK_SIGNING_SECRET`. Slack requests are verified with that secret before any command runs.

## Changelog

The "What's new" panel on the marketing page shows Kanbot's updates from [Changebot](https://www.changebot.ai).

`.cursor/mcp.json` connects Cursor to Changebot's MCP server, so the agent can draft and publish those updates. Everyone approves the server once and signs in with their own Changebot account. In the editor, enable Changebot in Cursor's MCP settings and log in when it asks. With the Cursor CLI, run:

```sh
agent mcp enable changebot
agent mcp login changebot
```

To publish from Cursor Cloud Agents, also add `https://app.changebot.ai/mcp` from the MCP menu at https://cursor.com/agents (or under Dashboard > Plugins & MCPs to share it with the team) and sign in there.

## Contributing

Bug reports and pull requests are welcome on GitHub at https://github.com/BSierakowski/kanbot. I'd be thrilled to add
more features! 

Hope you enjoy using Kanbot!!
