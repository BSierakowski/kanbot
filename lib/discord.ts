import { createPublicKey, verify } from 'node:crypto';

import * as board from './board.js';
import type { Board, BoardItem, Room } from './board.js';

export const PING = 1;
export const APPLICATION_COMMAND = 2;
export const PONG = 1;
export const CHANNEL_MESSAGE_WITH_SOURCE = 4;
export const DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5;
export const SUPPRESS_EMBEDS = 1 << 2;
export const DISCORD_MESSAGE_LIMIT = 2000;

const MAX_ITEM_LENGTH = 1000;

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
  data?: { id: string; name: string; options?: CommandOption[] };
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
  flags: number;
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
      return board.list(room, text('status'), (listed) => formatBoard(listed, interaction.data?.id));
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

export function formatBoard({ roomId, roomName, sections }: Board, commandId?: string): string {
  const command = (name: string) => (commandId ? `</kanbot ${name}:${commandId}>` : `\`/kanbot ${name}\``);
  const fullBoard = sections.length > 1;
  const items = sections.flatMap((section) => section.items);
  const soleAuthor = new Set(items.map((item) => item.creatorId)).size === 1 ? author(items[0]) : undefined;
  const shown = sections.map((section) => ({
    section,
    start: fullBoard && section.status === 'done' ? Math.max(0, section.items.length - board.DONE_SHOWN_ON_FULL_BOARD) : 0,
    end: section.items.length,
  }));

  const render = () => {
    const lines = [`## Kanbot board for ${roomName ? `#${escapeMarkdown(roomName)}` : `<#${roomId}>`}`];

    for (const { section, start, end } of shown) {
      const { title, empty } = board.SECTIONS[section.status];
      const seeAll = fullBoard ? `, see ${command('list')} ${section.status}` : '';
      lines.push(`### ${title} · ${section.items.length}`);

      if (section.items.length === 0) {
        lines.push(`-# ${empty}`);
        continue;
      }

      if (start > 0) lines.push(`-# …${start} earlier${seeAll}`);
      for (const item of section.items.slice(start, end)) {
        const byline = soleAuthor === undefined && author(item) ? ` · ${author(item)}` : '';
        lines.push(`${item.position}. ${escapeMarkdown(truncate(item.description))}${byline}`);
      }
      // Discord folds a line that directly follows a list item into that item, so each list ends with a blank line.
      lines.push('');
      if (end < section.items.length) lines.push(`-# …and ${section.items.length - end} more${seeAll}`);
    }

    const hint =
      items.length === 0 ? `Add one with ${command('add')}` : `Use the numbers with ${command('move')} or ${command('remove')}`;
    if (lines.at(-1) !== '') lines.push('');
    lines.push(`-# ${soleAuthor ? `Added by ${soleAuthor} · ` : ''}${hint}`);
    return lines.join('\n');
  };

  let content = render();
  while (content.length > DISCORD_MESSAGE_LIMIT) {
    const longest = shown.reduce((most, next) => (next.end - next.start > most.end - most.start ? next : most));
    if (longest.end === longest.start) break;

    if (longest.section.status === 'done') longest.start += 1;
    else longest.end -= 1;
    content = render();
  }

  return content;
}

function author(item: BoardItem): string {
  if (item.creatorId) return `<@${item.creatorId}>`;
  return item.creatorName ? escapeMarkdown(item.creatorName) : '';
}

function truncate(text: string): string {
  const characters = [...text];
  return characters.length > MAX_ITEM_LENGTH ? `${characters.slice(0, MAX_ITEM_LENGTH - 1).join('')}…` : text;
}

function escapeMarkdown(text: string): string {
  const escaped = text
    .split(/(https?:\/\/\S+)/)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(/[\\*_~`|[\]]/g, '\\$&')))
    .join('');

  return escaped.replace(/^[#>-]/, '\\$&').replace(/^(\d+)\./, '$1\\.');
}
