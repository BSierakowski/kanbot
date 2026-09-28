import {
  APPLICATION_COMMAND,
  CHANNEL_MESSAGE_WITH_SOURCE,
  isValidDiscordRequest,
  PING,
  PONG,
  runDiscordCommand,
  type Interaction,
} from '../lib/discord.js';

const DISCORD_MESSAGE_LIMIT = 2000;

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

  const content = await runDiscordCommand(interaction);

  return Response.json({
    type: CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: content.slice(0, DISCORD_MESSAGE_LIMIT), allowed_mentions: { parse: [] } },
  });
}
