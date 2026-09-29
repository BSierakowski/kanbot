import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';

import type { Card } from '../lib/board.js';
import { board, boardsApi, descriptions, discord, pool, resetDatabase, room, SITE_URL } from './helpers.js';

beforeEach(resetDatabase);
after(() => pool.end());

type Handler = (request: Request) => Promise<Response>;

interface BoardJson {
  name: string | null;
  columns: { status: string; title: string; cards: Card[] }[];
  error?: string;
}

async function call(handler: Handler, query: string, body?: unknown) {
  const method = handler.name;
  const payload = body === undefined || method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  const response = await handler(
    new Request(`${SITE_URL}/api/boards?${query}`, { method, headers: { 'Content-Type': 'application/json' }, body: payload }),
  );
  return { status: response.status, body: (await response.json()) as BoardJson };
}

test('unknown board links are not found', async () => {
  for (const handler of [boardsApi.GET, boardsApi.POST, boardsApi.PATCH, boardsApi.DELETE]) {
    assert.equal((await call(handler, 'token=nope&card=1', { status: 'todo', description: 'Hi' })).status, 404);
  }
  assert.equal((await call(boardsApi.GET, '')).status, 404);
});

test('the board lists columns in board order with each card author', async () => {
  const token = await board.boardToken(room());
  await board.add(room(), 'doing', ['Second']);
  await board.add(room(), 'doing', ['First']);
  const [second, first] = (await board.cards(room()))[1].cards;
  await board.moveCard(room(), first.id, 'doing', second.id);

  const { status, body } = await call(boardsApi.GET, `token=${token}`);

  assert.equal(status, 200);
  assert.equal(body.name, 'general');
  assert.deepEqual(
    body.columns.map((column) => [column.status, column.title]),
    [
      ['todo', '📋 Todo'],
      ['doing', '🔨 Doing'],
      ['done', '✅ Done'],
    ],
  );
  assert.deepEqual(body.columns[1].cards, [
    { id: first.id, description: 'First', author: 'brian' },
    { id: second.id, description: 'Second', author: 'brian' },
  ]);
});

test('adding a card shows up in /kanbot list', async () => {
  const token = await board.boardToken(room());

  const { status, body } = await call(boardsApi.POST, `token=${token}`, {
    status: 'doing',
    description: '  Write   docs ',
    author: ' Sam ',
  });

  assert.equal(status, 200);
  assert.deepEqual(
    body.columns[1].cards.map(({ description, author }) => [description, author]),
    [['Write docs', 'Sam']],
  );
  assert.match(await board.list(room(), 'doing', discord.formatBoard), /1\. Write docs\n/);
});

test('cards added without a name have no author', async () => {
  const token = await board.boardToken(room());

  const { body } = await call(boardsApi.POST, `token=${token}`, { status: 'todo', description: 'Anonymous idea', author: '' });

  assert.equal(body.columns[0].cards[0].author, null);
});

test('invalid cards are rejected', async () => {
  const token = await board.boardToken(room());
  const add = (body: unknown) => call(boardsApi.POST, `token=${token}`, body);

  assert.equal((await add({ status: 'todo', description: '   ' })).status, 422);
  assert.equal((await add({ status: 'later', description: 'Soon' })).body.error, 'Status must be todo, doing, or done.');
  assert.equal((await add({ status: 'todo', description: 'x'.repeat(1901) })).status, 422);
  assert.equal((await add({ status: 'todo', description: 'Hi', author: 'x'.repeat(81) })).status, 422);
  assert.equal((await add('not json')).status, 400);
  assert.deepEqual(await descriptions('todo'), []);
});

test('moving a card shows up in /kanbot list', async () => {
  const token = await board.boardToken(room());
  await board.add(room(), 'todo', ['One']);
  await board.add(room(), 'todo', ['Two']);
  await board.add(room(), 'doing', ['Three']);
  const [[one], [three]] = (await board.cards(room())).map((column) => column.cards);

  const { status } = await call(boardsApi.PATCH, `token=${token}&card=${one.id}`, { status: 'doing', before_id: three.id });

  assert.equal(status, 200);
  const output = await board.list(room(), undefined, discord.formatBoard);
  assert.match(output, /### 📋 Todo · 1\n1\. Two\n/);
  assert.match(output, /### 🔨 Doing · 2\n1\. One\n2\. Three\n/);
});

test('moving a card to the bottom of a column', async () => {
  const token = await board.boardToken(room());
  await board.add(room(), 'done', ['Done']);
  await board.add(room(), 'todo', ['Todo']);
  const [[todo]] = (await board.cards(room())).map((column) => column.cards);

  await call(boardsApi.PATCH, `token=${token}&card=${todo.id}`, { status: 'done', before_id: null });

  assert.deepEqual(await descriptions('done'), ['Done', 'Todo']);
});

test('moving a card needs a valid status', async () => {
  const token = await board.boardToken(room());
  await board.add(room(), 'todo', ['Stay put']);
  const [[card]] = (await board.cards(room())).map((column) => column.cards);

  assert.equal((await call(boardsApi.PATCH, `token=${token}&card=${card.id}`, { status: 'archived' })).status, 422);
  assert.deepEqual(await descriptions('todo'), ['Stay put']);
});

test('deleting a card', async () => {
  const token = await board.boardToken(room());
  await board.add(room(), 'todo', ['Remove me']);
  const [[card]] = (await board.cards(room())).map((column) => column.cards);

  const { status, body } = await call(boardsApi.DELETE, `token=${token}&card=${card.id}`);

  assert.equal(status, 200);
  assert.deepEqual(body.columns[0].cards, []);
});

test('cards from other channels cannot be changed', async () => {
  const token = await board.boardToken(room());
  await board.add(room('11'), 'todo', ['Not yours']);
  const [[card]] = (await board.cards(room('11'))).map((column) => column.cards);

  assert.equal((await call(boardsApi.PATCH, `token=${token}&card=${card.id}`, { status: 'done' })).status, 404);
  assert.equal((await call(boardsApi.DELETE, `token=${token}&card=${card.id}`)).status, 404);
  assert.deepEqual(await descriptions('todo', '11'), ['Not yours']);
});
