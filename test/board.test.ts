import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { board, descriptions, discord, listInteraction, pool, resetDatabase, room, SITE_URL } from './helpers.js';

beforeEach(resetDatabase);
after(() => pool.end());

const boardLink = (output: string) => output.match(/\[Open the board\]\((\S+)\)/)?.[1];

test('/kanbot list ends with a link to the channel board', async () => {
  const output = await discord.runDiscordCommand(listInteraction(), SITE_URL);
  const { rows } = await pool.query<{ token: string; room_name: string }>('SELECT token, room_name FROM boards');

  assert.equal(rows.length, 1);
  assert.equal(rows[0].room_name, 'general');
  assert.ok(output.endsWith(`\n-# [Open the board](${SITE_URL}/boards/${rows[0].token}) to add cards and drag them around`));
});

test('each channel keeps its own board link', async () => {
  const link = boardLink(await discord.runDiscordCommand(listInteraction(), SITE_URL));

  assert.equal(boardLink(await discord.runDiscordCommand(listInteraction(), SITE_URL)), link);
  assert.notEqual(boardLink(await discord.runDiscordCommand(listInteraction('11'), SITE_URL)), link);
});

test('commands use the order cards were dragged into', async () => {
  await board.add(room(), 'todo', ['First']);
  await board.add(room(), 'todo', ['Second']);
  const [first, second] = (await board.cards(room()))[0].cards;

  await board.moveCard(room(), second.id, 'todo', first.id);

  assert.deepEqual(await descriptions('todo'), ['Second', 'First']);
  assert.match(await board.list(room(), 'todo', discord.formatBoard), /1\. Second\n2\. First/);
  assert.equal(await board.move(room(), 'todo', 1, 'done'), "Item 'Second' moved from todo to done.");
  assert.equal(await board.remove(room(), 'todo', 1), "Item 'First' removed from todo.");
});

test('move puts the item at the bottom of its new status', async () => {
  await board.add(room(), 'todo', ['Next']);
  await board.add(room(), 'done', ['Shipped']);

  await board.move(room(), 'todo', 1, 'done');

  assert.deepEqual(await descriptions('done'), ['Shipped', 'Next']);
});

test('bulkadd appends items in order', async () => {
  await board.add(room(), 'todo', ['Existing']);

  await board.bulkadd(room(), ['Write docs, Ship it']);

  assert.deepEqual(await descriptions('todo'), ['Existing', 'Write docs', 'Ship it']);
});

test('moveCard puts a card above another card, or at the bottom without one', async () => {
  for (const description of ['One', 'Two', 'Three']) await board.add(room(), 'todo', [description]);
  await board.add(room(), 'doing', ['Doing']);
  const [one, two, three] = (await board.cards(room()))[0].cards;

  await board.moveCard(room(), three.id, 'todo', one.id);
  assert.deepEqual(await descriptions('todo'), ['Three', 'One', 'Two']);

  await board.moveCard(room(), two.id, 'doing', null);
  assert.deepEqual(await descriptions('doing'), ['Doing', 'Two']);

  await board.moveCard(room(), three.id, 'todo', 999);
  assert.deepEqual(await descriptions('todo'), ['One', 'Three']);
});

test('the board byline tells web cards from different people apart', async () => {
  await board.addCard(room(), 'todo', 'Plan the raid', 'Riley');
  await board.addCard(room(), 'todo', 'Bring snacks', 'Sam');

  const output = await board.list(room(), undefined, discord.formatBoard);

  assert.match(output, /1\. Plan the raid · Riley\n2\. Bring snacks · Sam/);
  assert.doesNotMatch(output, /Added by/);
});

test('migrating keeps existing items in order and leaves web cards alone', async () => {
  await pool.query(`
    INSERT INTO items (platform, workspace_id, room_id, creator_id, item_description, status)
    VALUES ('discord', '1', '10', '100', 'Old one - brian', 0), ('discord', '1', '10', '100', 'Old two - brian', 0)
  `);
  migrate();
  await board.addCard(room(), 'todo', 'Fix the bug - urgent', null);

  migrate();

  const [todo] = await board.cards(room());
  assert.deepEqual(
    todo.cards.map(({ description, author }) => [description, author]),
    [
      ['Old one', 'brian'],
      ['Old two', 'brian'],
      ['Fix the bug - urgent', null],
    ],
  );
});

function migrate(): void {
  execFileSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../scripts/migrate.ts', import.meta.url))], {
    env: process.env,
    stdio: 'ignore',
  });
}
