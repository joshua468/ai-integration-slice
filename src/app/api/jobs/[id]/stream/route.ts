import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { subscribeToJob } from '@/lib/queue/worker';
import { QueueProgressEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      logs: {
        orderBy: { timestamp: 'asc' },
      },
    },
  });

  if (!job) {
    return new Response(JSON.stringify({ error: 'Job not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 1. Send initial state snapshot immediately
      const initialPayload: QueueProgressEvent = {
        jobId: job.id,
        status: job.status as any,
        progress: job.progress,
        currentStage: job.currentStage,
        result: {
          id: job.id,
          status: job.status as any,
          progress: job.progress,
          currentStage: job.currentStage,
          title: job.title,
          subtitle: job.subtitle,
          summary: job.summary,
          pdfDataUri: job.pdfDataUri,
          confidenceScore: job.confidenceScore,
          promptTokens: job.promptTokens,
          completionTokens: job.completionTokens,
          totalTokens: job.totalTokens,
          estimatedCost: job.estimatedCost,
          processingTimeMs: job.processingTimeMs,
          updatedAt: job.updatedAt.toISOString(),
        },
      };

      controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialPayload)}\n\n`));

      // Send existing logs if any
      if (job.logs && job.logs.length > 0) {
        job.logs.forEach((l) => {
          const logEvent: QueueProgressEvent = {
            jobId: job.id,
            status: job.status as any,
            progress: job.progress,
            currentStage: job.currentStage,
            log: {
              stage: l.stage,
              message: l.message,
              level: l.level as any,
              timestamp: l.timestamp.toISOString(),
            },
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(logEvent)}\n\n`));
        });
      }

      // If job is already completed or failed, we can close after initial burst
      if (job.status === 'COMPLETED' || job.status === 'FAILED') {
        setTimeout(() => {
          try {
            controller.close();
          } catch (e) {}
        }, 1000);
        return;
      }

      // 2. Subscribe to real-time events from background worker
      const unsubscribe = subscribeToJob(id, (event: QueueProgressEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          if (event.status === 'COMPLETED' || event.status === 'FAILED') {
            setTimeout(() => {
              try {
                controller.close();
              } catch (e) {}
            }, 1500);
          }
        } catch (err) {
          console.error('Error sending SSE chunk:', err);
        }
      });

      // Heartbeat interval
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch (e) {
          clearInterval(heartbeat);
          unsubscribe();
        }
      }, 10000);

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
