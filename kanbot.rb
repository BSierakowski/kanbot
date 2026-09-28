require 'dotenv/load'
require 'discordrb'
require_relative 'lib/kanbot/database'
require_relative 'lib/kanbot/commands'

Kanbot.establish_database_connection

puts "starting Kanbot..."

# Here we instantiate a `CommandBot` instead of a regular `Bot`, which has the functionality to add commands using the
# `command` method. We have to set a `prefix` here, which will be the character that triggers command execution.
bot = Discordrb::Commands::CommandBot.new token: ENV['DISCORD_BOT_TOKEN'], prefix: '!'
commands = Kanbot::Commands.new

puts "This bot's invite URL is #{bot.invite_url}."
puts 'Click on it to invite it to your server.'

# Helper Methods
def command_authorized(event)
  # placeholder for future authorization logic
  return true
end

def discord_room_context(event)
  Kanbot::RoomContext.new(
    platform: 'discord',
    workspace_id: event.server.id.to_s,
    room_id: event.channel.id.to_s,
    room_name: event.channel.name,
    user_id: event.user.id.to_s,
    user_name: event.user.name
  )
end

# Bot Commands

# List Items Command
bot.command(:list) do |event, status|
  if command_authorized(event)
    event.respond(commands.list(discord_room_context(event), status))
  end
end

# Add Item Command
bot.command(:add) do |event, status, *item|
  if command_authorized(event)
    event.respond(commands.add(discord_room_context(event), status, item))
  end
end

bot.command(:bulkadd) do |event, *items|
  if command_authorized(event)
    event.respond(commands.bulkadd(discord_room_context(event), items))
  end
end

# # Remove Item Command
bot.command(:remove) do |event, status, position|
  if command_authorized(event)
    event.respond(commands.remove(discord_room_context(event), status, position))
  end
end

# # Change Status Command
bot.command(:move) do |event, current_status, position, new_status|
  if command_authorized(event)
    event.respond(commands.move(discord_room_context(event), current_status, position, new_status))
  end
end

bot.message(content: 'Ping!') do |event|
  event.respond 'Hi friend :).'
end

bot.command(:help) do |event|
  event.respond("Kanbot Can! \n \n Available commands: \n !list [status] \n !add [status] [item] \n !bulkadd [item], [item] \n !remove [status] [position] \n !move [current_status] [position] [new_status] \n \n Example: \n !list \n !list todo \n !add doing Build a Kanban Board \n !bulkadd Write docs, Ship Slack support \n !remove doing 1 \n !move doing 1 done \n \n !list also links to this channel's kanban board, where you can add cards and drag them between columns.")
end

bot.command(:react) do |event, word|
  emoji_map = {
    'A' => ['🇦', '🅰️', '🔼', '🗼', '🌲'],
    'B' => ['🇧', '🅱️', '🐝', '🍌', '💼'],
    'C' => ['🇨', '©️', '🌜', '🥐', '🐚'],
    'D' => ['🇩', '🍩', '🥁', '👗', '💵'],
    'E' => ['🇪', '📧', '🦄', '3️⃣', '🎗️'],
    'F' => ['🇫', '🎏', '🌫️', '🖋️', '🍟'],
    'G' => ['🇬', '🌀', '🦍', '🎻', '🥅'],
    'H' => ['🇭', '🏨', '🏋️', '♓', '🚁'],
    'I' => ['🇮', 'ℹ️', '📍', '🕯️', '🎚️'],
    'J' => ['🇯', '🎷', '🕹️', '🎒', '🌶️'],
    'K' => ['🇰', '🎋', '🔑', '🪁', '🥝'],
    'L' => ['🇱', '🛴', '🦵', '🍋', '🕒'],
    'M' => ['🇲', 'Ⓜ️', '🗻', '🍈', '🎹'],
    'N' => ['🇳', '🔒', '📰', '🎶', '🍜'],
    'O' => ['🇴', '🅾️', '🌕', '🍊', '👌'],
    'P' => ['🇵', '🅿️', '🍐', '🍕', '🥞'],
    'Q' => ['🇶', '🍳', '👸', '🏹', '🎱'],
    'R' => ['🇷', '®️', '🤖', '🚀', '🌈'],
    'S' => ['🇸', '💲', '🐍', '⭐', '🧦'],
    'T' => ['🇹', '🌴', '🌮', '🎩', '🍵'],
    'U' => ['🇺', '⛎', '🦄', '☂️', '🍇'],
    'V' => ['🇻', '✌️', '🔽', '🎻', '🏐'],
    'W' => ['🇼', '〰️', '🚾', '🍉', '🎐'],
    'X' => ['🇽', '❌', '✖️', '⚒️', '🔀'],
    'Y' => ['🇾', '🍸', '💴', '🧘', '🪀'],
    'Z' => ['🇿', '⚡', '💤', '🦓', '🧟']
  }

  if word.nil? || word == ""
    event.message.react("👍")
    event.message.react("👎")
    return
  else
    count_map = Hash.new(0)

    # Array to hold the sequence of emojis
    emoji_sequence = []

    # Iterate through each character in the word
    word.each_char do |char|
      if emoji_map.key?(char.upcase)
        # Increment the count for this character
        count_map[char.upcase] += 1

        # Calculate the index for the emoji
        emoji_index = (count_map[char.upcase] - 1) % emoji_map[char.upcase].length

        # Add the emoji to the sequence
        emoji_sequence << emoji_map[char.upcase][emoji_index]
      else
        # If character is not in the emoji_map, add it as is (or handle as needed)
        emoji_sequence << char
      end
    end

    emoji_sequence.each do |emoji|
      event.message.react(emoji)
    end

    return
  end
end

# Run the Bot
bot.run
