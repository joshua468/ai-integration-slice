import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enqueueJob } from '@/lib/queue/worker';
import { config } from '@/lib/config';
import { rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Existence is checked BEFORE the meter. A 404 costs one indexed lookup;
    // metering first let a caller burn the retry budget on ids that do not
    // exist, starving a legitimate user behind the same IP of a paid-model
    // endpoint. Only a request that could actually do the work consumes quota.
    const job = await prisma.job.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Retry re-runs the full analysis pipeline, so it is metered at the same
    // RATE as an upload (15 / 60s). Note this is a SEPARATE bucket, not a shared
    // pool: the label 'retry' keys its own row, so an exhausted retry budget
    // leaves the upload budget untouched and vice versa. That is deliberate -
    // retry must not be usable to bypass the upload cap.
    //
    // Without this meter the endpoint was the cheapest way to trigger a paid
    // model call: a job id in a loop, no upload required.
    const tooMany = await rateLimitResponse(req, config.rateLimit.retry.max, config.rateLimit.retry.windowMs, 'retry');
    if (tooMany) return tooMany;

    // Reset status to QUEUED
    await prisma.job.update({
      where: { id },
      data: {
        status: 'QUEUED',
        progress: 5,
        currentStage: 'Retrying job...',
        errorMessage: null,
      },
    });

    await prisma.jobLog.create({
      data: {
        jobId: id,
        stage: 'RETRY',
        message: 'Manual retry initiated by user.',
        level: 'info',
      },
    });

    enqueueJob(id);

    return NextResponse.json({ success: true, message: 'Retry enqueued' });
  } catch (error: any) {
    console.error('Error retrying job:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to retry job' },
      { status: 500 }
    );
  }
}
