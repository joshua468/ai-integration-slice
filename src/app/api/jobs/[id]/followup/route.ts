import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enqueueFollowUp } from '@/lib/queue/worker';
import { FollowUpAction } from '@/lib/types';
import { config } from '@/lib/config';
import { rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const ALLOWED_ACTIONS: FollowUpAction[] = ['summarise'];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tooMany = await rateLimitResponse(req, config.rateLimit.followUp.max, config.rateLimit.followUp.windowMs, 'follow-up');
    if (tooMany) return tooMany;

    const { id: jobId } = await params;
    const job = await prisma.job.findUnique({ where: { id: jobId } });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    if (job.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: `Follow-up requires a completed job (current status: ${job.status}).` },
        { status: 409 }
      );
    }
    if (!job.structuredData) {
      return NextResponse.json(
        { error: 'Job completed but has no validated structured data to summarise.' },
        { status: 409 }
      );
    }

    let body: any = {};
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await req.json();
    }

    const action = (body.action as FollowUpAction) || 'summarise';
    if (!ALLOWED_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `Unsupported follow-up action "${action}". Allowed: ${ALLOWED_ACTIONS.join(', ')}.` },
        { status: 400 }
      );
    }

    const modelName = (body.modelName as string) || config.provider.gemini.followUpModel;
    const modelProvider = (body.modelProvider as string) || 'gemini';

    const followUp = await prisma.followUp.create({
      data: {
        jobId,
        action,
        modelName,
        modelProvider,
        status: 'PENDING',
        attempts: 0,
      },
    });

    enqueueFollowUp(followUp.id);

    return NextResponse.json(
      {
        id: followUp.id,
        jobId: followUp.jobId,
        action: followUp.action,
        status: followUp.status,
        attempts: followUp.attempts,
        createdAt: followUp.createdAt,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating follow-up:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create follow-up' },
      { status: 500 }
    );
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: jobId } = await params;
    const followUps = await prisma.followUp.findMany({
      where: { jobId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      followUps: followUps.map((f) => ({
        id: f.id,
        action: f.action,
        status: f.status,
        attempts: f.attempts,
        errorMessage: f.errorMessage,
        output: f.output ? JSON.parse(f.output) : null,
        promptTokens: f.promptTokens,
        completionTokens: f.completionTokens,
        totalTokens: f.totalTokens,
        estimatedCost: f.estimatedCost,
        processingTimeMs: f.processingTimeMs,
        createdAt: f.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching follow-ups:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch follow-ups' },
      { status: 500 }
    );
  }
}