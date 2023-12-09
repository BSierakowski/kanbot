require 'dotenv/load'
require 'discordrb'

# # Discord Bot Setup
# bot = Discordrb::Bot.new token: ENV['TOKEN']
#
# # Kanban Board Data Structure
# kanban_board = {
#   'To Do' => [],
#   'In Progress' => [],
#   'Done' => []
# }
#
# # Bot Commands
#
# # Add Item Command
# bot.command(:add) do |event, status, *item|
#   item = item.join(' ')
#   unless kanban_board.key?(status)
#     event.respond("Invalid status. Available statuses are: #{kanban_board.keys.join(', ')}")
#     next
#   end
#   kanban_board[status] << item
#   "Item '#{item}' added to #{status}."
# end
#
# # Remove Item Command
# bot.command(:remove) do |event, status, *item|
#   item = item.join(' ')
#   unless kanban_board[status]&.include?(item)
#     event.respond("Item '#{item}' not found in #{status}.")
#     next
#   end
#   kanban_board[status].delete(item)
#   "Item '#{item}' removed from #{status}."
# end
#
# # Change Status Command
# bot.command(:move) do |event, current_status, new_status, *item|
#   item = item.join(' ')
#   unless kanban_board[current_status]&.include?(item) && kanban_board.key?(new_status)
#     event.respond("Cannot move. Ensure item exists in #{current_status} and #{new_status} is a valid status.")
#     next
#   end
#   kanban_board[current_status].delete(item)
#   kanban_board[new_status] << item
#   "Item '#{item}' moved from #{current_status} to #{new_status}."
# end
#
# # Run the Bot
# bot.run



## frozen_string_literal: true

## This simple bot responds to every "Ping!" message with a "Pong!"

# This statement creates a bot with the specified token and application ID. After this line, you can add events to the
# created bot, and eventually run it.
#
# If you don't yet have a token to put in here, you will need to create a bot account here:
#   https://discord.com/developers/applications
# If you're wondering about what redirect URIs and RPC origins, you can ignore those for now. If that doesn't satisfy
# you, look here: https://github.com/discordrb/discordrb/wiki/Redirect-URIs-and-RPC-origins
# After creating the bot, simply copy the token (*not* the OAuth2 secret) and put it into the
# respective place.
puts "starting Kanbot..."
bot = Discordrb::Bot.new token: ENV['TOKEN']

# Here we output the invite URL to the console so the bot account can be invited to the channel. This only has to be
# done once, afterwards, you can remove this part if you want
puts "This bot's invite URL is #{bot.invite_url}."
puts 'Click on it to invite it to your server.'

# This method call adds an event handler that will be called on any message that exactly contains the string "Ping!".
# The code inside it will be executed, and a "Pong!" response will be sent to the channel.
bot.message(content: 'Ping!') do |event|
  event.respond 'Pong!'
end

# This method call has to be put at the end of your script, it is what makes the bot actually connect to Discord. If you
# leave it out (try it!) the script will simply stop and the bot will not appear online.
bot.run
