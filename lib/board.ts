import { randomBytes } from 'node:crypto';

import { pool } from './db.js';

export const STATUSES = ['todo', 'doing', 'done'] as const;
export type Status = (typeof STATUSES)[number];

export const SECTIONS: Record<Status, { title: string; empty: string }> = {
  todo: { title: '📋 Todo', empty: 'Nothing to do' },
  doing: { title: '🔨 Doing', empty: 'Nothing in progress' },
  done: { title: '✅ Done', empty: 'Nothing finished yet' },
};

export const DONE_SHOWN_ON_FULL_BOARD = 5;

export const HELP_TEXT = `Kanbot Can!

Use \`/kanbot list [status]\`, \`/kanbot add [status] [item]\`, \`/kanbot bulkadd [item], [item]\`, \`/kanbot remove [status] [position]\`, or \`/kanbot move [current_status] [position] [new_status]\`.

Examples:
\`/kanbot list\`
\`/kanbot add doing Build a Kanban Board\`
\`/kanbot move doing 1 done\``;

const INVALID_STATUS = 'Invalid status. Available statuses are: todo, doing, done.';
const INVALID_POSITION = 'Please provide a position greater than 0.';

const NTH_ITEM_IN_STATUS = `
  SELECT id FROM items
  WHERE platform = $1 AND workspace_id = $2 AND room_id = $3 AND status = $4
  ORDER BY position, id
  OFFSET $5 LIMIT 1
`;

export interface Room {
  platform: 'discord' | 'slack';
  workspaceId: string;
  roomId: string;
  roomName: string | null;
  userId: string;
  userName: string;
}

export type BoardRoom = Omit<Room, 'userId' | 'userName'>;

export interface BoardItem {
  position: number;
  description: string;
  creatorId: string | null;
  creatorName: string | null;
}

export interface Board {
  roomId: string;
  roomName: string | null;
  sections: { status: Status; items: BoardItem[] }[];
}

export interface Card {
  id: number;
  description: string;
  author: string | null;
}

interface Item {
  id: number;
  item_description: string;
  status: number;
  creator_id: string | null;
  creator_name: string | null;
}

export async function list(room: Room, status: string | undefined, format: (board: Board) => string): Promise<string> {
  const requested = (status ?? '').trim();
  let statuses: readonly Status[] = STATUSES;

  if (requested !== '' && requested !== 'all') {
    if (!isStatus(requested)) return INVALID_STATUS;
    statuses = [requested];
  }

  const items = await roomItems(room, statuses.length === 1 ? statuses[0] : undefined);
  const sections = statuses.map((sectionStatus) => ({
    status: sectionStatus,
    items: items
      .filter((item) => item.status === STATUSES.indexOf(sectionStatus))
      .map((item, index) => ({
        position: index + 1,
        description: item.item_description,
        creatorId: item.creator_id,
        creatorName: item.creator_name,
      })),
  }));

  return format({ roomId: room.roomId, roomName: room.roomName, sections });
}

export async function add(room: Room, status: string | undefined, itemWords: string[]): Promise<string> {
  const requested = (status ?? '').trim();
  const itemStatus = isStatus(requested) ? requested : 'todo';
  const words = isStatus(requested) || requested === '' ? itemWords : [requested, ...itemWords];

  const description = words.join(' ').trim();
  if (description === '') return 'Please provide an item to add.';

  await insertItem(room, description, itemStatus);

  return `Item '${description}' added to ${itemStatus}.`;
}

export async function bulkadd(room: Room, itemWords: string[]): Promise<string> {
  const items = itemWords
    .join(' ')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
  if (items.length === 0) return 'Please provide at least one item to add.';

  for (const item of items) {
    await insertItem(room, item, 'todo');
  }

  const itemLabel = items.length === 1 ? 'item' : 'items';
  return `Added ${items.length} ${itemLabel} to Todo.`;
}

export async function remove(
  room: Room,
  status: string | undefined,
  position: string | number | undefined,
): Promise<string> {
  const itemStatus = (status ?? '').trim();
  if (!isStatus(itemStatus)) return INVALID_STATUS;

  const itemPosition = toPosition(position);
  if (itemPosition <= 0) return INVALID_POSITION;

  const { rows } = await pool.query<Pick<Item, 'item_description'>>(
    `DELETE FROM items WHERE id = (${NTH_ITEM_IN_STATUS}) RETURNING item_description`,
    [...roomKey(room), STATUSES.indexOf(itemStatus), itemPosition - 1],
  );
  const item = rows[0];
  if (!item) return `No item exists in status ${itemStatus} at position ${itemPosition}`;

  return `Item '${item.item_description}' removed from ${itemStatus}.`;
}

export async function move(
  room: Room,
  currentStatus: string | undefined,
  position: string | number | undefined,
  newStatus: string | undefined,
): Promise<string> {
  const from = (currentStatus ?? '').trim();
  const to = (newStatus ?? '').trim();
  const itemPosition = toPosition(position);

  if (!isStatus(from)) {
    return `The current status ${from} doesn't exist, Available statuses are: todo, doing, done.`;
  }

  if (!isStatus(to)) {
    return `The new status ${to} doesn't exist, Available statuses are: todo, doing, done.`;
  }

  if (itemPosition <= 0) return INVALID_POSITION;

  const { rows } = await pool.query<Pick<Item, 'item_description'>>(
    `UPDATE items
     SET status = $6,
         position = (
           SELECT COALESCE(MAX(position), 0) + 1 FROM items
           WHERE platform = $1 AND workspace_id = $2 AND room_id = $3 AND status = $6
         )
     WHERE id = (${NTH_ITEM_IN_STATUS})
     RETURNING item_description`,
    [...roomKey(room), STATUSES.indexOf(from), itemPosition - 1, STATUSES.indexOf(to)],
  );
  const item = rows[0];
  if (!item) return `No item exists in status ${from} at position ${itemPosition} to move.`;

  return `Item '${item.item_description}' moved from ${from} to ${to}.`;
}

export async function findBoard(token: string): Promise<BoardRoom | undefined> {
  const { rows } = await pool.query<{
    platform: Room['platform'];
    workspace_id: string;
    room_id: string;
    room_name: string | null;
  }>('SELECT platform, workspace_id, room_id, room_name FROM boards WHERE token = $1', [token]);
  const row = rows[0];
  if (!row) return undefined;

  return { platform: row.platform, workspaceId: row.workspace_id, roomId: row.room_id, roomName: row.room_name };
}

export async function cards(room: BoardRoom): Promise<{ status: Status; title: string; cards: Card[] }[]> {
  const items = await roomItems(room);

  return STATUSES.map((status) => ({
    status,
    title: SECTIONS[status].title,
    cards: items
      .filter((item) => item.status === STATUSES.indexOf(status))
      .map((item) => ({ id: item.id, description: item.item_description, author: item.creator_name })),
  }));
}

export async function addCard(room: BoardRoom, status: Status, description: string, author: string | null): Promise<void> {
  await insertItem({ ...room, userId: null, userName: author }, description, status);
}

// Puts the card in the status column just above the card with beforeId, or at the bottom when that card isn't there.
export async function moveCard(room: BoardRoom, id: number, status: Status, beforeId: number | null): Promise<boolean> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT 1 FROM boards WHERE platform = $1 AND workspace_id = $2 AND room_id = $3 FOR UPDATE', roomKey(room));

    const { rows } = await client.query<Pick<Item, 'id'>>(
      `SELECT id FROM items
       WHERE platform = $1 AND workspace_id = $2 AND room_id = $3 AND (status = $4 OR id = $5)
       ORDER BY position, id`,
      [...roomKey(room), STATUSES.indexOf(status), id],
    );
    if (!rows.some((row) => row.id === id)) {
      await client.query('ROLLBACK');
      return false;
    }

    const column = rows.map((row) => row.id).filter((columnId) => columnId !== id);
    const before = beforeId === null ? -1 : column.indexOf(beforeId);
    column.splice(before === -1 ? column.length : before, 0, id);

    await client.query(
      `UPDATE items SET status = $1, position = ordered.position
       FROM unnest($2::int[]) WITH ORDINALITY AS ordered (id, position)
       WHERE items.id = ordered.id`,
      [STATUSES.indexOf(status), column],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteCard(room: BoardRoom, id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    'DELETE FROM items WHERE platform = $1 AND workspace_id = $2 AND room_id = $3 AND id = $4',
    [...roomKey(room), id],
  );
  return rowCount === 1;
}

export function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

function toPosition(value: string | number | undefined): number {
  const position = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(position) ? 0 : position;
}

function roomKey(room: BoardRoom): string[] {
  return [room.platform, room.workspaceId, room.roomId];
}

async function roomItems(room: BoardRoom, status?: Status): Promise<Item[]> {
  const params: (string | number)[] = roomKey(room);
  let sql =
    'SELECT id, item_description, status, creator_id, creator_name FROM items WHERE platform = $1 AND workspace_id = $2 AND room_id = $3';

  if (status) {
    params.push(STATUSES.indexOf(status));
    sql += ' AND status = $4';
  }

  const { rows } = await pool.query<Item>(`${sql} ORDER BY position, id`, params);
  return rows;
}

async function insertItem(
  room: BoardRoom & { userId: string | null; userName: string | null },
  itemDescription: string,
  status: Status,
): Promise<void> {
  const discordIds = room.platform === 'discord' ? [room.userId, room.workspaceId, room.roomId] : [null, null, null];
  const { rows } = await pool.query<{ position: number }>(
    `SELECT COALESCE(MAX(position), 0) + 1 AS position FROM items
     WHERE platform = $1 AND workspace_id = $2 AND room_id = $3 AND status = $4`,
    [...roomKey(room), STATUSES.indexOf(status)],
  );

  await pool.query(
    `INSERT INTO items (platform, workspace_id, room_id, room_name, creator_id, creator_name, user_id, server_id, channel_id, item_description, status, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      ...roomKey(room),
      room.roomName,
      room.userId,
      room.userName,
      ...discordIds,
      itemDescription,
      STATUSES.indexOf(status),
      rows[0].position,
    ],
  );
}

export async function boardToken(room: BoardRoom): Promise<string> {
  const { rows } = await pool.query<{ token: string }>(
    `INSERT INTO boards (platform, workspace_id, room_id, room_name, token)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (platform, workspace_id, room_id)
     DO UPDATE SET room_name = COALESCE(EXCLUDED.room_name, boards.room_name)
     RETURNING token`,
    [...roomKey(room), room.roomName, randomBytes(16).toString('base64url')],
  );
  return rows[0].token;
}
