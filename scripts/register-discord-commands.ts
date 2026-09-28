import { KANBOT_COMMAND } from '../lib/discord.js';

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) throw new Error('DISCORD_BOT_TOKEN is not set.');

async function discord(method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Discord ${method} ${path} failed with ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

const application = (await discord('GET', '/applications/@me')) as { id: string; name: string; verify_key: string };
await discord('PUT', `/applications/${application.id}/commands`, [KANBOT_COMMAND]);

console.log(`Registered /kanbot for ${application.name} (${application.id}).`);
console.log(`DISCORD_PUBLIC_KEY for this app: ${application.verify_key}`);
