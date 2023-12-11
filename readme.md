# Kanbot 

Kanbot can :).

## Commands

Available commands:
!list [status]
!add [status] [item]
!remove [status] [position]
!move [current_status] [position] [new_status]

Example:
!list
!list todo
!add doing Build a Kanban Board
!remove doing 1
!move doing 1 done

## Development

Running the bot locally should be a function of: 
1) bundling the required gems
2) creating a database
3) and `bundle exec ruby kanbot.rb`

I say should because my workflow has been to deploy to heroku and test there.

## Deployment

### Heroku

The bot is running on Heroku. Because we need the bot to listen over a long period of time, our Procfile specifies one 
worker as the bot, running `bundle exec ruby kanbot.rb`. 

To get this in running you need to:

1) Create a heroku app
2) Add the heroku remote to your git repo
3) Add the heroku postgres addon
4) Add the `TOKEN` env var.

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
