import { z } from 'zod';
import { StructuredDocumentData, DocumentType, ModelProvider, FollowUpOutput } from '../types';
import { StructuredDocumentSchema, FollowUpOutputSchema } from '../schemas';
import { config, estimateGeminiCost } from '../config';
import {
  ANALYSIS_SYSTEM_PROMPT,
  FOLLOW_UP_SUMMARISE_SYSTEM_PROMPT,
  buildAnalysisUserPrompt,
  buildFollowUpUserPrompt,
} from './prompts';
import { callGeminiRaw, GeminiCallError, cleanJsonFences } from './gemini';
import { processWithOpenAI } from './openai';
import { generateSimulatedDocument, generateBrokenSchemaDocument, INJECT_INVALID_JSON_OUTPUT } from './simulator';

/** Typed, user-faceable failure with a stable code the UI can render. */
export class AIFailureError extends Error {
  constructor(
    public code: 'timeout' | 'provider' | 'rate_limited' | 'validation' | 'bad_request',
    message: string,
    public detail?: string
  ) {
    super(message);
    this.name = 'AIFailureError';
  }
}

function zodIssuesToString(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .slice(0, 6)
    .join('; ');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface ProcessDocumentOptions {
  provider: ModelProvider;
  modelName?: string;
  sourceText: string;
  base64File?: { data: string; mimeType: string };
  fileName: string;
  documentType: DocumentType;
  customApiKey?: string;
}

export interface ProcessDocumentResult {
  data: StructuredDocumentData;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  confidenceScore: number;
  rawAiResponse?: string;
  providerUsed: ModelProvider;
}

/** Attempt one Gemini inference and return raw text (no validation here). */
async function geminiAttempt(
  apiKey: string,
  sourceText: string,
  base64File: { data: string; mimeType: string } | undefined,
  modelName: string,
  documentType: DocumentType,
  feedback?: string
): Promise<{ rawText: string; promptTokens: number; completionTokens: number }> {
  let userPrompt = buildAnalysisUserPrompt(sourceText, documentType);
  if (feedback) {
    userPrompt += `\n\nYOUR PREVIOUS OUTPUT WAS REJECTED BY OUR VALIDATOR. Fix exactly this and respond with corrected JSON only:\n${feedback}`;
  }
  return callGeminiRaw(apiKey, {
    systemPrompt: ANALYSIS_SYSTEM_PROMPT,
    userPrompt,
    temperature: config.generation.analysisTemperature,
    maxOutputTokens: config.generation.analysisMaxOutputTokens,
    timeoutMs: config.generation.contextTimeoutMs,
    modelName,
    multimodal: base64File ? [base64File] : undefined,
  });
}

function validateStructured(rawText: string): StructuredDocumentData {
  let cleaned = cleanJsonFences(rawText).trim();
  // Fallback repair: pull the first {...} block if the model wrapped prose around JSON.
  if (!cleaned.startsWith('{')) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];
  }
  const parsed = JSON.parse(cleaned);
  return StructuredDocumentSchema.parse(parsed) as StructuredDocumentData;
}

export async function orchestrateDocumentAI(options: ProcessDocumentOptions): Promise<ProcessDocumentResult> {
  const { provider, sourceText, base64File, fileName, documentType, customApiKey } = options;
  const modelName = options.modelName ?? config.provider.gemini.analysisModel;

  // --- Simulation (explicit choice only — never an automatic fallback) ---
  if (provider === 'simulation') {
    const simSource = sourceText || `\n${INJECT_INVALID_JSON_OUTPUT}`;
    const broken = sourceText.includes(INJECT_INVALID_JSON_OUTPUT);
    const sim = broken
      ? generateBrokenSchemaDocument(sourceText, fileName, documentType)
      : generateSimulatedDocument(simSource, fileName, documentType);
    try {
      const validated = StructuredDocumentSchema.parse(sim.data) as StructuredDocumentData;
      const totalTokens = sim.promptTokens + sim.completionTokens;
      return {
        data: validated,
        promptTokens: sim.promptTokens,
        completionTokens: sim.completionTokens,
        totalTokens,
        estimatedCost: 0,
        confidenceScore: sim.confidenceScore,
        rawAiResponse: JSON.stringify(sim.data, null, 2),
        providerUsed: 'simulation',
      };
    } catch (err: any) {
      throw new AIFailureError(
        'validation',
        'The model returned output that failed schema validation.',
        err instanceof z.ZodError ? zodIssuesToString(err) : String(err?.message || err)
      );
    }
  }

  // --- Real providers (Gemini default, OpenAI optional) ---
  const geminiKey = provider === 'gemini' ? (customApiKey || process.env.GEMINI_API_KEY) : '';

  if (provider === 'gemini' && !geminiKey) {
    throw new AIFailureError('bad_request', 'No Gemini API key configured (set GEMINI_API_KEY in .env).');
  }

  if (provider === 'openai' && !process.env.OPENAI_API_KEY && !customApiKey) {
    throw new AIFailureError('bad_request', 'No OpenAI API key configured (set OPENAI_API_KEY in .env).');
  }

  const maxAttempts = config.retry.maxAttempts;
  let lastFeedback: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (provider === 'gemini') {
        const res = await geminiAttempt(geminiKey!, sourceText, base64File, modelName, documentType, lastFeedback);
        const data = validateStructured(res.rawText);
        const totalTokens = res.promptTokens + res.completionTokens;
        return {
          data,
          promptTokens: res.promptTokens,
          completionTokens: res.completionTokens,
          totalTokens,
          estimatedCost: estimateGeminiCost(res.promptTokens, res.completionTokens),
          confidenceScore: 0.98,
          rawAiResponse: res.rawText,
          providerUsed: 'gemini',
        };
      }

      // OpenAI path (optional role) — validates inside processWithOpenAI.
      const res = await processWithOpenAI(customApiKey || process.env.OPENAI_API_KEY!, sourceText, base64File, modelName, documentType);
      const totalTokens = res.promptTokens + res.completionTokens;
      const estimatedCost = (res.promptTokens * 0.15 + res.completionTokens * 0.6) / 1_000_000;
      return {
        data: res.data,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
        totalTokens,
        estimatedCost,
        confidenceScore: 0.97,
        rawAiResponse: res.rawResponse,
        providerUsed: 'openai',
      };
    } catch (err: any) {
      if (err instanceof AIFailureError) throw err;

      const isValidation = err instanceof z.ZodError || (err?.message && /JSON|schema|Unexpected token|expected/i.test(err.message) && !(err instanceof GeminiCallError));
      const isTransient = err instanceof GeminiCallError && (err.code === 'timeout' || err.code === 'rate_limited' || (err.code === 'provider' && /HTTP [5]/.test(err.message)));

      if (isValidation && attempt < maxAttempts) {
        lastFeedback = err instanceof z.ZodError ? zodIssuesToString(err) : String(err?.message);
        await sleep(config.retry.retryDelayMs * attempt);
        continue;
      }

      if (isValidation) {
        const detail = err instanceof z.ZodError ? zodIssuesToString(err) : String(err?.message || err);
        throw new AIFailureError(
          'validation',
          'The model returned output that failed schema validation, even after retries.',
          detail
        );
      }

      if (isTransient && attempt < maxAttempts) {
        await sleep(config.retry.retryDelayMs * attempt);
        continue;
      }

      // Truthful failure: whatever the provider said goes to the user.
      if (err instanceof GeminiCallError) {
        if (err.code === 'timeout') throw new AIFailureError('timeout', err.message, err.detail);
        if (err.code === 'rate_limited') throw new AIFailureError('rate_limited', err.message, err.detail);
        throw new AIFailureError('provider', err.message, err.detail);
      }
      throw new AIFailureError('provider', err?.message || 'Provider call failed', String(err?.stack || err));
    }
  }

  throw new AIFailureError('provider', 'Provider call exhausted all retry attempts.');
}

export interface RunFollowUpOptions {
  provider: ModelProvider;
  structuredData: StructuredDocumentData;
  modelName?: string;
  customApiKey?: string;
}

export interface RunFollowUpResult {
  output: FollowUpOutput;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  rawAiResponse?: string;
  providerUsed: ModelProvider;
}

export async function runFollowUpSummarise(options: RunFollowUpOptions): Promise<RunFollowUpResult> {
  const { provider, structuredData, customApiKey } = options;
  const modelName = options.modelName ?? config.provider.gemini.followUpModel;

  if (provider === 'simulation') {
    const wc = (structuredData?.metrics?.wordCount ?? 0) || 400;
    const swc = Math.max(40, Math.round(wc * 0.22));
    const output: FollowUpOutput = {
      headline: structuredData.title,
      summary: structuredData.executiveSummary || 'Plain-language synthesis of the analysed document.',
      keyPoints: (structuredData.keyTakeaways || []).slice(0, 5),
      tone: 'Plain',
      readabilityLevel: '9th Grade Readability',
      metrics: { originalWordCount: wc, summaryWordCount: swc, reductionPercent: Math.round(((wc - swc) / wc) * 100) },
    };
    return {
      output,
      promptTokens: 120,
      completionTokens: 90,
      totalTokens: 210,
      estimatedCost: 0,
      rawAiResponse: JSON.stringify(output, null, 2),
      providerUsed: 'simulation',
    };
  }

  const key = provider === 'gemini' ? (customApiKey || process.env.GEMINI_API_KEY || '') : '';
  if ((provider === 'gemini' && !key) || (provider === 'openai' && !process.env.OPENAI_API_KEY && !customApiKey)) {
    throw new AIFailureError('bad_request', `No ${provider.toUpperCase()} API key configured.`);
  }

  const maxAttempts = config.retry.maxAttempts;
  let lastFeedback: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let userPrompt = buildFollowUpUserPrompt(structuredData);
      if (lastFeedback) {
        userPrompt += `\n\nYOUR PREVIOUS OUTPUT WAS REJECTED. Fix exactly this and respond with corrected JSON only:\n${lastFeedback}`;
      }

      if (provider === 'gemini') {
        const res = await callGeminiRaw(key!, {
          systemPrompt: FOLLOW_UP_SUMMARISE_SYSTEM_PROMPT,
          userPrompt,
          temperature: config.generation.followUpTemperature,
          maxOutputTokens: config.generation.followUpMaxOutputTokens,
          timeoutMs: config.generation.contextTimeoutMs,
          modelName,
        });
        const output = FollowUpOutputSchema.parse(JSON.parse(cleanJsonFences(res.rawText).trim().match(/\{[\s\S]*\}/)?.[0] || cleanJsonFences(res.rawText))) as FollowUpOutput;
        const totalTokens = res.promptTokens + res.completionTokens;
        return {
          output,
          promptTokens: res.promptTokens,
          completionTokens: res.completionTokens,
          totalTokens,
          estimatedCost: estimateGeminiCost(res.promptTokens, res.completionTokens),
          rawAiResponse: res.rawText,
          providerUsed: 'gemini',
        };
      }

      throw new AIFailureError('bad_request', 'OpenAI follow-up path is not wired for this slice.');
    } catch (err: any) {
      if (err instanceof AIFailureError) throw err;

      const isValidation = err instanceof z.ZodError || (err?.message && /JSON|schema|Unexpected token|expected/i.test(err.message) && !(err instanceof GeminiCallError));
      const isTransient = err instanceof GeminiCallError && (err.code === 'timeout' || err.code === 'rate_limited' || (err.code === 'provider' && /HTTP [5]/.test(err.message)));

      if (isValidation && attempt < maxAttempts) {
        lastFeedback = err instanceof z.ZodError ? zodIssuesToString(err) : String(err?.message);
        await sleep(config.retry.retryDelayMs * attempt);
        continue;
      }
      if (isValidation) {
        throw new AIFailureError(
          'validation',
          'The follow-up model returned output that failed schema validation, even after retries.',
          err instanceof z.ZodError ? zodIssuesToString(err) : String(err?.message || err)
        );
      }
      if (isTransient && attempt < maxAttempts) {
        await sleep(config.retry.retryDelayMs * attempt);
        continue;
      }
      if (err instanceof GeminiCallError) {
        if (err.code === 'timeout') throw new AIFailureError('timeout', err.message, err.detail);
        if (err.code === 'rate_limited') throw new AIFailureError('rate_limited', err.message, err.detail);
        throw new AIFailureError('provider', err.message, err.detail);
      }
      throw new AIFailureError('provider', err?.message || 'Follow-up provider call failed');
    }
  }

  throw new AIFailureError('provider', 'Follow-up provider call exhausted all retry attempts.');
}