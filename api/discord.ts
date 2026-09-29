import { waitUntil } from '@vercel/functions';

import {
  APPLICATION_COMMAND,
  CHANNEL_MESSAGE_WITH_SOURCE,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
  DISCORD_MESSAGE_LIMIT,
  editOriginalResponse,
  isValidDiscordRequest,
  PING,
  PONG,
  runDiscordCommand,
  SUPPRESS_EMBEDS,
  type Interaction,
  type MessageData,
} from '../lib/discord.js';
import { beforeDeadline, replyOrFailure } from '../lib/reply.js';

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) console.error('DISCORD_PUBLIC_KEY is not set.');

  if (!publicKey || !isValidDiscordRequest(request.headers, body, publicKey)) {
    return new Response('Invalid request signature', { status: 401 });
  }

  const interaction = JSON.parse(body) as Interaction;
  if (interaction.type === PING) return Response.json({ type: PONG });
  if (interaction.type !== APPLICATION_COMMAND) return new Response('Unsupported interaction', { status: 400 });

  const reply = replyOrFailure(runDiscordCommand(interaction)).then(message);
  const data = await beforeDeadline(reply);
  if (data) return Response.json({ type: CHANNEL_MESSAGE_WITH_SOURCE, data });

  waitUntil(reply.then((late) => editOriginalResponse(interaction, late)).catch(console.error));
  return Response.json({ type: DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });
}

function message(content: string): MessageData {
  return { content: content.slice(0, DISCORD_MESSAGE_LIMIT), allowed_mentions: { parse: [] }, flags: SUPPRESS_EMBEDS };
}
