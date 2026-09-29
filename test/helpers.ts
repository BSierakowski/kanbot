import type { Room, Status } from '../lib/board.js';
import type { Interaction } from '../lib/discord.js';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost/kanbot_test';
process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;

await import('../scripts/migrate.js');

export const { pool } = await import('../lib/db.js');
export const board = await import('../lib/board.js');
export const discord = await import('../lib/discord.js');
export const boardsApi = await import('../api/boards.js');

export const SITE_URL = 'https://kanbot.example';

export function room(roomId = '10'): Room {
  return { platform: 'discord', workspaceId: '1', roomId, roomName: 'general', userId: '100', userName: 'brian' };
}

export function listInteraction(roomId = '10'): Interaction {
  return {
    type: 2,
    application_id: 'app',
    token: 'interaction-token',
    data: { id: '555', name: 'kanbot', options: [{ name: 'list', type: 1, options: [] }] },
    guild_id: '1',
    channel: { id: roomId, name: 'general' },
    member: { user: { id: '100', username: 'brian' } },
  };
}

export async function descriptions(status: Status, roomId = '10'): Promise<string[]> {
  const column = (await board.cards(room(roomId))).find((candidate) => candidate.status === status);
  return column?.cards.map((card) => card.description) ?? [];
}

export async function resetDatabase(): Promise<void> {
  await pool.query('TRUNCATE items, boards RESTART IDENTITY');
}
