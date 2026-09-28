require_relative 'test_helper'

class CommandsTest < KanbotTest
  def test_list_ends_with_a_link_to_the_rooms_board
    output = commands.list(discord_room)
    board = Board.find_by!(platform: 'discord', workspace_id: '1', room_id: '10')

    assert_equal 'general', board.room_name
    assert output.end_with?("```\n\nOpen the board to add and move cards: <https://kanbot.example/boards/#{board.token}>")
  end

  def test_status_list_also_links_to_the_board
    assert_match %r{<https://kanbot\.example/boards/[\w-]+>\z}, commands.list(discord_room, 'todo')
  end

  def test_each_room_keeps_its_own_board_link
    link = board_link(commands.list(discord_room))

    assert_equal link, board_link(commands.list(discord_room))
    refute_equal link, board_link(commands.list(discord_room(room_id: '11')))
  end

  def test_trailing_slash_in_web_url_is_ignored
    assert_match %r{<https://kanbot\.example/boards/[\w-]+>\z}, commands(web_url: 'https://kanbot.example/').list(discord_room)
  end

  def test_list_has_no_link_without_a_web_url
    output = commands(web_url: nil).list(discord_room)

    refute_includes output, '/boards/'
    assert_equal 0, Board.count
  end

  def test_list_follows_the_board_order
    commands.add(discord_room, 'todo', ['First'])
    commands.add(discord_room, 'todo', ['Second'])
    board = Board.for_room(discord_room)
    first, second = board.items.ordered.to_a

    board.move_item(second, 'todo', first.id)

    assert_includes commands.list(discord_room, 'todo'), "1. Second - brian\n2. First - brian"
  end

  def test_positions_in_commands_follow_the_board_order
    commands.add(discord_room, 'todo', ['First'])
    commands.add(discord_room, 'todo', ['Second'])
    board = Board.for_room(discord_room)
    first, second = board.items.ordered.to_a
    board.move_item(second, 'todo', first.id)

    assert_equal "Item 'Second - brian' moved from todo to done.", commands.move(discord_room, 'todo', '1', 'done')
    assert_equal "Item 'First - brian' removed from todo.", commands.remove(discord_room, 'todo', '1')
  end

  def test_move_puts_the_item_at_the_bottom_of_the_new_column
    commands.add(discord_room, 'todo', ['Next'])
    commands.add(discord_room, 'done', ['Shipped'])

    commands.move(discord_room, 'todo', '1', 'done')

    assert_includes commands.list(discord_room, 'done'), "1. Shipped - brian\n2. Next - brian"
  end

  def test_bulkadd_appends_items_in_order
    commands.add(discord_room, 'todo', ['Existing'])

    commands.bulkadd(discord_room, ['Write', 'docs,', 'Ship', 'it'])

    assert_includes commands.list(discord_room, 'todo'), "1. Existing - brian\n2. Write docs - brian\n3. Ship it - brian"
  end

  private

  def commands(web_url: 'https://kanbot.example')
    Kanbot::Commands.new(web_url: web_url)
  end

  def board_link(output)
    output[%r{<(https://\S+)>\z}, 1]
  end
end
