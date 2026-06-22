# Kanbot 

Kanbot can :).

## Commands

Discord commands:
- !list [status]
- !add [status] [item]
- !bulkadd [item], [item]
- !remove [status] [position]
- !move [current_status] [position] [new_status]

Example:
- !list
- !list todo
- !add doing Build a Kanban Board
- !bulkadd Write docs, Ship Slack support
- !remove doing 1
- !move doing 1 done

Slack slash command:
- /kanbot list [status]
- /kanbot add [status] [item]
- /kanbot bulkadd [item], [item]
- /kanbot remove [status] [position]
- /kanbot move [current_status] [position] [new_status]

## Development

Running the bot locally should be a function of: 
1) bundling the required gems
2) creating a database
3) running `bundle exec ruby bin/migrate`
4) and `bundle exec ruby kanbot.rb`

I say should because my workflow has been to deploy to heroku and test there.

The web process serves the marketing page and Slack slash command endpoint:

```sh
bundle exec ruby ./webapp/kanbot_web.rb -p 4567
```

## Slack Setup

Create a Slack app with a slash command named `/kanbot`.

Set the slash command request URL to:

```text
https://YOUR_APP_HOST/slack/commands
```

Add the Slack app's signing secret as `SLACK_SIGNING_SECRET`. Slack requests are verified with that secret before any command runs.

The Slack command stores lists per Slack channel, scoped by Slack workspace and channel ID.

## Deployment

### Heroku

The bot is running on Heroku. Because we need the bot to listen over a long period of time, our Procfile specifies one 
worker as the bot, running `bundle exec ruby kanbot.rb`. 

To get this in running you need to:

1) Create a heroku app
2) Add the heroku remote to your git repo
3) Add the heroku postgres addon
4) Add the `TOKEN` env var.

### Railway

Create a Railway project with:

- A Postgres database service
- A web service running this repo's `web` process
- A worker service running this repo's `worker` process

Set these variables on the app services:

- `DATABASE_URL`: Railway's Postgres connection string
- `TOKEN`: Discord bot token
- `SLACK_SIGNING_SECRET`: Slack app signing secret

Railway can usually inject the Postgres connection string from the database service into the app services. The `railway.json` file runs `bundle exec ruby bin/migrate` before each deploy so the database schema is ready before the app starts.

To initialize the database manually from Railway, run this command against either app service after `DATABASE_URL` is set:

```sh
bundle exec ruby bin/migrate
```

Run the `worker` process for Discord and the `web` process for the landing page and Slack slash command endpoint. Point Slack's `/kanbot` request URL at:

```text
https://YOUR_RAILWAY_WEB_HOST/slack/commands
```

### Railway + Neon

If you prefer Neon, keep the same Railway app setup and set `DATABASE_URL` to the Neon Postgres connection string instead of Railway Postgres.

For troubleshooting I recommend running `heroku logs --tail` to see what's going on, and having the bot send a message 
when it boots. Here's what it looked like for me:

```ruby
boot_channel_id = "1006282141828644944" # the channel you want the boot message to go to

bot.send_message(boot_channel_id, "Kanbot Kan! Booted at #{Time.now}. \n \n Available commands: \n !list [status] \n !add [status] [item] \n !remove [status] [position] \n !move [current_status] [position] [new_status] \n \n Example: \n !list \n !list todo \n !add doing Build a Kanban Board \n !remove doing 1 \n !move doing 1 done")
```

This was right below the `puts "starting Kanbot..."` line in `kanbot.rb` to make that startup process more visible.

## Contributing

Bug reports and pull requests are welcome on GitHub at https://github.com/BSierakowski/kanbot. I'd be thrilled to add
more features! 

Hope you enjoy using Kanbot!!
