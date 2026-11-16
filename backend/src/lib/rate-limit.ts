import { redis } from './redis.js';

// Fixed-window counter in Redis. The Lua script makes increment-and-expire atomic, which is
// what Better Auth's `consume` contract requires.
const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('TTL', KEYS[1]) }`;

export async function consume(key: string, window: number, max: number) {
  let reply: unknown;
  try {
    reply = await redis.eval(CONSUME_SCRIPT, 1, key, window);
  } catch (err) {
    // Rethrow the message only: ioredis errors can carry the AUTH command and its password.
    // eslint-disable-next-line preserve-caught-error -- the cause holds the Redis password
    throw new Error(`rate limit store unavailable: ${(err as Error).message}`);
  }
  const [count, ttl] = reply as [number, number];
  return count > max
    ? { allowed: false, retryAfter: ttl > 0 ? ttl : window }
    : { allowed: true, retryAfter: null };
}
