import { pool } from './db.js';

export const STATUSES = ['todo', 'doing', 'done'] as const;
export type Status = (typeof STATUSES)[number];

const STATUS_LABELS: Record<Status, string> = {
  todo: 'TODO',
  doing: 'DOING',
  done: 'DONE',
};

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
  ORDER BY id
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

interface Item {
  item_description: string;
  status: number;
}

export async function list(room: Room, status = ''): Promise<string> {
  const requested = status.trim();
  const roomName = room.roomName ?? room.roomId;

  if (requested === '' || requested === 'all') {
    const items = await roomItems(room);
    const board = [`*Kanbot board for ${roomName}*`];

    STATUSES.forEach((sectionStatus, index) => {
      board.push('', STATUS_LABELS[sectionStatus], itemBlock(items.filter((item) => item.status === index)));
    });

    return board.join('\n');
  }

  if (!isStatus(requested)) return INVALID_STATUS;

  const items = await roomItems(room, requested);
  return [`*${STATUS_LABELS[requested]} items for ${roomName}*`, '', itemBlock(items)].join('\n');
}

export async function add(room: Room, status: string | undefined, itemWords: string[]): Promise<string> {
  const requested = (status ?? '').trim();
  const itemStatus = isStatus(requested) ? requested : 'todo';
  const words = isStatus(requested) || requested === '' ? itemWords : [requested, ...itemWords];

  const description = words.join(' ').trim();
  if (description === '') return 'Please provide an item to add.';

  const itemDescription = `${description} - ${room.userName}`;
  await insertItem(room, itemDescription, itemStatus);

  return `Item '${itemDescription}' added to ${itemStatus}.`;
}

export async function bulkadd(room: Room, itemWords: string[]): Promise<string> {
  const items = itemWords
    .join(' ')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
  if (items.length === 0) return 'Please provide at least one item to add.';

  for (const item of items) {
    await insertItem(room, `${item} - ${room.userName}`, 'todo');
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
    `UPDATE items SET status = $6 WHERE id = (${NTH_ITEM_IN_STATUS}) RETURNING item_description`,
    [...roomKey(room), STATUSES.indexOf(from), itemPosition - 1, STATUSES.indexOf(to)],
  );
  const item = rows[0];
  if (!item) return `No item exists in status ${from} at position ${itemPosition} to move.`;

  return `Item '${item.item_description}' moved from ${from} to ${to}.`;
}

function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

function toPosition(value: string | number | undefined): number {
  const position = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(position) ? 0 : position;
}

function roomKey(room: Room): string[] {
  return [room.platform, room.workspaceId, room.roomId];
}

async function roomItems(room: Room, status?: Status): Promise<Item[]> {
  const params: (string | number)[] = roomKey(room);
  let sql = 'SELECT item_description, status FROM items WHERE platform = $1 AND workspace_id = $2 AND room_id = $3';

  if (status) {
    params.push(STATUSES.indexOf(status));
    sql += ' AND status = $4';
  }

  const { rows } = await pool.query<Item>(`${sql} ORDER BY id`, params);
  return rows;
}

async function insertItem(room: Room, itemDescription: string, status: Status): Promise<void> {
  const discordIds = room.platform === 'discord' ? [room.userId, room.workspaceId, room.roomId] : [null, null, null];

  await pool.query(
    `INSERT INTO items (platform, workspace_id, room_id, room_name, creator_id, user_id, server_id, channel_id, item_description, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [...roomKey(room), room.roomName, room.userId, ...discordIds, itemDescription, STATUSES.indexOf(status)],
  );
}

function itemBlock(items: Item[]): string {
  const lines = items.map((item, index) => `${index + 1}. ${item.item_description}`);
  if (lines.length === 0) lines.push('No items yet.');

  return ['```', ...lines, '```'].join('\n');
}
