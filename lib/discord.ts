import { createPublicKey, verify } from 'node:crypto';

import * as board from './board.js';
import type { Room } from './board.js';

export const PING = 1;
export const APPLICATION_COMMAND = 2;
export const PONG = 1;
export const CHANNEL_MESSAGE_WITH_SOURCE = 4;
export const DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5;

const SUB_COMMAND = 1;
const STRING = 3;
const INTEGER = 4;
const GUILD = 0;
const GUILD_INSTALL = 0;

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

interface User {
  id: string;
  username: string;
}

interface CommandOption {
  name: string;
  type: number;
  value?: string | number;
  options?: CommandOption[];
}

export interface Interaction {
  type: number;
  application_id: string;
  token: string;
  data?: { name: string; options?: CommandOption[] };
  guild_id?: string;
  channel?: { id: string; name?: string };
  channel_id?: string;
  member?: { user: User };
  user?: User;
}

const statusChoices = board.STATUSES.map((status) => ({ name: status, value: status }));

export const KANBOT_COMMAND = {
  name: 'kanbot',
  description: 'Shared kanban board for this channel',
  contexts: [GUILD],
  integration_types: [GUILD_INSTALL],
  options: [
    {
      type: SUB_COMMAND,
      name: 'list',
      description: 'Show the board, or the items in one status',
      options: [{ type: STRING, name: 'status', description: 'Only show this status', choices: statusChoices }],
    },
    {
      type: SUB_COMMAND,
      name: 'add',
      description: 'Add an item',
      options: [
        { type: STRING, name: 'item', description: 'The item to add', required: true, max_length: 1900 },
        { type: STRING, name: 'status', description: 'Status for the item (defaults to todo)', choices: statusChoices },
      ],
    },
    {
      type: SUB_COMMAND,
      name: 'bulkadd',
      description: 'Add several items to todo',
      options: [
        { type: STRING, name: 'items', description: 'Items separated by commas', required: true, max_length: 1900 },
      ],
    },
    {
      type: SUB_COMMAND,
      name: 'remove',
      description: 'Remove an item',
      options: [
        { type: STRING, name: 'status', description: 'Status the item is in', required: true, choices: statusChoices },
        { type: INTEGER, name: 'position', description: 'Position of the item in that status', required: true, min_value: 1 },
      ],
    },
    {
      type: SUB_COMMAND,
      name: 'move',
      description: 'Move an item to another status',
      options: [
        {
          type: STRING,
          name: 'current_status',
          description: 'Status the item is in',
          required: true,
          choices: statusChoices,
        },
        { type: INTEGER, name: 'position', description: 'Position of the item in that status', required: true, min_value: 1 },
        { type: STRING, name: 'new_status', description: 'Status to move it to', required: true, choices: statusChoices },
      ],
    },
    { type: SUB_COMMAND, name: 'help', description: 'Show how to use Kanbot' },
  ],
};

export function isValidDiscordRequest(headers: Headers, body: string, publicKey: string): boolean {
  const signature = headers.get('x-signature-ed25519');
  const timestamp = headers.get('x-signature-timestamp');
  if (!signature || !timestamp) return false;

  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKey, 'hex')]),
      format: 'der',
      type: 'spki',
    });

    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

export interface MessageData {
  content: string;
  allowed_mentions: { parse: string[] };
}

export async function editOriginalResponse(interaction: Interaction, data: MessageData): Promise<void> {
  const response = await fetch(
    `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
  );

  if (!response.ok) {
    throw new Error(`Discord rejected the deferred reply with ${response.status}: ${await response.text()}`);
  }
}

export async function runDiscordCommand(interaction: Interaction): Promise<string> {
  const user = interaction.member?.user ?? interaction.user;
  const room: Room = {
    platform: 'discord',
    workspaceId: interaction.guild_id ?? '',
    roomId: interaction.channel?.id ?? interaction.channel_id ?? '',
    roomName: interaction.channel?.name ?? null,
    userId: user?.id ?? '',
    userName: user?.username ?? '',
  };

  const subcommand = interaction.data?.options?.[0];
  const options = new Map(subcommand?.options?.map((option) => [option.name, option.value] as const));
  const text = (name: string) => options.get(name)?.toString();

  switch (subcommand?.name) {
    case 'list':
      return board.list(room, text('status'));
    case 'add':
      return board.add(room, text('status'), [text('item') ?? '']);
    case 'bulkadd':
      return board.bulkadd(room, [text('items') ?? '']);
    case 'remove':
      return board.remove(room, text('status'), options.get('position'));
    case 'move':
      return board.move(room, text('current_status'), options.get('position'), text('new_status'));
    default:
      return board.HELP_TEXT;
  }
}
