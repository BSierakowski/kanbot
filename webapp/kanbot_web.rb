require 'dotenv/load'
require 'json'
require 'sinatra'
require 'slack-ruby-client'

require_relative '../lib/kanbot/board'
require_relative '../lib/kanbot/database'
require_relative '../lib/kanbot/slack_command_router'

MAX_CARD_LENGTH = 2048

Kanbot.establish_database_connection

get '/' do
  erb :index
end

get '/boards/:token' do
  @board = Board.find_by(token: params['token'])

  if @board.nil?
    @title = 'Board not found'
    halt 404, erb(:board_not_found, layout: :board_layout)
  end

  @title = room_label(@board)
  erb :board, layout: :board_layout
end

get '/boards/:token/items' do
  board_json(find_board!)
end

post '/boards/:token/items' do
  board = find_board!
  payload = json_payload
  description = card_description!(payload)
  status = valid_status!(payload['status'])

  board.add_item(description, status)
  board_json(board)
end

patch '/boards/:token/items/:id' do
  board = find_board!
  item = find_item!(board)
  payload = json_payload
  status = valid_status!(payload['status'])

  board.move_item(item, status, Integer(payload['before_id'], exception: false))
  board_json(board)
end

delete '/boards/:token/items/:id' do
  board = find_board!
  find_item!(board).destroy!
  board_json(board)
end

post '/slack/commands' do
  verify_slack_request!

  result = Kanbot::SlackCommandRouter.new.call(slack_room_context, params['text'])

  content_type :json
  {
    response_type: 'in_channel',
    text: result
  }.to_json
end

helpers do
  def verify_slack_request!
    Slack::Events::Request.new(request).verify!
  rescue Slack::Events::Request::MissingSigningSecret,
         Slack::Events::Request::InvalidSignature,
         Slack::Events::Request::TimestampExpired
    halt 401, 'Invalid Slack signature'
  end

  def slack_room_context
    Kanbot::RoomContext.new(
      platform: 'slack',
      workspace_id: params['team_id'],
      room_id: params['channel_id'],
      room_name: "##{params['channel_name']}",
      user_id: params['user_id'],
      user_name: params['user_name']
    )
  end

  def h(text)
    Rack::Utils.escape_html(text.to_s)
  end

  def room_label(board)
    name = board.room_name || board.room_id
    name.start_with?('#') ? name : "##{name}"
  end

  def list_command(board)
    board.platform == 'slack' ? '/kanbot list' : '!list'
  end

  def board_payload(board)
    items = board.items.ordered.group_by(&:status)

    {
      columns: Kanbot::STATUSES.map do |status|
        {
          status: status,
          items: items.fetch(status, []).map { |item| { id: item.id, description: item.item_description } }
        }
      end
    }
  end

  def board_json(board)
    content_type :json
    JSON.generate(board_payload(board))
  end

  def json_error!(status, message)
    content_type :json
    halt status, JSON.generate(error: message)
  end

  def find_board!
    Board.find_by(token: params['token']) || json_error!(404, 'This board link is no longer valid.')
  end

  def find_item!(board)
    board.items.find_by(id: params['id']) || json_error!(404, 'That card is no longer on the board.')
  end

  def json_payload
    payload = JSON.parse(request.body.read)
    payload.is_a?(Hash) ? payload : {}
  rescue JSON::ParserError
    json_error!(400, 'Request body must be JSON.')
  end

  def valid_status!(status)
    return status if Kanbot::STATUSES.include?(status)

    json_error!(422, "Status must be one of: #{Kanbot::STATUSES.join(', ')}.")
  end

  def card_description!(payload)
    description = payload['description'].to_s.split.join(' ')
    author = payload['author'].to_s.split.join(' ')
    json_error!(422, 'Please provide an item to add.') if description.empty?

    description = "#{description} - #{author}" unless author.empty?
    json_error!(422, "Cards can be at most #{MAX_CARD_LENGTH} characters.") if description.length > MAX_CARD_LENGTH

    description
  end
end
