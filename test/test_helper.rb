ENV['APP_ENV'] = 'test'
ENV['DATABASE_URL'] = ENV.fetch('TEST_DATABASE_URL', 'postgres://localhost/kanbot_test')

require 'minitest/autorun'

require_relative '../lib/kanbot/commands'

Kanbot.establish_database_connection

class KanbotTest < Minitest::Test
  def setup
    ActiveRecord::Base.connection.execute('TRUNCATE items, boards RESTART IDENTITY')
  end

  private

  def discord_room(room_id: '10', room_name: 'general')
    Kanbot::RoomContext.new(
      platform: 'discord',
      workspace_id: '1',
      room_id: room_id,
      room_name: room_name,
      user_id: '100',
      user_name: 'brian'
    )
  end
end
