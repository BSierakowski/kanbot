import { waitUntil } from '@vercel/functions';

import { beforeDeadline, replyOrFailure } from '../lib/reply.js';
import { isValidSlackRequest, postDelayedResponse, runSlackCommand } from '../lib/slack.js';

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) console.error('SLACK_SIGNING_SECRET is not set.');

  if (!signingSecret || !isValidSlackRequest(request.headers, body, signingSecret)) {
    return new Response('Invalid Slack signature', { status: 401 });
  }

  const params = new URLSearchParams(body);
  const reply = replyOrFailure(runSlackCommand(params));
  const text = await beforeDeadline(reply);
  if (text !== undefined) return Response.json({ response_type: 'in_channel', text });

  const responseUrl = params.get('response_url') ?? '';
  waitUntil(reply.then((late) => postDelayedResponse(responseUrl, late)).catch(console.error));
  return Response.json({ response_type: 'in_channel' });
}
