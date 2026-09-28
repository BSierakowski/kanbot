import { isValidSlackRequest, runSlackCommand } from '../lib/slack.js';

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) console.error('SLACK_SIGNING_SECRET is not set.');

  if (!signingSecret || !isValidSlackRequest(request.headers, body, signingSecret)) {
    return new Response('Invalid Slack signature', { status: 401 });
  }

  const text = await runSlackCommand(new URLSearchParams(body));

  return Response.json({ response_type: 'in_channel', text });
}
