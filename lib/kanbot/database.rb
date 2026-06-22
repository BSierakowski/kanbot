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
    migrate_database
  end

  def self.migrate_database
    ActiveRecord::Base.connection.exec_query(CREATE_ITEMS_TABLE_SQL)
    ActiveRecord::Base.connection.execute('SELECT pg_advisory_lock(2426268)')
    migrate_items_table
  ensure
    ActiveRecord::Base.connection.execute('SELECT pg_advisory_unlock(2426268)') if ActiveRecord::Base.connected?
  end

  def self.migrate_items_table
    connection = ActiveRecord::Base.connection

    add_column_unless_exists(connection, :platform, 'VARCHAR ( 32 )')
    add_column_unless_exists(connection, :workspace_id, 'VARCHAR ( 255 )')
    add_column_unless_exists(connection, :room_id, 'VARCHAR ( 255 )')
    add_column_unless_exists(connection, :creator_id, 'VARCHAR ( 255 )')
    add_column_unless_exists(connection, :room_name, 'VARCHAR ( 255 )')

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

  def self.add_column_unless_exists(connection, column_name, column_type)
    connection.execute("ALTER TABLE items ADD COLUMN IF NOT EXISTS #{column_name} #{column_type}")
  end
end
