type Bucket = { count: number; resetAt: number };

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10); // 1 min
const MAX_REQ = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);

const buckets = new Map<string, Bucket>();

export type RateLimitResult = { allowed: boolean; remaining: number; reset: number };

export function rateLimit(ip: string | null | undefined): RateLimitResult {
  const key = ip || 'unknown';
  const now = Date.now();
  const bucket = buckets.get(key) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + WINDOW_MS;
  }
  bucket.count += 1;
  buckets.set(key, bucket);

  const remaining = Math.max(0, MAX_REQ - bucket.count);
  return { allowed: bucket.count <= MAX_REQ, remaining, reset: bucket.resetAt };
}

/*
// Example Redis-based limiter (for production):
// import { Ratelimit } from '@upstash/ratelimit';
// import { Redis } from '@upstash/redis';
// const redis = new Redis({ url: process.env.UPSTASH_URL!, token: process.env.UPSTASH_TOKEN! });
// export const limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(MAX_REQ, `${WINDOW_MS} ms`) });
// Usage: const { success, remaining, reset } = await limiter.limit(ip)
*/
