require 'active_record'

class Item < ActiveRecord::Base
  enum :status, [:todo, :doing, :done]
end

module Kanbot
  CREATE_ITEMS_TABLE_SQL = <<~SQL
    CREATE TABLE IF NOT EXISTS items (
      id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id bigint,
      server_id bigint,
      channel_id bigint,
      platform VARCHAR ( 32 ),
      workspace_id VARCHAR ( 255 ),
      room_id VARCHAR ( 255 ),
      creator_id VARCHAR ( 255 ),
      room_name VARCHAR ( 255 ),
      item_description VARCHAR ( 2048 ) NOT NULL,
      status int NOT NULL
    );
  SQL

  def self.establish_database_connection
    ActiveRecord::Base.establish_connection(ENV['DATABASE_URL'] || 'postgres://localhost/mydb')
    ActiveRecord::Base.connection.exec_query(CREATE_ITEMS_TABLE_SQL)
    migrate_items_table
  end

  def self.migrate_items_table
    connection = ActiveRecord::Base.connection

    add_column_unless_exists(connection, :platform, :string, limit: 32)
    add_column_unless_exists(connection, :workspace_id, :string, limit: 255)
    add_column_unless_exists(connection, :room_id, :string, limit: 255)
    add_column_unless_exists(connection, :creator_id, :string, limit: 255)
    add_column_unless_exists(connection, :room_name, :string, limit: 255)

    [:user_id, :server_id, :channel_id].each do |column|
      connection.change_column_null(:items, column, true) if connection.column_exists?(:items, column)
    end

    connection.exec_update(<<~SQL)
      UPDATE items
      SET platform = 'discord'
      WHERE platform IS NULL
    SQL

    connection.exec_update(<<~SQL)
      UPDATE items
      SET workspace_id = server_id::text
      WHERE workspace_id IS NULL AND server_id IS NOT NULL
    SQL

    connection.exec_update(<<~SQL)
      UPDATE items
      SET room_id = channel_id::text
      WHERE room_id IS NULL AND channel_id IS NOT NULL
    SQL

    connection.exec_update(<<~SQL)
      UPDATE items
      SET creator_id = user_id::text
      WHERE creator_id IS NULL AND user_id IS NOT NULL
    SQL
  end

  def self.add_column_unless_exists(connection, column_name, column_type, **options)
    return if connection.column_exists?(:items, column_name)

    connection.add_column(:items, column_name, column_type, **options)
  end
end
