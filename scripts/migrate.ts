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
      room_name VARCHAR ( 255 ),
      item_description VARCHAR ( 2048 ) NOT NULL,
      status int NOT NULL
    )
  `);
  await client.query('COMMIT');
  console.log('Database is ready.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
