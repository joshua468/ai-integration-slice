import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { StructuredDocumentData, DocumentType } from '../types';
import { StructuredDocumentSchema } from '../schemas';
import { config } from '../config';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt } from './prompts';

/** Typed failure with a code, so the worker can record the truthful reason. */
export class GeminiCallError extends Error {
  constructor(
    public code: 'timeout' | 'provider' | 'rate_limited' | 'invalid_json',
    message: string,
    public detail?: string
  ) {
    super(message);
    this.name = 'GeminiCallError';
  }
}

export interface GeminiCallOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxOutputTokens: number;
  /** Abort the request after this many ms. */
  timeoutMs: number;
  modelName: string;
  multimodal?: { data: string; mimeType: string }[];
}

export interface GeminiCallResult {
  rawText: string;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Single Gemini text/JSON call with a hard timeout.
 * Returns raw model text + usage metadata. Parsing/validation happen in the
 * caller so retries can be driven by validation failures.
 */
export async function callGeminiRaw(apiKey: string, options: GeminiCallOptions): Promise<GeminiCallResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: options.modelName,
    systemInstruction: options.systemPrompt,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens,
    },
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const parts: Array<{ inlineData: { data: string; mimeType: string } }> = [];
    if (options.multimodal && options.multimodal.length > 0) {
      for (const m of options.multimodal) {
        parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } });
      }
    }
    const result = await model.generateContent(
      (parts.length > 0 ? [options.userPrompt, ...parts] : [options.userPrompt]) as string | Part[],
      { signal: controller.signal, timeout: options.timeoutMs }
    );
    const usage = result.response.usageMetadata;
    const rawText = result.response.text();

    return {
      rawText,
      promptTokens: usage?.promptTokenCount ?? 0,
      completionTokens: usage?.candidatesTokenCount ?? 0,
    };
  } catch (err: any) {
    if (controller.signal.aborted) {
      throw new GeminiCallError('timeout', `Model call timed out after ${options.timeoutMs}ms`, err?.message);
    }
    const status = err?.status;
    if (typeof status === 'number') {
      if (status === 429) {
        throw new GeminiCallError('rate_limited', 'Gemini API rate limit hit (429)', err?.message);
      }
      throw new GeminiCallError('provider', `Gemini API error (HTTP ${status})`, err?.message);
    }
    throw new GeminiCallError('provider', 'Gemini API call failed', err?.message);
  } finally {
    clearTimeout(timer);
  }
}

/** Strip ```json fences if the model wrapped the output. */
export function cleanJsonFences(rawText: string): string {
  return rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
}

/**
 * Legacy entry point retained for compatibility with the pre-existing
 * openai.ts-parallel signature. Now delegates to the config-driven core with
 * REAL validation (the old catch-branch that returned unvalidated JSON, which
 * would have made a 200 response dishonest, is gone).
 */
export async function processWithGemini(
  apiKey: string,
  sourceText: string,
  base64File?: { data: string; mimeType: string },
  modelName: string = config.provider.gemini.analysisModel,
  documentType: DocumentType = 'generic'
): Promise<{
  data: StructuredDocumentData;
  promptTokens: number;
  completionTokens: number;
  rawResponse: string;
}> {
  const result = await callGeminiRaw(apiKey, {
    systemPrompt: ANALYSIS_SYSTEM_PROMPT,
    userPrompt: buildAnalysisUserPrompt(sourceText, documentType),
    temperature: config.generation.analysisTemperature,
    maxOutputTokens: config.generation.analysisMaxOutputTokens,
    timeoutMs: config.generation.contextTimeoutMs,
    modelName,
    multimodal: base64File ? [{ data: base64File.data, mimeType: base64File.mimeType }] : undefined,
  });

  const parsed = JSON.parse(cleanJsonFences(result.rawText));
  const validated = StructuredDocumentSchema.parse(parsed);
  return {
    data: validated as StructuredDocumentData,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    rawResponse: result.rawText,
  };
}

export const GEMINI_ANALYSIS_MODEL: string = config.provider.gemini.analysisModel;