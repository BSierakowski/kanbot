import pg from 'pg';

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. On Vercel, connect a Neon database in the project's Storage tab.");
}

const client = new pg.Client({ connectionString });
await client.connect();

try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(2426268)');
  await client.query(`
    CREATE TABLE IF NOT EXISTS items (
      id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id bigint,
      server_id bigint,
      channel_id bigint,
      platform VARCHAR ( 32 ),
      workspace_id VARCHAR ( 255 ),
      room_id VARCHAR ( 255 ),
      creator_id VARCHAR ( 255 ),
      creator_name VARCHAR ( 255 ),
      room_name VARCHAR ( 255 ),
      item_description VARCHAR ( 2048 ) NOT NULL,
      status int NOT NULL
    )
  `);
  // Tables created before Slack support only have the Discord columns. Add the
  // room columns and fill them in so older Discord items stay on their boards.
  await client.query(`
    ALTER TABLE items
      ADD COLUMN IF NOT EXISTS platform VARCHAR ( 32 ),
      ADD COLUMN IF NOT EXISTS workspace_id VARCHAR ( 255 ),
      ADD COLUMN IF NOT EXISTS room_id VARCHAR ( 255 ),
      ADD COLUMN IF NOT EXISTS creator_id VARCHAR ( 255 ),
      ADD COLUMN IF NOT EXISTS room_name VARCHAR ( 255 ),
      ALTER COLUMN user_id DROP NOT NULL,
      ALTER COLUMN server_id DROP NOT NULL,
      ALTER COLUMN channel_id DROP NOT NULL
  `);
  await client.query(`
    UPDATE items
    SET platform = COALESCE(platform, 'discord'),
        workspace_id = COALESCE(workspace_id, server_id::text),
        room_id = COALESCE(room_id, channel_id::text),
        creator_id = COALESCE(creator_id, user_id::text)
    WHERE platform IS NULL OR workspace_id IS NULL OR room_id IS NULL OR creator_id IS NULL
  `);
  // Items used to store their author as a " - username" suffix on the description.
  await client.query('ALTER TABLE items ADD COLUMN IF NOT EXISTS creator_name VARCHAR ( 255 )');
  await client.query(`
    UPDATE items
    SET item_description = split.parts[1], creator_name = split.parts[2]
    FROM (
      SELECT id, regexp_match(item_description, '^(.+) - (\\S+)$') AS parts
      FROM items
      WHERE creator_name IS NULL
    ) AS split
    WHERE items.id = split.id AND split.parts IS NOT NULL
  `);
  await client.query('COMMIT');
  console.log('Database is ready.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
