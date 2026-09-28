require_relative 'test_helper'
require_relative '../webapp/kanbot_web'

class WebTest < KanbotTest
  def setup
    super
    @board = Board.for_room(discord_room)
  end

  def test_board_page_shows_the_room_and_escapes_cards
    @board.add_item('Build <b>it</b>', 'todo')

    response = request(:get, "/boards/#{@board.token}")

    assert_equal 200, response.status
    assert_includes response.body, '<h1>#general</h1>'
    assert_includes response.body, 'Build &lt;b&gt;it&lt;/b&gt;'
    refute_includes response.body, '<b>it</b>'
  end

  def test_unknown_board_is_not_found
    page = request(:get, '/boards/nope')

    assert_equal 404, page.status
    assert_includes page.body, "This board link doesn't work"
    assert_equal 404, request(:get, '/boards/nope/items').status
    assert_equal 404, request(:post, '/boards/nope/items', status: 'todo', description: 'Hi').status
  end

  def test_items_are_listed_by_column_in_board_order
    second = @board.add_item('Second', 'doing')
    first = @board.add_item('First', 'doing')
    @board.move_item(first, 'doing', second.id)

    columns = json(request(:get, "/boards/#{@board.token}/items"))['columns']

    assert_equal %w[todo doing done], columns.map { |column| column['status'] }
    assert_equal [{ 'id' => first.id, 'description' => 'First' }, { 'id' => second.id, 'description' => 'Second' }],
                 columns[1]['items']
  end

  def test_adding_a_card_shows_up_in_the_list_command
    response = request(:post, "/boards/#{@board.token}/items", status: 'doing', description: '  Write   docs ', author: 'Sam')

    assert_equal 200, response.status
    assert_equal ['Write docs - Sam'], descriptions(json(response), 'doing')
    assert_includes list_output('doing'), '1. Write docs - Sam'

    item = @board.items.sole
    assert_equal ['discord', '1', '10', 'general'], [item.platform, item.workspace_id, item.room_id, item.room_name]
  end

  def test_adding_a_card_without_an_author
    response = request(:post, "/boards/#{@board.token}/items", status: 'todo', description: 'Anonymous idea', author: ' ')

    assert_equal ['Anonymous idea'], descriptions(json(response), 'todo')
  end

  def test_invalid_cards_are_rejected
    path = "/boards/#{@board.token}/items"

    assert_equal 422, request(:post, path, status: 'todo', description: '  ').status
    assert_equal 422, request(:post, path, status: 'later', description: 'Soon').status
    assert_equal 422, request(:post, path, status: 'todo', description: 'x' * 2049).status
    assert_equal 400, request(:post, path, 'not json').status
    assert_equal 'Status must be one of: todo, doing, done.', json(request(:post, path, status: 'later', description: 'Soon'))['error']
    assert_equal 0, @board.items.count
  end

  def test_moving_a_card_shows_up_in_the_list_command
    commands = Kanbot::Commands.new(web_url: nil)
    commands.add(discord_room, 'todo', ['One'])
    commands.add(discord_room, 'todo', ['Two'])
    commands.add(discord_room, 'doing', ['Three'])
    one = @board.items.find_by!(item_description: 'One - brian')
    three = @board.items.find_by!(item_description: 'Three - brian')

    response = request(:patch, "/boards/#{@board.token}/items/#{one.id}", status: 'doing', before_id: three.id)

    assert_equal 200, response.status
    assert_equal ['One - brian', 'Three - brian'], descriptions(json(response), 'doing')
    output = commands.list(discord_room)
    assert_includes output, "TODO\n```\n1. Two - brian\n```"
    assert_includes output, "DOING\n```\n1. One - brian\n2. Three - brian\n```"
  end

  def test_moving_a_card_to_the_bottom_of_a_column
    done = @board.add_item('Done', 'done')
    todo = @board.add_item('Todo', 'todo')

    response = request(:patch, "/boards/#{@board.token}/items/#{todo.id}", status: 'done', before_id: nil)

    assert_equal [done.item_description, todo.item_description], descriptions(json(response), 'done')
  end

  def test_moving_a_card_needs_a_valid_status
    item = @board.add_item('Stay put', 'todo')

    assert_equal 422, request(:patch, "/boards/#{@board.token}/items/#{item.id}", status: 'archived').status
    assert_equal 'todo', item.reload.status
  end

  def test_deleting_a_card
    item = @board.add_item('Remove me', 'todo')

    response = request(:delete, "/boards/#{@board.token}/items/#{item.id}")

    assert_equal 200, response.status
    assert_empty descriptions(json(response), 'todo')
    assert_equal 0, @board.items.count
  end

  def test_cards_from_other_rooms_cannot_be_changed
    other = Board.for_room(discord_room(room_id: '11')).add_item('Not yours', 'todo')

    assert_equal 404, request(:patch, "/boards/#{@board.token}/items/#{other.id}", status: 'done').status
    assert_equal 404, request(:delete, "/boards/#{@board.token}/items/#{other.id}").status
    assert_equal 'todo', other.reload.status
  end

  private

  def request(method, path, body = nil)
    input = body.is_a?(String) ? body : body && JSON.generate(body)

    Rack::MockRequest.new(Sinatra::Application).request(
      method.to_s.upcase,
      path,
      input: input,
      'CONTENT_TYPE' => 'application/json'
    )
  end

  def json(response)
    JSON.parse(response.body)
  end

  def descriptions(board_json, status)
    board_json['columns'].find { |column| column['status'] == status }['items'].map { |item| item['description'] }
  end

  def list_output(status)
    Kanbot::Commands.new(web_url: nil).list(discord_room, status)
  end
end
