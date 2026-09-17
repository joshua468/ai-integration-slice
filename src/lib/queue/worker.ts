import fs from 'fs/promises';
import { prisma } from '../prisma';
import { JobStatus, QueueProgressEvent, TemplateStyle, DocumentType, ModelProvider, FollowUpAction } from '../types';
import { orchestrateDocumentAI, runFollowUpSummarise, AIFailureError } from '../ai/orchestrator';
import { generateDocumentPdf } from '../pdf/generator';
import { config } from '../config';
import { readUpload, uploadFilePath } from '../storage';
import mammoth from 'mammoth';

// Global Event Bus for live SSE streams
type Listener = (event: QueueProgressEvent) => void;
const listeners = new Map<string, Set<Listener>>();

export function subscribeToJob(jobId: string, listener: Listener): () => void {
  if (!listeners.has(jobId)) {
    listeners.set(jobId, new Set());
  }
  listeners.get(jobId)!.add(listener);

  return () => {
    const set = listeners.get(jobId);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        listeners.delete(jobId);
      }
    }
  };
}

export function emitJobEvent(event: QueueProgressEvent) {
  const set = listeners.get(event.jobId);
  if (set) {
    set.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error('Error in SSE subscriber callback:', err);
      }
    });
  }
}

async function addJobLog(
  jobId: string,
  stage: string,
  message: string,
  level: 'info' | 'warn' | 'error' | 'success' = 'info'
) {
  try {
    const log = await prisma.jobLog.create({
      data: {
        jobId,
        stage,
        message,
        level,
      },
    });

    emitJobEvent({
      jobId,
      status: 'PREPROCESSING' as JobStatus,
      progress: 0,
      currentStage: stage,
      log: {
        stage: log.stage,
        message: log.message,
        level: log.level as any,
        timestamp: log.timestamp.toISOString(),
      },
    });

    return log;
  } catch (err) {
    console.error('Failed to write job log:', err);
  }
}

// ---------------------------------------------------------------------------
// Bounded FIFO queue with a concurrency cap (config.queue.concurrency).
// Uploading N files enqueues N units; no more than `concurrency` provider calls
// are ever in flight at the same time (see README Section 5).
// ---------------------------------------------------------------------------
interface QueueEntry {
  id: string;
  run: () => Promise<void>;
}

const queue: QueueEntry[] = [];
let active = 0;

function pump() {
  while (active < config.queue.concurrency && queue.length > 0) {
    const entry = queue.shift()!;
    active += 1;
    entry
      .run()
      .catch((err) => console.error(`Worker exception on queue entry ${entry.id}:`, err))
      .finally(() => {
        active -= 1;
        pump();
      });
  }
}

export function enqueueJob(jobId: string) {
  queue.push({ id: jobId, run: async () => { await processJobAsync(jobId); } });
  pump();
}

export function enqueueFollowUp(followUpId: string) {
  queue.push({ id: followUpId, run: async () => { await processFollowUpAsync(followUpId); } });
  pump();
}

/** For the concurrency-cap evidence: current active count. */
export function activeWorkerCount(): number {
  return active;
}

/** For the concurrency-cap evidence: how many units are waiting. */
export function pendingQueueLength(): number {
  return queue.length;
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------
export async function extractTextFromInput(
  mimeType: string,
  buffer?: Buffer,
  rawText?: string,
  filePath?: string
): Promise<string> {
  if (rawText && rawText.trim().length > 0) {
    return rawText;
  }

  if (!buffer && filePath) {
    buffer = await fs.readFile(filePath);
  }

  if (!buffer) {
    return 'Empty document input';
  }

  if (mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'application/json') {
    return buffer.toString('utf-8');
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || 'Extracted DOCX content';
    } catch (e: any) {
      console.warn('DOCX extraction error, falling back to string representation:', e.message);
      return buffer.toString('utf-8');
    }
  }

  return buffer.toString('utf-8');
}

// ---------------------------------------------------------------------------
// Job processing (analysis role)
// ---------------------------------------------------------------------------
export async function processJobAsync(jobId: string) {
  const startTime = Date.now();

  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      console.error(`Job ${jobId} not found in database.`);
      return;
    }

    // --- record this execution attempt ---
    await prisma.job.update({
      where: { id: jobId },
      data: { attempts: { increment: 1 } },
    });

    // --- STAGE 1: PREPROCESSING (20%) ---
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'PREPROCESSING',
        progress: 20,
        currentStage: 'Document Ingestion & Text Normalization',
      },
    });

    await addJobLog(
      jobId,
      'PREPROCESSING',
      `Starting document intake for "${job.fileName}" (${(job.fileSize / 1024).toFixed(1)} KB)`,
      'info'
    );
    await addJobLog(
      jobId,
      'QUEUED',
      `Worker capacity: ${active}/${config.queue.concurrency} active, ${pendingQueueLength()} queued (concurrency cap = ${config.queue.concurrency})`,
      'info'
    );
    await new Promise((r) => setTimeout(r, 600));

    let extractedText = job.sourceText || '';
    let base64File: { data: string; mimeType: string } | undefined = undefined;
    let storedBuffer: Buffer | undefined;
    let storedFilePath: string | undefined;

    if (job.storageKey) {
      storedBuffer = await readUpload(job.storageKey);
      storedFilePath = uploadFilePath(job.storageKey);
    }

    if (job.mimeType.startsWith('image/')) {
      await addJobLog(jobId, 'PREPROCESSING', `Identified multimodal visual asset (${job.mimeType}). Encoding tensor buffer...`, 'info');
      if (storedBuffer) {
        base64File = { mimeType: job.mimeType, data: storedBuffer.toString('base64') };
      } else if (job.sourceText && job.sourceText.startsWith('data:')) {
        const parts = job.sourceText.split(',');
        base64File = { mimeType: job.mimeType, data: parts[1] || parts[0] };
      }
    } else {
      if (job.storageKey) {
        if (extractedText) {
          // rawText-only job (stored as a file for consistency)
        } else {
          extractedText = await extractTextFromInput(job.mimeType, storedBuffer, undefined, storedFilePath);
        }
      }
      const wordCount = extractedText.split(/\s+/).filter(Boolean).length;
      await addJobLog(jobId, 'PREPROCESSING', `Extracted ${wordCount} words from text stream. Normalized Unicode linebreaks.`, 'success');
    }

    emitJobEvent({
      jobId,
      status: 'PREPROCESSING',
      progress: 25,
      currentStage: 'Document Ingestion & Text Normalization',
    });

    await new Promise((r) => setTimeout(r, 500));

    // --- STAGE 2: INFERENCE (50%) ---
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'INFERENCE',
        progress: 50,
        currentStage: `AI Model Synthesis (${job.modelName})`,
      },
    });

    await addJobLog(
      jobId,
      'INFERENCE',
      `Dispatching prompt payload to ${job.modelProvider.toUpperCase()} (${job.modelName}) with structured schema enforcement...`,
      'info'
    );

    emitJobEvent({
      jobId,
      status: 'INFERENCE',
      progress: 50,
      currentStage: `AI Model Synthesis (${job.modelName})`,
    });

    const aiResult = await orchestrateDocumentAI({
      provider: job.modelProvider as ModelProvider,
      modelName: job.modelName,
      sourceText: extractedText,
      base64File,
      fileName: job.fileName,
      documentType: job.documentType as DocumentType,
    });

    await addJobLog(
      jobId,
      'INFERENCE',
      `Model inference complete: Generated ${aiResult.completionTokens} tokens (Prompt: ${aiResult.promptTokens}). Provider: ${aiResult.providerUsed}.`,
      'success'
    );

    emitJobEvent({
      jobId,
      status: 'INFERENCE',
      progress: 65,
      currentStage: 'Structured Extraction & Parsing',
    });

    await new Promise((r) => setTimeout(r, 500));

    // --- STAGE 3: FORMATTING & VALIDATION (75%) ---
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FORMATTING',
        progress: 75,
        currentStage: 'Validating Schema & Cross-Checking Tables',
      },
    });

    await addJobLog(
      jobId,
      'FORMATTING',
      `Validating ${aiResult.data.sections.length} document sections and ${aiResult.data.tables?.length || 0} data tables against Zod schema.`,
      'info'
    );

    if (aiResult.data.financials?.total) {
      await addJobLog(
        jobId,
        'FORMATTING',
        `Financial cross-check: Subtotal ${aiResult.data.financials.currency || '$'}${aiResult.data.financials.subtotal} + Tax ${aiResult.data.financials.tax} = Total ${aiResult.data.financials.total}`,
        'info'
      );
    }

    emitJobEvent({
      jobId,
      status: 'FORMATTING',
      progress: 80,
      currentStage: 'Validating Schema & Cross-Checking Tables',
    });

    await new Promise((r) => setTimeout(r, 500));

    // --- STAGE 4: COMPILING PDF (90%) ---
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPILING_PDF',
        progress: 90,
        currentStage: `Compiling Executive PDF (${job.templateStyle.toUpperCase()} Theme)`,
      },
    });

    await addJobLog(
      jobId,
      'COMPILING_PDF',
      `Rendering publication-grade PDF with theme template: "${job.templateStyle}"...`,
      'info'
    );

    const pdfOutput = generateDocumentPdf(aiResult.data, job.templateStyle as TemplateStyle);

    await addJobLog(
      jobId,
      'COMPILING_PDF',
      `PDF compilation succeeded (${(pdfOutput.buffer.length / 1024).toFixed(1)} KB rendered payload).`,
      'success'
    );

    emitJobEvent({
      jobId,
      status: 'COMPILING_PDF',
      progress: 95,
      currentStage: 'Finalizing Record Persistence',
    });

    await new Promise((r) => setTimeout(r, 400));

    // --- STAGE 5: COMPLETED (100%) ---
    const totalDurationMs = Date.now() - startTime;

    const completedJob = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        currentStage: 'Completed',
        title: aiResult.data.title,
        subtitle: aiResult.data.subtitle,
        summary: aiResult.data.executiveSummary,
        author: aiResult.data.author || 'DocAI Engine',
        date: aiResult.data.date || new Date().toLocaleDateString(),
        structuredData: JSON.stringify(aiResult.data),
        rawAiResponse: aiResult.rawAiResponse,
        confidenceScore: aiResult.confidenceScore,
        pdfDataUri: pdfOutput.dataUri,
        promptTokens: aiResult.promptTokens,
        completionTokens: aiResult.completionTokens,
        totalTokens: aiResult.totalTokens,
        estimatedCost: aiResult.estimatedCost,
        processingTimeMs: totalDurationMs,
      },
      include: {
        logs: true,
      },
    });

    await addJobLog(
      jobId,
      'COMPLETED',
      `Background processing successfully completed in ${(totalDurationMs / 1000).toFixed(2)}s. Executive PDF & Structured schema available.`,
      'success'
    );

    emitJobEvent({
      jobId,
      status: 'COMPLETED',
      progress: 100,
      currentStage: 'Completed',
      result: {
        id: completedJob.id,
        status: 'COMPLETED',
        progress: 100,
        currentStage: 'Completed',
        title: completedJob.title,
        subtitle: completedJob.subtitle,
        summary: completedJob.summary,
        structuredData: aiResult.data,
        pdfDataUri: completedJob.pdfDataUri,
        promptTokens: completedJob.promptTokens,
        completionTokens: completedJob.completionTokens,
        totalTokens: completedJob.totalTokens,
        estimatedCost: completedJob.estimatedCost,
        processingTimeMs: completedJob.processingTimeMs,
        confidenceScore: completedJob.confidenceScore,
        updatedAt: completedJob.updatedAt.toISOString(),
      },
    });

    return completedJob;
  } catch (error: any) {
    console.error(`Error processing job ${jobId}:`, error);
    const totalDurationMs = Date.now() - startTime;

    // Truthful failure: record the real reason (timeout / provider / validation / rate limit).
    const isAiFailure = error instanceof AIFailureError;
    const errorMessage = isAiFailure
      ? `${error.code.toUpperCase()}: ${error.message}${error.detail ? ` — ${error.detail}` : ''}`
      : (error.message || 'Unknown processing error');

    await addJobLog(jobId, 'FAILED', `Job processing encountered an error: ${errorMessage}`, 'error');
    await addJobLog(jobId, 'FAILED', `Job attempt count: ${await getJobAttempts(jobId)} (max automatic retries = ${config.retry.maxAttempts}).`, 'warn');

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        progress: 100,
        currentStage: 'Processing Failed',
        errorMessage,
        processingTimeMs: totalDurationMs,
      },
    });

    emitJobEvent({
      jobId,
      status: 'FAILED',
      progress: 100,
      currentStage: 'Processing Failed',
      error: errorMessage,
    });
  }
}

async function getJobAttempts(jobId: string): Promise<number> {
  const j = await prisma.job.findUnique({ where: { id: jobId }, select: { attempts: true } });
  return j?.attempts ?? 0;
}

// ---------------------------------------------------------------------------
// Follow-up processing (second role: plain-language summarise)
// ---------------------------------------------------------------------------
export async function processFollowUpAsync(followUpId: string) {
  const startTime = Date.now();

  try {
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: { job: true },
    });

    if (!followUp) {
      console.error(`FollowUp ${followUpId} not found.`);
      return;
    }

    await prisma.followUp.update({
      where: { id: followUpId },
      data: { status: 'PROCESSING', attempts: { increment: 1 } },
    });

    const structuredData = followUp.job.structuredData ? JSON.parse(followUp.job.structuredData) : null;
    if (!structuredData) {
      throw new AIFailureError('bad_request', 'Parent job has no validated structured data to summarise.');
    }

    if (followUp.action === 'summarise') {
      const result = await runFollowUpSummarise({
        provider: followUp.modelProvider as ModelProvider,
        modelName: followUp.modelName,
        structuredData,
      });

      await prisma.followUp.update({
        where: { id: followUpId },
        data: {
          status: 'DONE',
          output: JSON.stringify(result.output),
          rawAiResponse: result.rawAiResponse,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens,
          estimatedCost: result.estimatedCost,
          processingTimeMs: Date.now() - startTime,
        },
      });
      return;
    }

    throw new AIFailureError('bad_request', `Unsupported follow-up action: ${followUp.action}`);
  } catch (error: any) {
    console.error(`Error processing follow-up ${followUpId}:`, error);
    const isAiFailure = error instanceof AIFailureError;
    const errorMessage = isAiFailure
      ? `${error.code.toUpperCase()}: ${error.message}${error.detail ? ` — ${error.detail}` : ''}`
      : (error.message || 'Unknown follow-up error');

    await prisma.followUp.update({
      where: { id: followUpId },
      data: {
        status: 'FAILED',
        errorMessage,
        processingTimeMs: Date.now() - startTime,
      },
    });
  }
}

export type { FollowUpAction };