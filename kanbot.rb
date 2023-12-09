require 'dotenv/load'
require 'discordrb'

puts "starting Kanbot..."

# Here we instantiate a `CommandBot` instead of a regular `Bot`, which has the functionality to add commands using the
# `command` method. We have to set a `prefix` here, which will be the character that triggers command execution.
bot = Discordrb::Commands::CommandBot.new token: ENV['TOKEN'], prefix: '!'

puts "This bot's invite URL is #{bot.invite_url}."
puts 'Click on it to invite it to your server.'

games_and_bots_id = "1006282141828644944"

bot.send_message(games_and_bots_id, "Booted at #{Time.now}")

# Kanban Board Data Structure
kanban_board = {
  'todo' => [],
  'doing' => [],
  'done' => []
}

# Bot Commands

# Add Item Command
bot.command(:add) do |event, status, *item|
  puts "event: #{event.inspect}"

  if event.user.id == "105638140722618368"
    event.respond("You are not authorized to use this command.")
  else
    puts "calling add command"
    item = item.join(' ')

    unless kanban_board.key?(status)
      event.respond("Invalid status. Available statuses are: #{kanban_board.keys.join(', ')}")
      next
    end
    kanban_board[status] << item
    event.respond "Item '#{item}' added to #{status}."
  end
end

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

bot.message(content: 'Ping!') do |event|
  event.respond 'Pong!'
end

# Run the Bot
bot.run
