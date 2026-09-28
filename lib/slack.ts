import { createHmac, timingSafeEqual } from 'node:crypto';

import * as board from './board.js';
import type { Board, Room } from './board.js';

const MAX_REQUEST_AGE_SECONDS = 60 * 5;

export function isValidSlackRequest(headers: Headers, body: string, signingSecret: string): boolean {
  const timestamp = headers.get('x-slack-request-timestamp');
  const signature = headers.get('x-slack-signature');
  if (!timestamp || !signature) return false;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > MAX_REQUEST_AGE_SECONDS) return false;

  const expected = Buffer.from(
    `v0=${createHmac('sha256', signingSecret).update(`v0:${timestamp}:${body}`).digest('hex')}`,
  );
  const actual = Buffer.from(signature);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function postDelayedResponse(responseUrl: string, text: string): Promise<void> {
  const response = await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response_type: 'in_channel', text }),
  });

  if (!response.ok) {
    throw new Error(`Slack rejected the delayed response with ${response.status}: ${await response.text()}`);
  }
}

export async function runSlackCommand(params: URLSearchParams): Promise<string> {
  const room: Room = {
    platform: 'slack',
    workspaceId: params.get('team_id') ?? '',
    roomId: params.get('channel_id') ?? '',
    roomName: `#${params.get('channel_name') ?? ''}`,
    userId: params.get('user_id') ?? '',
    userName: params.get('user_name') ?? '',
  };

  const [first = '', ...args] = (params.get('text') ?? '').trim().split(/\s+/);
  const command = first.toLowerCase();

  switch (command) {
    case '':
    case 'help':
      return board.HELP_TEXT;
    case 'list':
      return board.list(room, args[0], formatBoard);
    case 'add':
      return board.add(room, args[0], args.slice(1));
    case 'bulkadd':
      return board.bulkadd(room, args);
    case 'remove':
      return board.remove(room, args[0], args[1]);
    case 'move':
      return board.move(room, args[0], args[1], args[2]);
    default:
      return `Unknown command '${command}'.\n\n${board.HELP_TEXT}`;
  }
}

export function formatBoard({ roomId, roomName, sections }: Board): string {
  const fullBoard = sections.length > 1;
  const items = sections.flatMap((section) => section.items);
  const soleAuthor = new Set(items.map((item) => item.creatorName)).size === 1 ? (items[0].creatorName ?? '') : undefined;
  const lines = [`*Kanbot board for ${roomName ?? roomId}*`];

  for (const section of sections) {
    const { title, empty } = board.SECTIONS[section.status];
    const start = fullBoard && section.status === 'done' ? Math.max(0, section.items.length - board.DONE_SHOWN_ON_FULL_BOARD) : 0;
    lines.push('', `*${title} · ${section.items.length}*`);

    if (section.items.length === 0) lines.push(`_${empty}_`);
    if (start > 0) lines.push(`…${start} earlier, see \`/kanbot list ${section.status}\``);
    for (const item of section.items.slice(start)) {
      const byline = soleAuthor === undefined && item.creatorName ? ` · ${item.creatorName}` : '';
      lines.push(`${item.position}. ${withoutMentions(item.description)}${byline}`);
    }
  }

  const hint = items.length === 0 ? 'Add one with `/kanbot add`' : 'Use the numbers with `/kanbot move` or `/kanbot remove`';
  lines.push('', `${soleAuthor ? `Added by ${soleAuthor} · ` : ''}${hint}`);
  return lines.join('\n');
}

// Slack sends command text already in its markup (&amp;, <@U123>, <https://...>), so items are
// echoed as they are, except mentions, which would notify people every time the board is listed.
function withoutMentions(text: string): string {
  return text.replace(/<([@!])/g, '&lt;$1');
}
