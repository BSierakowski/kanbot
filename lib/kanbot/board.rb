require 'securerandom'

require_relative 'database'

class Board < ActiveRecord::Base
  def self.for_room(room)
    board = find_or_create_by!(platform: room.platform, workspace_id: room.workspace_id, room_id: room.room_id) do |new_board|
      new_board.room_name = room.room_name
      new_board.token = SecureRandom.urlsafe_base64(16)
    end

    board.update!(room_name: room.room_name) if room.room_name && board.room_name != room.room_name
    board
  rescue ActiveRecord::RecordNotUnique
    retry
  end

  def items
    Item.where(platform: platform, workspace_id: workspace_id, room_id: room_id)
  end

  def add_item(description, status)
    with_lock do
      items.create!(
        room_name: room_name,
        item_description: description,
        status: status,
        position: items.where(status: status).next_position
      )
    end
  end

  # Places the item in the status column just before the item with id before_id,
  # or at the bottom of the column when before_id isn't in it.
  def move_item(item, status, before_id = nil)
    with_lock do
      column = items.where(status: status).where.not(id: item.id).ordered.to_a
      index = column.index { |column_item| column_item.id == before_id } || column.length
      column.insert(index, item)
      item.status = status

      column.each.with_index(1) do |column_item, position|
        column_item.position = position
        column_item.save! if column_item.changed?
      end
    end
  end
end
