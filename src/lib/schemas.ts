import { z } from 'zod';

export const DocumentSectionSchema = z.object({
  id: z.string().default(() => Math.random().toString(36).substring(2, 9)),
  heading: z.string().describe('Section title/heading'),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  content: z.string().describe('Main text content of this section, formatted in clean sentences or markdown paragraphs'),
  bulletPoints: z.array(z.string()).optional().describe('Key bullets under this section if applicable'),
  callout: z.object({
    type: z.enum(['note', 'tip', 'warning', 'key_takeaway']),
    text: z.string(),
  }).optional().describe('Important highlighted takeaway or warning box'),
});

export const DocumentTableSchema = z.object({
  id: z.string().default(() => Math.random().toString(36).substring(2, 9)),
  title: z.string().optional().describe('Table title or caption'),
  headers: z.array(z.string()).describe('Table column header names'),
  rows: z.array(z.array(z.string())).describe('2D array of rows and cell text values'),
  summary: z.string().optional().describe('Brief 1-sentence explanation of table data'),
});

export const ActionItemSchema = z.object({
  id: z.string().default(() => Math.random().toString(36).substring(2, 9)),
  task: z.string().describe('Clear, actionable task description'),
  assignee: z.string().optional().describe('Responsible person or team if identifiable'),
  dueDate: z.string().optional().describe('Deadline or target timeline if mentioned'),
  priority: z.enum(['High', 'Medium', 'Low']).default('Medium'),
  status: z.enum(['Pending', 'In Progress', 'Completed']).default('Pending'),
});

export const StructuredDocumentSchema = z.object({
  title: z.string().describe('Comprehensive, professional document title'),
  subtitle: z.string().optional().describe('Subheading or context tag'),
  documentType: z.enum(['report', 'invoice', 'contract', 'notes', 'spec', 'resume', 'generic']).default('generic'),
  executiveSummary: z.string().describe('A high-level 2-4 sentence executive overview synthesizing the entire document'),
  author: z.string().optional().describe('Author name, organization, or prepared by'),
  date: z.string().optional().describe('Document date formatted nicely (e.g., October 24, 2026)'),
  version: z.string().optional().describe('Document version number or draft status'),
  organization: z.string().optional().describe('Entity, client, or company name'),
  tags: z.array(z.string()).default([]).describe('3 to 6 thematic keywords/tags'),
  sections: z.array(DocumentSectionSchema).min(1).describe('Ordered structured content sections'),
  tables: z.array(DocumentTableSchema).optional().describe('Extracted or synthesized data tables'),
  actionItems: z.array(ActionItemSchema).optional().describe('Actionable next steps extracted from text'),
  keyTakeaways: z.array(z.string()).optional().describe('Top 3-5 bulleted core takeaways'),
  financials: z.object({
    currency: z.string().default('$'),
    subtotal: z.number().optional(),
    tax: z.number().optional(),
    total: z.number().optional(),
    lineItems: z.array(z.object({
      description: z.string(),
      quantity: z.number().optional(),
      unitPrice: z.number().optional(),
      total: z.number().optional(),
    })).optional(),
  }).optional(),
  metrics: z.object({
    wordCount: z.number().default(0),
    estimatedReadTimeMinutes: z.number().default(1),
    readingGradeLevel: z.string().optional(),
    sentiment: z.enum(['Formal', 'Technical', 'Urgent', 'Informative']).default('Formal'),
  }).optional(),
});

export type StructuredDocumentDataInput = z.infer<typeof StructuredDocumentSchema>;

export const FollowUpOutputSchema = z.object({
  headline: z.string().min(3).describe('Single short essence sentence'),
  summary: z.string().min(20).describe('2-4 sentence plain-language summary'),
  keyPoints: z.array(z.string()).min(1).max(8).describe('3 to 6 short bullet-style key points'),
  tone: z.enum(['Plain', 'Friendly', 'Formal']).default('Plain'),
  readabilityLevel: z.string().optional().describe('e.g. "9th Grade Readability"'),
  metrics: z.object({
    originalWordCount: z.number().min(0),
    summaryWordCount: z.number().min(0),
    reductionPercent: z.number().min(0).max(100),
  }),
});
