require 'discordrb'
require 'yaml'

# Load configuration
config = YAML.load_file('config.yml')

# Discord Bot Setup
bot_token = config['discord']['token']
bot = Discordrb::Bot.new token: bot_token

# Kanban Board Data Structure
kanban_board = {
  'To Do' => [],
  'In Progress' => [],
  'Done' => []
}

# Bot Commands

# Add Item Command
bot.command(:add) do |event, status, *item|
  item = item.join(' ')
  unless kanban_board.key?(status)
    event.respond("Invalid status. Available statuses are: #{kanban_board.keys.join(', ')}")
    next
  end
  kanban_board[status] << item
  "Item '#{item}' added to #{status}."
end

# Remove Item Command
bot.command(:remove) do |event, status, *item|
  item = item.join(' ')
  unless kanban_board[status]&.include?(item)
    event.respond("Item '#{item}' not found in #{status}.")
    next
  end
  kanban_board[status].delete(item)
  "Item '#{item}' removed from #{status}."
end

# Change Status Command
bot.command(:move) do |event, current_status, new_status, *item|
  item = item.join(' ')
  unless kanban_board[current_status]&.include?(item) && kanban_board.key?(new_status)
    event.respond("Cannot move. Ensure item exists in #{current_status} and #{new_status} is a valid status.")
    next
  end
  kanban_board[current_status].delete(item)
  kanban_board[new_status] << item
  "Item '#{item}' moved from #{current_status} to #{new_status}."
end

# Run the Bot
bot.run
