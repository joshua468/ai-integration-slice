export type DocumentType = 
  | 'report'
  | 'invoice'
  | 'contract'
  | 'notes'
  | 'spec'
  | 'resume'
  | 'generic';

export type JobStatus = 
  | 'QUEUED'
  | 'PREPROCESSING'
  | 'INFERENCE'
  | 'FORMATTING'
  | 'COMPILING_PDF'
  | 'COMPLETED'
  | 'FAILED';

export type FollowUpStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

export type FollowUpAction = 'summarise';

export type ModelProvider = 'gemini' | 'openai' | 'simulation';

export type TemplateStyle = 'executive' | 'corporate' | 'minimal' | 'modern';

export interface DocumentSection {
  id: string;
  heading: string;
  level: 1 | 2 | 3;
  content: string; // Markdown or clean text
  bulletPoints?: string[];
  callout?: {
    type: 'note' | 'tip' | 'warning' | 'key_takeaway';
    text: string;
  };
}

export interface DocumentTable {
  id: string;
  title?: string;
  headers: string[];
  rows: string[][];
  summary?: string;
}

export interface ActionItem {
  id: string;
  task: string;
  assignee?: string;
  dueDate?: string;
  priority?: 'High' | 'Medium' | 'Low';
  status?: 'Pending' | 'In Progress' | 'Completed';
}

export interface StructuredDocumentData {
  title: string;
  subtitle?: string;
  documentType: DocumentType;
  executiveSummary: string;
  author?: string;
  date?: string;
  version?: string;
  organization?: string;
  tags: string[];
  sections: DocumentSection[];
  tables?: DocumentTable[];
  actionItems?: ActionItem[];
  keyTakeaways?: string[];
  financials?: {
    currency?: string;
    subtotal?: number;
    tax?: number;
    total?: number;
    lineItems?: Array<{
      description: string;
      quantity?: number;
      unitPrice?: number;
      total?: number;
    }>;
  };
  metrics?: {
    wordCount: number;
    estimatedReadTimeMinutes: number;
    readingGradeLevel?: string;
    sentiment?: 'Formal' | 'Technical' | 'Urgent' | 'Informative';
  };
}

export interface JobLogItem {
  id: string;
  jobId: string;
  stage: string;
  message: string;
  level: 'info' | 'warn' | 'error' | 'success';
  timestamp: string | Date;
}

export interface JobResponse {
  id: string;
  documentType: DocumentType;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey?: string | null;
  attempts: number;
  filePreviewUrl?: string | null;
  status: JobStatus;
  progress: number;
  currentStage: string;
  modelProvider: ModelProvider;
  modelName: string;
  templateStyle: TemplateStyle;
  title?: string | null;
  subtitle?: string | null;
  summary?: string | null;
  author?: string | null;
  date?: string | null;
  structuredData?: StructuredDocumentData | null;
  rawAiResponse?: string | null;
  confidenceScore?: number | null;
  pdfDataUri?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  estimatedCost?: number | null;
  processingTimeMs?: number | null;
  errorMessage?: string | null;
  verifiedByUser: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  logs?: JobLogItem[];
}

export interface FollowUpOutput {
  headline: string;
  summary: string;
  keyPoints: string[];
  tone: 'Plain' | 'Friendly' | 'Formal';
  readabilityLevel?: string;
  metrics: {
    originalWordCount: number;
    summaryWordCount: number;
    reductionPercent: number;
  };
}

export interface FollowUpResponse {
  id: string;
  jobId: string;
  action: FollowUpAction;
  status: FollowUpStatus;
  attempts: number;
  errorMessage?: string | null;
  output?: FollowUpOutput | null;
  rawAiResponse?: string | null;
  modelProvider: ModelProvider;
  modelName: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  estimatedCost?: number | null;
  processingTimeMs?: number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface QueueProgressEvent {
  jobId: string;
  status: JobStatus;
  progress: number;
  currentStage: string;
  log?: {
    stage: string;
    message: string;
    level: 'info' | 'warn' | 'error' | 'success';
    timestamp: string;
  };
  result?: Partial<JobResponse>;
  error?: string;
}
