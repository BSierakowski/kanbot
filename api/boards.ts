import * as board from '../lib/board.js';
import type { BoardRoom } from '../lib/board.js';

const MAX_CARD_LENGTH = 1900;
const MAX_AUTHOR_LENGTH = 80;
const MAX_ID = 2 ** 31 - 1;
const INVALID_STATUS = 'Status must be todo, doing, or done.';

export async function GET(request: Request): Promise<Response> {
  const room = await findRoom(request);
  if (!room) return boardNotFound();

  return boardResponse(room);
}

export async function POST(request: Request): Promise<Response> {
  const room = await findRoom(request);
  if (!room) return boardNotFound();

  const body = await jsonBody(request);
  if (!body) return error(400, 'Send the card as JSON.');

  const status = String(body.status);
  const description = singleLine(body.description);
  const author = singleLine(body.author);
  if (!board.isStatus(status)) return error(422, INVALID_STATUS);
  if (description === '') return error(422, 'Please provide an item to add.');
  if (description.length > MAX_CARD_LENGTH) return error(422, `Cards can be at most ${MAX_CARD_LENGTH} characters.`);
  if (author.length > MAX_AUTHOR_LENGTH) return error(422, `Names can be at most ${MAX_AUTHOR_LENGTH} characters.`);

  await board.addCard(room, status, description, author || null);
  return boardResponse(room);
}

export async function PATCH(request: Request): Promise<Response> {
  const room = await findRoom(request);
  if (!room) return boardNotFound();

  const body = await jsonBody(request);
  if (!body) return error(400, 'Send the move as JSON.');

  const status = String(body.status);
  if (!board.isStatus(status)) return error(422, INVALID_STATUS);

  const id = cardId(request);
  const beforeId = typeof body.before_id === 'number' ? body.before_id : null;
  if (id === undefined || !(await board.moveCard(room, id, status, beforeId))) return cardNotFound();

  return boardResponse(room);
}

export async function DELETE(request: Request): Promise<Response> {
  const room = await findRoom(request);
  if (!room) return boardNotFound();

  const id = cardId(request);
  if (id === undefined || !(await board.deleteCard(room, id))) return cardNotFound();

  return boardResponse(room);
}

async function findRoom(request: Request): Promise<BoardRoom | undefined> {
  const token = new URL(request.url).searchParams.get('token');
  return token ? board.findBoard(token) : undefined;
}

function cardId(request: Request): number | undefined {
  const id = Number(new URL(request.url).searchParams.get('card'));
  return Number.isInteger(id) && id > 0 && id <= MAX_ID ? id : undefined;
}

async function jsonBody(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function singleLine(value: unknown): string {
  return typeof value === 'string' ? value.trim().split(/\s+/).join(' ') : '';
}

async function boardResponse(room: BoardRoom): Promise<Response> {
  return Response.json(
    { name: room.roomName, columns: await board.cards(room) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

function boardNotFound(): Response {
  return error(404, "This board link doesn't work anymore.");
}

function cardNotFound(): Response {
  return error(404, 'That card is no longer on the board.');
}

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
