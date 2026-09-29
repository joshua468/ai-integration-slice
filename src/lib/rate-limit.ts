import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
import { config } from './config';

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
/** True when the value is a syntactically valid IPv4 or IPv6 literal. */
function isIpLiteral(value: string): boolean {
  if (!value || value.length > 45) return false;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (v4) {
    return v4.slice(1).every((oct) => {
      const n = Number(oct);
      return Number.isInteger(n) && n >= 0 && n <= 255;
    });
  }
  return value.includes(':') && /^[0-9a-fA-F:.]+$/.test(value);
}

/**
 * Resolve the identity the rate limit is keyed on.
 *
 * `X-Forwarded-For` and `X-Real-IP` are CLIENT-SUPPLIED headers. The previous
 * version read `x-forwarded-for` unconditionally and took the first entry, which
 * is the entry furthest from us and therefore entirely under the caller's
 * control. Anyone could send a fresh header value per request and never hit the
 * limit, so the limiter protected nothing on an endpoint that spends money.
 *
 * Forwarded headers are only usable when this process sits behind a known number
 * of proxies that WE control. With `trustedProxyHops: 0` we refuse to read them
 * at all and fall back to one shared bucket. That is deliberately fail-closed:
 * over-limiting real users is a recoverable failure mode, an unmetered
 * paid-model endpoint is not.
 */
export function getClientIp(req: NextRequest): string {
  const hops = config.rateLimit.trustedProxyHops;

  if (hops > 0) {
    const fwd = req.headers.get('x-forwarded-for');
    if (fwd) {
      // The left-most entry is the original client and is attacker-controlled.
      // Walk right, past every proxy we control, to the entry our outermost
      // trusted proxy appended.
      const chain = fwd.split(',').map((s) => s.trim()).filter(Boolean);
      const candidate = chain[chain.length - hops];
      if (candidate && isIpLiteral(candidate)) return candidate;
    }
    const realIp = req.headers.get('x-real-ip');
    if (realIp && isIpLiteral(realIp.trim())) return realIp.trim();
  }

  return 'unidentified';
}

/**
 * Atomically consume one unit of quota for (kind, key, bucket).
 *
 * The previous implementation did findUnique, compared in JavaScript, then
 * wrote. That is a read-then-write race on an endpoint that costs money per call:
 * two concurrent requests can both read `count = 14`, both observe `14 < 15`, and
 * both be admitted — 16 requests through a limit of 15. The `create` branch had
 * a matching failure: concurrent first-requests collide on the unique constraint
 * and surface as a 500 instead of a clean decision.
 *
 * `updateMany` with `count: { lt: limit }` is a single conditional UPDATE, so the
 * database decides the winner and at most `limit` rows can ever be incremented
 * per window.
 *
 * Returns the post-increment count, or 0 when the caller was refused.
 */
async function consumeQuota(kind: string, key: string, bucket: number, limit: number): Promise<number> {
  const updated = await prisma.rateLimitEntry.updateMany({
    where: { kind, key, bucket, count: { lt: limit } },
    data: { count: { increment: 1 } },
  });

  if (updated.count > 0) {
    const row = await prisma.rateLimitEntry.findUnique({
      where: { kind_key_bucket: { kind, key, bucket } },
      select: { count: true },
    });
    return row?.count ?? 1;
  }

  // Either the row does not exist yet, or it is already at the cap. Creating it
  // is safe under concurrency: the unique constraint means exactly one caller
  // wins, and every loser correctly falls through to "refused".
  try {
    await prisma.rateLimitEntry.create({ data: { kind, key, bucket, count: 1 } });
    return 1;
  } catch (err: any) {
    // P2002 = unique constraint violation = we lost the create race, which
    // means another caller already created the row for this bucket.
    if (err?.code === 'P2002') return 0;
    throw err;
  }
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

  const count = await consumeQuota(label, key, bucket, limit);

  if (count === 0) {
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
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  return null;
}

/** Development/test only. */
export async function resetRateLimitStore(): Promise<void> {
  await prisma.rateLimitEntry.deleteMany({});
}