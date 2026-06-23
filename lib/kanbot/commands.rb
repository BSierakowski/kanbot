require_relative 'database'

module Kanbot
  STATUSES = ['todo', 'doing', 'done'].freeze
  STATUS_LABELS = {
    'todo' => 'TODO',
    'doing' => 'DOING',
    'done' => 'DONE'
  }.freeze

  HELP_TEXT = <<~HELP.freeze
    Kanbot Can!

    Available commands:
    list [status]
    add [status] [item]
    bulkadd [item], [item]
    remove [status] [position]
    move [current_status] [position] [new_status]

    Example:
    list
    list todo
    add doing Build a Kanban Board
    bulkadd Write docs, Ship Slack support
    remove doing 1
    move doing 1 done
  HELP

  RoomContext = Struct.new(
    :platform,
    :workspace_id,
    :room_id,
    :room_name,
    :user_id,
    :user_name,
    keyword_init: true
  )

  class Commands
    def initialize(item_model: Item)
      @item_model = item_model
    end

    def list(room, status = nil)
      status = status.to_s.strip
      items = room_items(room)

      if status.empty? || status == 'all'
        return output_list(room, 'all', items.order(:status, :id))
      end

      return invalid_status unless valid_status?(status)

      output_list(room, status, items.where(status: status).order(:id))
    end

    def add(room, status, item_words)
      status = status.to_s.strip
      words = Array(item_words).compact.map(&:to_s)

      unless valid_status?(status)
        words.unshift(status) unless status.empty?
        status = 'todo'
      end

      description = words.join(' ').strip
      return 'Please provide an item to add.' if description.empty?

      item_description = "#{description} - #{room.user_name}"
      @item_model.create!(item_attributes(room).merge(item_description: item_description, status: status))

      "Item '#{item_description}' added to #{status}."
    end

    def bulkadd(room, item_words)
      split_items = Array(item_words).join(' ').split(',').map(&:strip).reject(&:empty?)
      return 'Please provide at least one item to add.' if split_items.empty?

      split_items.each do |item|
        item_description = "#{item} - #{room.user_name}"
        @item_model.create!(item_attributes(room).merge(item_description: item_description, status: 'todo'))
      end

      item_label = split_items.count == 1 ? 'item' : 'items'
      "Added #{split_items.count} #{item_label} to Todo."
    end

    def remove(room, status, position)
      status = status.to_s.strip
      return invalid_status unless valid_status?(status)

      position = position.to_i
      return invalid_position if position <= 0

      item = room_items(room).where(status: status).order(:id)[position - 1]

      return "No item exists in status #{status} at position #{position}" if item.nil?

      item.delete
      "Item '#{item.item_description}' removed from #{status}."
    end

    def move(room, current_status, position, new_status)
      current_status = current_status.to_s.strip
      new_status = new_status.to_s.strip
      position = position.to_i

      unless valid_status?(current_status)
        return "The current status #{current_status} doesn't exist, Available statuses are: todo, doing, done."
      end

      unless valid_status?(new_status)
        return "The new status #{new_status} doesn't exist, Available statuses are: todo, doing, done."
      end

      return invalid_position if position <= 0

      item = room_items(room).where(status: current_status).order(:id)[position - 1]
      return "No item exists in status #{current_status} at position #{position} to move." if item.nil?

      item.update!(status: new_status)
      "Item '#{item.item_description}' moved from #{current_status} to #{new_status}."
    end

    def help
      HELP_TEXT
    end

    private

    def valid_status?(status)
      STATUSES.include?(status)
    end

    def invalid_status
      'Invalid status. Available statuses are: todo, doing, done.'
    end

    def invalid_position
      'Please provide a position greater than 0.'
    end

    def room_items(room)
      @item_model.where(platform: room.platform, workspace_id: room.workspace_id, room_id: room.room_id)
    end

    def item_attributes(room)
      attributes = {
        platform: room.platform,
        workspace_id: room.workspace_id,
        room_id: room.room_id,
        room_name: room.room_name,
        creator_id: room.user_id
      }

      if room.platform == 'discord'
        attributes[:user_id] = room.user_id
        attributes[:server_id] = room.workspace_id
        attributes[:channel_id] = room.room_id
      end

      attributes
    end

    def output_list(room, status, items)
      room_name = room.room_name || room.room_id

      if status == 'all'
        board = ["*Kanbot board for #{room_name}*"]

        STATUSES.each do |section_status|
          board << ''
          board << status_section(STATUS_LABELS.fetch(section_status), items.where(status: section_status))
        end
      else
        board = ["*#{STATUS_LABELS.fetch(status)} items for #{room_name}*"]
        board << ''
        board << item_block(items)
      end

      board.join("\n")
    end

    def status_section(label, items)
      ["#{label}", item_block(items)].join("\n")
    end

    def item_block(items)
      lines = []

      items.each_with_index do |item, index|
        lines << "#{index + 1}. #{item.item_description}"
      end

      lines << 'No items yet.' if lines.empty?

      ["```", *lines, "```"].join("\n")
    end
  end
end
