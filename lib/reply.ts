// Discord and Slack give up on a command after 3 seconds, which a cold start
// plus the database waking up can come close to. Replies that aren't ready by
// this deadline are acknowledged right away and delivered once they finish.
const REPLY_DEADLINE_MS = 1500;

const FAILED_REPLY = 'Kanbot ran into a problem with that command. Please try again.';

export function replyOrFailure(reply: Promise<string>): Promise<string> {
  return reply.catch((error: unknown) => {
    console.error(error);
    return FAILED_REPLY;
  });
}

export async function beforeDeadline<T>(reply: Promise<T>): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), REPLY_DEADLINE_MS);
  });

  try {
    return await Promise.race([reply, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
