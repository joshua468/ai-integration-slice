import OpenAI from 'openai';
import { StructuredDocumentData, DocumentType } from '../types';
import { StructuredDocumentSchema } from '../schemas';

export async function processWithOpenAI(
  apiKey: string,
  sourceText: string,
  base64File?: { data: string; mimeType: string },
  modelName: string = 'gpt-4o-mini',
  documentType: DocumentType = 'generic'
): Promise<{
  data: StructuredDocumentData;
  promptTokens: number;
  completionTokens: number;
  rawResponse: string;
}> {
  const openai = new OpenAI({ apiKey });

  const systemPrompt = `You are an elite Document Intelligence & Executive Synthesis System.
Analyze the provided document or text, restructure it into a publication-grade executive document, and output a valid JSON object matching the requested schema.`;

  const userPrompt = `Document Type Hint: ${documentType}

Schema to follow in JSON:
{
  "title": "string",
  "subtitle": "string",
  "documentType": "${documentType}",
  "executiveSummary": "string (2-4 sentences executive overview)",
  "author": "string",
  "date": "string",
  "version": "string",
  "organization": "string",
  "tags": ["string"],
  "sections": [
    {
      "id": "string",
      "heading": "string",
      "level": 1,
      "content": "string",
      "bulletPoints": ["string"],
      "callout": { "type": "note"|"tip"|"warning"|"key_takeaway", "text": "string" }
    }
  ],
  "tables": [
    { "id": "string", "title": "string", "headers": ["string"], "rows": [["string"]], "summary": "string" }
  ],
  "actionItems": [
    { "id": "string", "task": "string", "assignee": "string", "dueDate": "string", "priority": "High"|"Medium"|"Low", "status": "Pending"|"In Progress"|"Completed" }
  ],
  "keyTakeaways": ["string"],
  "financials": { "currency": "$", "subtotal": 0, "tax": 0, "total": 0, "lineItems": [] },
  "metrics": { "wordCount": 0, "estimatedReadTimeMinutes": 1, "readingGradeLevel": "string", "sentiment": "Formal" }
}

DOCUMENT CONTENT:
${sourceText || 'See attached image'}`;

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
  ];

  if (base64File && base64File.mimeType.startsWith('image/')) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: userPrompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:${base64File.mimeType};base64,${base64File.data}`,
          },
        },
      ],
    });
  } else {
    messages.push({ role: 'user', content: userPrompt });
  }

  const response = await openai.chat.completions.create({
    model: modelName,
    messages,
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const content = response.choices[0]?.message?.content || '{}';
  const usage = response.usage;

  try {
    const parsed = JSON.parse(content);
    const validated = StructuredDocumentSchema.parse(parsed);
    return {
      data: validated as StructuredDocumentData,
      promptTokens: usage?.prompt_tokens || 450,
      completionTokens: usage?.completion_tokens || 750,
      rawResponse: content,
    };
  } catch (err) {
    // Validation failure must surface, not be silently swallowed: a 200 from the
    // provider is NOT success. The orchestrator retries and then fails gracefully.
    throw err;
  }
}
