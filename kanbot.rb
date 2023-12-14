require 'dotenv/load'
require 'discordrb'
require 'pg'
require 'active_record'

class Item < ActiveRecord::Base
  enum status: [:todo, :doing, :done]
end

CREATE_ITEMS_TABLE_SQL = <<~SQL
  CREATE TABLE IF NOT EXISTS items (
    id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint NOT NULL,
    server_id bigint NOT NULL,
    item_description VARCHAR ( 2048 ) NOT NULL,
    status int NOT NULL
  );
SQL

ActiveRecord::Base.establish_connection(ENV['DATABASE_URL'] || 'postgres://localhost/mydb')

create_items_table = ActiveRecord::Base.sanitize_sql_array([CREATE_ITEMS_TABLE_SQL])
ActiveRecord::Base.connection.exec_query(create_items_table)

puts "starting Kanbot..."

# Here we instantiate a `CommandBot` instead of a regular `Bot`, which has the functionality to add commands using the
# `command` method. We have to set a `prefix` here, which will be the character that triggers command execution.
bot = Discordrb::Commands::CommandBot.new token: ENV['TOKEN'], prefix: '!'

puts "This bot's invite URL is #{bot.invite_url}."
puts 'Click on it to invite it to your server.'

# Helper Methods
def command_authorized(event)
  if event.user.id == "105638140722618368"
    event.respond("You are not authorized to use this command.")
    return false
  end
  return true
end

def output_list(status, items, event)

  if status == "all"
    list = ["Todo Items:"]

    todo_items = items.where(status: "todo")
    todo_items.each do |item|
      list << "- #{item.item_description}"
    end

    list << "------------"
    list << "Doing Items:"

    doing_items = items.where(status: "doing")
    doing_items.each do |item|
      list << "- #{item.item_description}"
    end

    list << "-----------"
    list << "Done Items:"
    done_items = items.where(status: "done")
    done_items.each do |item|
      list << "- #{item.item_description}"
    end
  else
    list = ["#{status.capitalize} Items:"]

    items.each_with_index do |item, index|
      list << "#{index + 1}. #{item.item_description}"
    end
  end

  event.respond(list.join("\n"))
end

# Bot Commands

# List Items Command
bot.command(:list) do |event, status|
  event.respond("Channel ID: #{event.channel.id}, Channel Name: #{event.channel.name} ")
  if command_authorized(event)
    if status.nil? || status == "" || status == " " || status == "all"
      items = Item.where(server_id: event.server.id).order(:status, :id)

      output_list("all", items, event)
    elsif status == "todo" || status == "doing" || status == "done"
      items = Item.where(server_id: event.server.id, status: status).order(:id)

      output_list(status, items, event)
    else
      event.respond("Invalid status. Available statuses are: todo, doing, done.")
    end
  end
end

# Add Item Command
bot.command(:add) do |event, status, *item|
  if command_authorized(event)
    if status != "todo" && status != "doing" && status != "done"
      item = item.unshift(status).join(' ')
      status = "todo"
    else
      item = item.join(' ')
    end

    Item.create(user_id: event.user.id, server_id: event.server.id, item_description: item, status: status)
    event.respond "Item '#{item}' added to #{status}."
  end
end

bot.command(:bulkadd) do |event, *items|
  if command_authorized(event)
    status = "todo"

    split_items = items.join(' ').split(",")

    split_items.each do |item|
      item_description = item.chomp(",").strip

      Item.create(user_id: event.user.id, server_id: event.server.id, item_description: item_description, status: status)
    end

    if split_items.count == 1
      event.respond "Added #{split_items.count} item to Todo."
    else
      event.respond "Added #{split_items.count} items to Todo."
    end
  end
end

# # Remove Item Command
bot.command(:remove) do |event, status, position|
  if command_authorized(event)
    position = position.to_i

    if status != "todo" && status != "doing" && status != "done"
      event.respond("Invalid status. Available statuses are: todo, doing, done.")
    else
      items = Item.where(server_id: event.server.id, status: status).order(:id)

      if items[position - 1].nil?
        event.respond("No item exists in status #{status} at position #{position}")
      else
        item = items[position - 1]
        items[position - 1].delete
        event.respond("Item '#{item.item_description}' removed from #{status}.")
      end
    end
  end
end

# # Change Status Command
bot.command(:move) do |event, current_status, position, new_status|
  if command_authorized(event)
    position = position.to_i

    if current_status != "todo" && current_status != "doing" && current_status != "done"
      event.respond("The current status #{current_status} doesn't exist, Available statuses are: todo, doing, done.")
      return
    end

    if new_status != "todo" && new_status != "doing" && new_status != "done"
      event.respond("The new status #{new_status} doesn't exist, Available statuses are: todo, doing, done.")
      return
    end

    item = Item.where(server_id: event.server.id, status: current_status).order(:id)[position - 1]

    if item.nil?
      event.respond("No item exists in status #{current_status} at position #{position} to move.")
      return
    end

    item.update(status: new_status)
    event.respond("Item '#{item.item_description}' moved from #{current_status} to #{new_status}.")
  end
end

bot.message(content: 'Ping!') do |event|
  event.respond 'Hi friend :).'
end

bot.command(:help) do |event|
  event.respond("Kanbot Kan! \n \n Available commands: \n !list [status] \n !add [status] [item] \n !remove [status] [position] \n !move [current_status] [position] [new_status] \n \n Example: \n !list \n !list todo \n !add doing Build a Kanban Board \n !remove doing 1 \n !move doing 1 done")
end

# Run the Bot
bot.run
