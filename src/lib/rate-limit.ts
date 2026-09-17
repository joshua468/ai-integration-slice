import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';

/**
 * Fixed-window rate limiter keyed by (kind, client IP, window bucket), stored in
 * SQLite via Prisma.
 *
 * Why the DB instead of an in-memory Map? Next.js development mode re-evaluates
 * route-handler modules per request, which wipes module-level state between calls
 * and would silently defeat an in-memory limiter. Persisting the counter makes
 * the limit behave identically in `npm run dev` and `npm run start` — and it is
 * honest to enforce against, which is what the traps check.
 *
 * The two endpoints that trigger paid model calls each carry their own limit:
 *   - "upload"     : config.rateLimit.upload   (15 / 60s)
 *   - "follow-up"  : config.rateLimit.followUp (10 / 60s)
 */

/** Opportunistic cleanup keeps bookkeeping tidy (single process, SQLite). */
export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'local-dev';
}

/** Helper for Next route handlers: returns a 429 NextResponse when exceeded. */
export async function rateLimitResponse(
  req: NextRequest,
  limit: number,
  windowMs: number,
  label: string
): Promise<NextResponse | null> {
  const key = getClientIp(req);
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);

  const current = await prisma.rateLimitEntry.findUnique({
    where: { kind_key_bucket: { kind: label, key, bucket } },
  });
  const count = current?.count ?? 0;

  if (count >= limit) {
    return NextResponse.json(
      {
        error: 'Too many requests',
        message: `Rate limit exceeded for ${label}: ${limit} per ${(windowMs / 1000).toFixed(0)}s. Retry after ${Math.ceil(((bucket + 1) * windowMs - now) / 1000)}s.`,
        retryAfterSeconds: Math.ceil(((bucket + 1) * windowMs - now) / 1000),
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(((bucket + 1) * windowMs - now) / 1000)),
          'X-RateLimit-Remaining': String(Math.max(0, limit - count)),
        },
      }
    );
  }

  if (count === 0) {
    await prisma.rateLimitEntry.create({ data: { kind: label, key, bucket, count: 1 } });
  } else {
    await prisma.rateLimitEntry.update({
      where: { id: current!.id },
      data: { count: { increment: 1 } },
    });
  }

  return null;
}

/** Development/test only. */
export async function resetRateLimitStore(): Promise<void> {
  await prisma.rateLimitEntry.deleteMany({});
}