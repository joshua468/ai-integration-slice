import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enqueueJob } from '@/lib/queue/worker';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const job = await prisma.job.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

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
