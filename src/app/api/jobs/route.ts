import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enqueueJob, extractTextFromInput, activeWorkerCount, pendingQueueLength } from '@/lib/queue/worker';
import { DocumentType, ModelProvider, TemplateStyle } from '@/lib/types';
import { config, maxFileSizeBytes, maxFilesPerRequest } from '@/lib/config';
import { saveUpload } from '@/lib/storage';
import { rateLimitResponse } from '@/lib/rate-limit';
import { INJECT_INVALID_JSON_OUTPUT } from '@/lib/ai/simulator';
import { validateUploadFile } from '@/lib/upload';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Rate limit: uploading triggers expensive provider work (config.rateLimit.upload).
    const tooMany = await rateLimitResponse(req, config.rateLimit.upload.max, config.rateLimit.upload.windowMs, 'upload');
    if (tooMany) return tooMany;

    const contentType = req.headers.get('content-type') || '';

    let fileName = 'document.txt';
    let mimeType = 'text/plain';
    let fileSize = 0;
    let documentType: DocumentType = 'generic';
    let modelProvider: ModelProvider = 'gemini';
    let modelName = config.provider.gemini.analysisModel as string;
    let templateStyle: TemplateStyle = 'executive';
    let storageKey: string | null = null;
    let extractedText = '';
    let filePreviewUrl: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();

      const docTypeInput = formData.get('documentType') as string | null;
      const providerInput = formData.get('modelProvider') as string | null;
      const modelNameInput = formData.get('modelName') as string | null;
      const templateInput = formData.get('templateStyle') as string | null;

      if (docTypeInput) documentType = docTypeInput as DocumentType;
      if (providerInput) modelProvider = providerInput as ModelProvider;
      if (modelNameInput) modelName = modelNameInput;
      if (templateInput) templateStyle = templateInput as TemplateStyle;

      const rawText = formData.get('rawText') as string | null;
      const simulateInvalidOutput = formData.get('simulateInvalidOutput') === '1';

      // Multiple files (primary path).
      const multiFiles = formData.getAll('files') as File[];
      if (multiFiles.length > 0) {
        if (multiFiles.length > maxFilesPerRequest) {
          return NextResponse.json(
            { error: `Too many files: the limit is ${maxFilesPerRequest} per request.` },
            { status: 400 }
          );
        }

        const rejections: { name: string; reason: string }[] = [];
        const valid: File[] = [];
        for (const f of multiFiles) {
          const reason = validateUploadFile(f.name, f.type, f.size);
          if (reason) rejections.push({ name: f.name, reason });
          else valid.push(f);
        }

        if (rejections.length > 0) {
          // Reject the whole request truthfully, listing every invalid file.
          return NextResponse.json(
            { error: 'One or more files were rejected.', files: rejections },
            { status: 400 }
          );
        }

        const created: any[] = [];
        for (const f of valid) {
          const buffer = Buffer.from(await f.arrayBuffer());
          let stored: Awaited<ReturnType<typeof saveUpload>> | null = null;
          let sourceTextOverride: string | undefined;

          if (simulateInvalidOutput) {
            // Failure-demo: simulate a model that emits schema-breaking JSON. The
            // orchestrator retries, then reports FAILED truthfully (validation).
            sourceTextOverride = INJECT_INVALID_JSON_OUTPUT;
            modelProvider = 'simulation';
          } else {
            stored = await saveUpload(buffer, f.name);
          }

          const job = await prisma.job.create({
            data: {
              fileName: f.name,
              fileSize: f.size,
              mimeType: f.type || 'application/octet-stream',
              storageKey: stored?.storageKey ?? null,
              sourceText: sourceTextOverride,
              documentType,
              modelProvider,
              modelName,
              templateStyle,
              status: 'QUEUED',
              progress: 5,
              currentStage: 'Queued for processing',
            },
          });
          await prisma.jobLog.create({
            data: {
              jobId: job.id,
              stage: 'QUEUED',
              message: `Job ${job.id} enqueued: "${f.name}" (${(f.size / 1024).toFixed(1)} KB) using ${modelProvider.toUpperCase()} (${modelName}).${stored ? ` File stored at storage key: ${stored.storageKey}` : ''}`,
              level: 'info',
            },
          });
          enqueueJob(job.id);
          created.push({ id: job.id, status: job.status, progress: job.progress, fileName: job.fileName, attempts: job.attempts, createdAt: job.createdAt });
        }

        return NextResponse.json({ jobs: created, count: created.length }, { status: 201 });
      }

      // Single-file legacy path.
      const file = formData.get('file') as File | null;
      if (file && file.size > 0) {
        const reason = validateUploadFile(file.name, file.type, file.size);
        if (reason) {
          return NextResponse.json({ error: reason }, { status: 400 });
        }
        fileName = file.name;
        mimeType = file.type || 'application/octet-stream';
        fileSize = file.size;
        if (simulateInvalidOutput) {
          extractedText = INJECT_INVALID_JSON_OUTPUT;
          modelProvider = 'simulation';
        } else {
          const buffer = Buffer.from(await file.arrayBuffer());
          const stored = await saveUpload(buffer, file.name);
          storageKey = stored.storageKey;
          if (!mimeType.startsWith('image/')) {
            extractedText = await extractTextFromInput(mimeType, buffer);
          }
        }
      } else if (rawText) {
        // Preset / pasted text: stored as a file so the DB holds only the key.
        fileName = 'pasted_document.txt';
        mimeType = 'text/plain';
        fileSize = Buffer.byteLength(rawText, 'utf-8');
        extractedText = rawText;
        const stored = await saveUpload(Buffer.from(rawText, 'utf-8'), fileName);
        storageKey = stored.storageKey;
      }
    } else {
      const body = await req.json();
      fileName = body.fileName || 'custom_document.txt';
      mimeType = body.mimeType || 'text/plain';
      documentType = (body.documentType as DocumentType) || 'generic';
      modelProvider = (body.modelProvider as ModelProvider) || 'gemini';
      modelName = body.modelName || config.provider.gemini.analysisModel;
      templateStyle = (body.templateStyle as TemplateStyle) || 'executive';
      extractedText = body.sourceText || body.rawContent || '';
      fileSize = Buffer.byteLength(extractedText, 'utf-8');
      filePreviewUrl = body.filePreviewUrl || null;
      if (extractedText) {
        const stored = await saveUpload(Buffer.from(extractedText, 'utf-8'), fileName);
        storageKey = stored.storageKey;
      }
    }

    if (!extractedText && fileSize === 0 && !storageKey) {
      return NextResponse.json(
        { error: 'No document content or file provided' },
        { status: 400 }
      );
    }

    // Create job record in Prisma SQLite
    const job = await prisma.job.create({
      data: {
        fileName,
        fileSize,
        mimeType,
        storageKey,
        documentType,
        modelProvider,
        modelName,
        templateStyle,
        sourceText: extractedText || undefined,
        filePreviewUrl,
        status: 'QUEUED',
        progress: 5,
        currentStage: 'Queued for processing',
      },
    });

    // Create initial queue log
    await prisma.jobLog.create({
      data: {
        jobId: job.id,
        stage: 'QUEUED',
        message: `Job ${job.id} enqueued: "${fileName}" (${(fileSize / 1024).toFixed(1)} KB) using ${modelProvider.toUpperCase()} (${modelName})${storageKey ? `. File stored at storage key: ${storageKey}` : ''}`,
        level: 'info',
      },
    });

    // Dispatch background worker asynchronously (bounded queue, FIFO)
    enqueueJob(job.id);

    return NextResponse.json(
      {
        id: job.id,
        status: job.status,
        progress: job.progress,
        fileName: job.fileName,
        attempts: job.attempts,
        createdAt: job.createdAt,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating job:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create job' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const docType = searchParams.get('documentType');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const where: any = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (docType && docType !== 'ALL') {
      where.documentType = docType;
    }
    if (search) {
      where.OR = [
        { fileName: { contains: search } },
        { title: { contains: search } },
        { summary: { contains: search } },
      ];
    }

    const jobs = await prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        storageKey: true,
        attempts: true,
        documentType: true,
        status: true,
        progress: true,
        currentStage: true,
        modelProvider: true,
        modelName: true,
        templateStyle: true,
        title: true,
        subtitle: true,
        summary: true,
        confidenceScore: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        estimatedCost: true,
        processingTimeMs: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      jobs,
      queue: {
        active: activeWorkerCount(),
        capacity: config.queue.concurrency,
        queued: pendingQueueLength(),
      },
    });
  } catch (error: any) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}