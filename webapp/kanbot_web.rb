require 'dotenv/load'
require 'json'
require 'sinatra'
require 'slack-ruby-client'

require_relative '../lib/kanbot/database'
require_relative '../lib/kanbot/slack_command_router'

Kanbot.establish_database_connection

get '/' do
  erb :index
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
end
