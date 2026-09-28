import { createHmac, timingSafeEqual } from 'node:crypto';

import * as board from './board.js';
import type { Room } from './board.js';

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
      return board.list(room, args[0]);
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
