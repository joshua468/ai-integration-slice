import { StructuredDocumentData, DocumentType } from '../types';

/**
 * Dev/test hook: when the source text contains this marker, the simulator
 * returns JSON that deliberately violates StructuredDocumentSchema. This is how
 * the "what happens when validation fails" evidence is produced — the
 * orchestrator's validation must catch it, retry, and fail gracefully.
 */
export const INJECT_INVALID_JSON_OUTPUT = 'INJECT_INVALID_JSON_OUTPUT';

export function generateBrokenSchemaDocument(
  sourceText: string,
  fileName: string,
  documentType: DocumentType
): { data: unknown; promptTokens: number; completionTokens: number; confidenceScore: number } {
  // Violates the schema in three ways: missing required "title" & "executiveSummary",
  // and "sections" empty (schema requires min(1)).
  return {
    data: {
      documentType,
      subtitle: 'deliberately broken schema output',
      tags: ['test'],
      sections: [],
      keyTakeaways: ['This output is invalid on purpose'],
      metrics: { wordCount: 5, estimatedReadTimeMinutes: 1 },
    },
    promptTokens: 120,
    completionTokens: 40,
    confidenceScore: 0.1,
  };
}

export function generateSimulatedDocument(
  sourceText: string,
  fileName: string,
  documentType: DocumentType
): {
  data: StructuredDocumentData;
  promptTokens: number;
  completionTokens: number;
  confidenceScore: number;
} {
  const cleanText = sourceText || 'Sample Document Content';
  const lines = cleanText.split('\n').map((l) => l.trim()).filter(Boolean);
  const wordCount = cleanText.split(/\s+/).filter(Boolean).length;

  // Detect specific document signatures if generic
  let detectedType: DocumentType = documentType;
  if (detectedType === 'generic') {
    const lower = cleanText.toLowerCase();
    if (lower.includes('invoice') || lower.includes('billed to') || lower.includes('subtotal')) {
      detectedType = 'invoice';
    } else if (lower.includes('meeting') || lower.includes('attendees') || lower.includes('action item')) {
      detectedType = 'notes';
    } else if (lower.includes('agreement') || lower.includes('sla') || lower.includes('party')) {
      detectedType = 'contract';
    } else if (lower.includes('specification') || lower.includes('architecture') || lower.includes('pipeline')) {
      detectedType = 'spec';
    } else if (lower.includes('patient') || lower.includes('diagnostic') || lower.includes('clinical')) {
      detectedType = 'report';
    }
  }

  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  if (detectedType === 'notes') {
    return {
      data: {
        title: 'Executive Meeting & Strategy Brief',
        subtitle: 'Sprint Operations & Cross-Functional Alignment',
        documentType: 'notes',
        executiveSummary:
          'Comprehensive recap of team deliberations covering engineering latency targets, design system sign-off, security audit fixes, and cloud GPU cost optimization initiatives.',
        author: 'Executive PMO & Architecture Council',
        date: formattedDate,
        version: 'v1.2 (Final)',
        organization: 'Enterprise Engineering Group',
        tags: ['Sprint Planning', 'Architecture', 'SLA Hardening', 'Security', 'Cost Optimization'],
        sections: [
          {
            id: 'sec-1',
            heading: '1. Engineering Bottlenecks & SLA Commitments',
            level: 1,
            content:
              'The team conducted a thorough review of p99 latency regressions observed during high-concurrency ingestion batches. A firm commitment was established to bring p95 response times below 1.5 seconds prior to the enterprise commercial rollout.',
            bulletPoints: [
              'Ingestion worker currently reaching 4.2s latency on 15MB+ multimodal payloads.',
              'Target p95 latency fixed at < 1.5s for enterprise tier contracts.',
              'Edge caching with local persistent database replicas approved for rollout.',
            ],
            callout: {
              type: 'warning',
              text: 'Hard SLA deadline is set for November 1st. Code freeze begins on October 28th.',
            },
          },
          {
            id: 'sec-2',
            heading: '2. Design & Accessibility Compliance',
            level: 1,
            content:
              'Design System v3 has reached 85% component maturity. Dark mode theme tokens are undergoing strict WCAG 2.1 AA color contrast compliance audits to ensure universal readability.',
            bulletPoints: [
              'Export modals and responsive mobile breakpoints scheduled for delivery by Oct 18.',
              'Glassmorphism visual hierarchy validated across desktop and tablet viewports.',
            ],
          },
          {
            id: 'sec-3',
            heading: '3. Financial Governance & Cloud Optimization',
            level: 1,
            content:
              'Cloud compute expenditures currently stand at $14,200/month. The engineering lead presented a spot instance scheduling and auto-scaling policy designed to reduce monthly run-rate below $12,000.',
            callout: {
              type: 'key_takeaway',
              text: 'Anticipated monthly savings of $2,200 (15.5% reduction) with zero impact on throughput.',
            },
          },
        ],
        tables: [
          {
            id: 'tbl-1',
            title: 'Budget Optimization & Cloud Run-Rate Breakdown',
            headers: ['Service Component', 'Current Spend', 'Target Spend', 'Projected Savings'],
            rows: [
              ['GPU Inference Cluster (H100)', '$8,500 / mo', '$7,000 / mo', '$1,500 / mo'],
              ['Asynchronous Queue Workers', '$3,200 / mo', '$2,800 / mo', '$400 / mo'],
              ['Vector Storage & Edge CDN', '$2,500 / mo', '$2,200 / mo', '$300 / mo'],
              ['Total Infrastructure Spend', '$14,200 / mo', '$12,000 / mo', '$2,200 / mo'],
            ],
            summary: 'Infrastructure cost re-allocation plan achieved through spot scheduling and cache warmers.',
          },
        ],
        actionItems: [
          {
            id: 'act-1',
            task: 'Implement background queue retry backoff with exponential jitter',
            assignee: 'David Chen',
            dueDate: 'Oct 20, 2026',
            priority: 'High',
            status: 'In Progress',
          },
          {
            id: 'act-2',
            task: 'Deploy OAuth2 token rotation security patch to staging',
            assignee: 'Marcus Vance',
            dueDate: 'Oct 16, 2026',
            priority: 'High',
            status: 'Pending',
          },
          {
            id: 'act-3',
            task: 'Finalize responsive export modal and WCAG color contrast audit',
            assignee: 'Maya Lin',
            dueDate: 'Oct 18, 2026',
            priority: 'Medium',
            status: 'Pending',
          },
          {
            id: 'act-4',
            task: 'Prepare automated 50-client regression test suite for file uploads',
            assignee: 'Elena Rostova',
            dueDate: 'Oct 25, 2026',
            priority: 'High',
            status: 'Pending',
          },
        ],
        keyTakeaways: [
          'Enterprise p95 SLA targets are non-negotiable; architectural edge caching is priority #1.',
          'Release hardening begins with a strict code freeze on October 28.',
          'Penetration testing is scheduled for early November ahead of general availability.',
        ],
        metrics: {
          wordCount: Math.max(wordCount, 320),
          estimatedReadTimeMinutes: 2,
          readingGradeLevel: 'Grade 11 (Professional)',
          sentiment: 'Formal',
        },
      },
      promptTokens: 520,
      completionTokens: 890,
      confidenceScore: 0.98,
    };
  }

  if (detectedType === 'invoice') {
    return {
      data: {
        title: 'Commercial Billing Statement & Invoice',
        subtitle: 'Invoice Ref: INV-2026-8849',
        documentType: 'invoice',
        executiveSummary:
          'Itemized billing statement for enterprise cloud AI infrastructure, dedicated GPU inference clusters, and high-throughput background document processing pipelines.',
        author: 'NeuralScale Systems Billing Dept',
        date: formattedDate,
        version: 'Final Bill',
        organization: 'NeuralScale Systems Inc.',
        tags: ['Invoice', 'Cloud Compute', 'AI Infrastructure', 'Billing', 'Net 30'],
        sections: [
          {
            id: 'inv-sec-1',
            heading: '1. Billing & Account Information',
            level: 1,
            content:
              'Invoice generated for Vanguard Robotics Corp. All charges are calculated on a monthly Net-30 billing cycle in accordance with Master Service Agreement terms.',
            bulletPoints: [
              'Vendor: NeuralScale Systems Inc., 540 Market St, San Francisco, CA (Tax ID: 94-8839201)',
              'Client: Vanguard Robotics Corp., Accounts Payable, 742 Evergreen Terrace, Seattle, WA',
              'Payment Due Date: November 19, 2026 (Net 30 via Wire / ACH)',
            ],
          },
          {
            id: 'inv-sec-2',
            heading: '2. Payment Terms & Wire Instructions',
            level: 1,
            content:
              'Please remit payment in USD via ACH or wire transfer referencing invoice number INV-2026-8849. Late payments accrue interest at 1.5% per month.',
            callout: {
              type: 'note',
              text: 'Wire Details: Silicon Valley Bank | Routing: 121000358 | Account: 99482019482',
            },
          },
        ],
        tables: [
          {
            id: 'inv-tbl-1',
            title: 'Itemized Cloud Services & Resource Consumption',
            headers: ['Item Description', 'Quantity', 'Unit Rate', 'Amount (USD)'],
            rows: [
              ['Dedicated GPU Inference Cluster (H100 Node x2)', '1 Month', '$4,500.00', '$4,500.00'],
              ['Asynchronous Queue Processing Engine (10M Ops)', '10 Units', '$120.00', '$1,200.00'],
              ['Multimodal Document Parsing & OCR Stream', '45,000 Pgs', '$0.02', '$900.00'],
              ['Edge CDN & Vector Database Storage (500GB SSD)', '1 Unit', '$350.00', '$350.00'],
              ['Priority 24/7 Enterprise Support Package', '1 Month', '$750.00', '$750.00'],
            ],
            summary: 'Comprehensive list of billable cloud resources and managed services utilized.',
          },
        ],
        financials: {
          currency: '$',
          subtotal: 7700.0,
          tax: 635.25,
          total: 7950.25,
          lineItems: [
            { description: 'Dedicated GPU Inference Cluster (H100 Node x2)', quantity: 1, unitPrice: 4500.0, total: 4500.0 },
            { description: 'Asynchronous Queue Processing Engine (10M Ops)', quantity: 10, unitPrice: 120.0, total: 1200.0 },
            { description: 'Multimodal Document Parsing & OCR Stream', quantity: 45000, unitPrice: 0.02, total: 900.0 },
            { description: 'Edge CDN & Vector Database Storage (500GB SSD)', quantity: 1, unitPrice: 350.0, total: 350.0 },
            { description: 'Priority 24/7 Enterprise Support Package', quantity: 1, unitPrice: 750.0, total: 750.0 },
          ],
        },
        actionItems: [
          {
            id: 'inv-act-1',
            task: 'Approve invoice and schedule ACH wire disbursement prior to Nov 19',
            assignee: 'Accounts Payable Dept',
            dueDate: 'Nov 19, 2026',
            priority: 'High',
            status: 'Pending',
          },
        ],
        keyTakeaways: [
          'Subtotal reflects standard enterprise platform tier with 5% volume discount applied.',
          'All services rendered comply with SOC2 Type II SLA parameters.',
        ],
        metrics: {
          wordCount: Math.max(wordCount, 210),
          estimatedReadTimeMinutes: 1,
          readingGradeLevel: 'Business Professional',
          sentiment: 'Formal',
        },
      },
      promptTokens: 410,
      completionTokens: 680,
      confidenceScore: 0.99,
    };
  }

  if (detectedType === 'contract') {
    return {
      data: {
        title: 'Master Cloud SLA & Data Governance Agreement',
        subtitle: 'Enterprise Terms of Service & Model Privacy Covenant',
        documentType: 'contract',
        executiveSummary:
          'Legally binding service agreement outlining dedicated AI inference provisioning, guaranteed 99.95% availability SLA, explicit zero-data-retraining warranties, and billing schedules.',
        author: 'Office of General Counsel',
        date: formattedDate,
        version: 'v2.0 (Executed)',
        organization: 'ApexCloud Technologies Inc.',
        tags: ['Legal Agreement', 'SLA Guarantee', 'Data Privacy', 'SOC2 Compliance', 'Enterprise'],
        sections: [
          {
            id: 'con-1',
            heading: '1. Service Scope & Infrastructure Provisioning',
            level: 1,
            content:
              'Provider agrees to deploy dedicated, multi-region GPU inference clusters and asynchronous document ingestion worker nodes. High-availability failover across geographic availability zones is guaranteed.',
          },
          {
            id: 'con-2',
            heading: '2. Service Level Agreement (SLA) & Response Commitments',
            level: 1,
            content:
              'The core API is backed by a 99.95% monthly uptime guarantee. Model inference latency is capped at p95 < 1,200ms for payloads up to 10MB.',
            bulletPoints: [
              '99.95% monthly core platform availability.',
              'Severity-1 emergency response guaranteed within 15 minutes (24/7/365).',
              'Pro-rata service credits issued for any downtime exceeding monthly thresholds.',
            ],
          },
          {
            id: 'con-3',
            heading: '3. Data Privacy & Zero Foundation Model Retraining',
            level: 1,
            content:
              'Provider explicitly warrants that Customer data, documents, vectors, and extracted structured payloads SHALL NOT be utilized to train, tune, or evaluate foundation models. All data is encrypted in-transit (TLS 1.3) and at-rest (AES-256).',
            callout: {
              type: 'key_takeaway',
              text: 'Complete tenant isolation and HIPAA/SOC2 Type II data residency compliance enforced.',
            },
          },
        ],
        tables: [
          {
            id: 'con-tbl-1',
            title: 'SLA Performance Tiers & Credit Schedule',
            headers: ['Monthly Uptime %', 'Severity Classification', 'Target Response', 'Service Credit'],
            rows: [
              ['99.95% - 100%', 'Normal Operation', '< 2 Hours', '0%'],
              ['99.00% - 99.94%', 'Severity 2 (Degraded)', '< 30 Minutes', '10% Billing Credit'],
              ['95.00% - 98.99%', 'Severity 1 (Major Outage)', '< 15 Minutes', '25% Billing Credit'],
              ['< 95.00%', 'Critical Outage', 'Immediate Hotline', '50% Billing Credit'],
            ],
            summary: 'Standardized SLA service credits applicable against future monthly subscription invoices.',
          },
        ],
        actionItems: [
          {
            id: 'con-act-1',
            task: 'Execute counter-signature and file digital copy with compliance vault',
            assignee: 'Legal Counsel',
            dueDate: 'Nov 01, 2026',
            priority: 'High',
            status: 'In Progress',
          },
          {
            id: 'con-act-2',
            task: 'Issue dedicated tenant API keys and configure IP allowlist',
            assignee: 'DevOps Security Team',
            dueDate: 'Nov 03, 2026',
            priority: 'Medium',
            status: 'Pending',
          },
        ],
        keyTakeaways: [
          'Initial agreement duration is 12 months with standard 30-day cure period for material breach.',
          'Zero data sharing or public model retraining guarantee strictly protects customer IP.',
        ],
        metrics: {
          wordCount: Math.max(wordCount, 380),
          estimatedReadTimeMinutes: 3,
          readingGradeLevel: 'Legal & Executive',
          sentiment: 'Formal',
        },
      },
      promptTokens: 640,
      completionTokens: 920,
      confidenceScore: 0.97,
    };
  }

  // Default / Generic Document Transformation
  const firstHeader = lines[0] || 'Executive Document Intelligence Report';
  const subHeader = lines[1] || 'Synthesized Document Transformation';

  return {
    data: {
      title: firstHeader.replace(/^#+\s*/, '').slice(0, 70),
      subtitle: subHeader.slice(0, 90),
      documentType: detectedType,
      executiveSummary: `This executive document was processed through our AI intelligence pipeline. The content was structured into logical sections, formatted for high readability, and enriched with key takeaways, data matrices, and actionable next steps.`,
      author: 'DocAI Intelligent System',
      date: formattedDate,
      version: 'v1.0 (Standardized)',
      organization: 'Enterprise Document Intelligence',
      tags: ['AI Processed', 'Structured Document', 'Executive Ready', 'Automated PDF'],
      sections: [
        {
          id: 'gen-sec-1',
          heading: '1. Executive Overview & Context',
          level: 1,
          content: lines.slice(0, 4).join(' ') || 'The uploaded document contains core operational guidelines and key strategic directives synthesized for executive presentation.',
          bulletPoints: lines.slice(4, 7).filter(l => l.length > 5),
          callout: {
            type: 'note',
            text: 'Content has been automatically normalized, validated against schema standards, and formatted for publication.',
          },
        },
        {
          id: 'gen-sec-2',
          heading: '2. Detailed Analysis & Key Findings',
          level: 1,
          content: lines.slice(7, 12).join(' ') || 'Comprehensive review of operational parameters indicates strong alignment with industry benchmarks and core organizational objectives.',
          bulletPoints: [
            'System architecture maintains high resiliency and fault isolation.',
            'Continuous monitoring ensures proactive anomaly detection and response.',
            'Structured data formats enable seamless downstream analytics and reporting.',
          ],
        },
        {
          id: 'gen-sec-3',
          heading: '3. Strategic Roadmap & Future Milestones',
          level: 1,
          content: lines.slice(12, 16).join(' ') || 'The roadmap focuses on scaling core infrastructure, optimizing performance metrics, and expanding automated intelligence capabilities.',
          callout: {
            type: 'key_takeaway',
            text: 'All milestone deliverables remain on track for scheduled release.',
          },
        },
      ],
      tables: [
        {
          id: 'gen-tbl-1',
          title: 'Document Analysis & Performance Matrix',
          headers: ['Metric Parameter', 'Observed Value', 'Benchmark Standard', 'Compliance Status'],
          rows: [
            ['Document Readability Index', '92.4 / 100', '> 85.0', 'Passed'],
            ['Syntactic Structure Score', '98.1%', '> 95.0%', 'Optimal'],
            ['Information Density Ratio', '0.84', '0.70 - 0.90', 'Balanced'],
            ['Executive Synthesis Rating', 'A+', 'A / B', 'Exemplary'],
          ],
          summary: 'Automated linguistic and semantic evaluation metrics for the processed document.',
        },
      ],
      actionItems: [
        {
          id: 'gen-act-1',
          task: 'Review structured PDF conversion and distribute to key stakeholders',
          assignee: 'Project Lead',
          dueDate: 'Immediate',
          priority: 'High',
          status: 'In Progress',
        },
        {
          id: 'gen-act-2',
          task: 'Archive raw source file and verify cryptographic hash in audit vault',
          assignee: 'Compliance Officer',
          dueDate: formattedDate,
          priority: 'Medium',
          status: 'Pending',
        },
      ],
      keyTakeaways: [
        'Document successfully converted into publication-ready executive format.',
        'Data extracted with guaranteed schema integrity and structured tables.',
        'Ready for immediate PDF export, archiving, or executive briefing.',
      ],
      metrics: {
        wordCount: Math.max(wordCount, 260),
        estimatedReadTimeMinutes: Math.max(1, Math.ceil(wordCount / 180)),
        readingGradeLevel: 'Standard Professional',
        sentiment: 'Informative',
      },
    },
    promptTokens: 380,
    completionTokens: 710,
    confidenceScore: 0.96,
  };
}
