require_relative 'test_helper'

class BoardTest < KanbotTest
  def setup
    super
    @board = Board.for_room(discord_room)
  end

  def test_for_room_reuses_the_board_and_tracks_renames
    assert_equal @board, Board.for_room(discord_room)

    renamed = Board.for_room(discord_room(room_name: 'planning'))

    assert_equal @board.id, renamed.id
    assert_equal 'planning', @board.reload.room_name
  end

  def test_each_room_gets_a_different_token
    other = Board.for_room(discord_room(room_id: '11'))

    refute_equal @board.token, other.token
    assert_operator @board.token.length, :>=, 22
  end

  def test_items_are_scoped_to_the_room
    Board.for_room(discord_room(room_id: '11')).add_item('Elsewhere', 'todo')
    @board.add_item('Here', 'todo')

    assert_equal ['Here'], @board.items.pluck(:item_description)
  end

  def test_add_item_appends_to_the_column
    @board.add_item('One', 'todo')
    @board.add_item('Two', 'todo')
    @board.add_item('Elsewhere', 'done')

    assert_equal %w[One Two], descriptions('todo')
  end

  def test_move_item_before_another_card
    one, _two, three = %w[One Two Three].map { |description| @board.add_item(description, 'todo') }

    @board.move_item(three, 'todo', one.id)

    assert_equal %w[Three One Two], descriptions('todo')
  end

  def test_move_item_into_another_column
    doing = @board.add_item('Doing', 'doing')
    todo = @board.add_item('Todo', 'todo')

    @board.move_item(todo, 'doing', doing.id)

    assert_equal %w[Todo Doing], descriptions('doing')
    assert_empty descriptions('todo')
  end

  def test_move_item_to_the_bottom_without_a_card_to_go_before
    one = @board.add_item('One', 'todo')
    @board.add_item('Two', 'todo')

    @board.move_item(one, 'todo', nil)
    assert_equal %w[Two One], descriptions('todo')

    @board.move_item(one, 'todo', 999)
    assert_equal %w[Two One], descriptions('todo')
  end

  def test_migration_keeps_the_order_of_existing_items
    ActiveRecord::Base.connection.execute(<<~SQL)
      INSERT INTO items (platform, workspace_id, room_id, item_description, status)
      VALUES ('discord', '1', '10', 'Old one', 0), ('discord', '1', '10', 'Old two', 0)
    SQL

    Kanbot.migrate_database

    refute Item.where(position: nil).exists?
    assert_equal ['Old one', 'Old two'], descriptions('todo')
  end

  private

  def descriptions(status)
    @board.items.where(status: status).ordered.pluck(:item_description)
  end
end
