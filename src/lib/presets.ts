import { DocumentType } from './types';

export interface SamplePreset {
  id: string;
  title: string;
  category: string;
  documentType: DocumentType;
  description: string;
  fileName: string;
  mimeType: string;
  icon: string;
  badgeColor: string;
  rawContent: string;
}

export const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: 'preset-meeting-notes',
    title: 'Q4 Product Roadmap & Sprint Action Items',
    category: 'Meeting Notes',
    documentType: 'notes',
    description: 'Raw, messy sprint notes with timestamps, blockers, and unassigned action items.',
    fileName: 'sprint_planning_q4_unformatted.txt',
    mimeType: 'text/plain',
    icon: 'FileText',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    rawContent: `Meeting Date: 14 Oct 2026 10:15 AM
Attendees: Sarah Jenkins (VP Prod), David Chen (Lead Arch), Maya Lin (Design), Marcus Vance (SecOps), Elena Rostova (QA)
Topic: Q4 AI Infrastructure Launch & Core Service Migration

Notes & Brainstorming:
- David brought up the latency spikes on the ingestion worker. We are seeing 4.2s p99 in us-east-1 when handling multimodal batch uploads over 15MB.
- Sarah: We promised enterprise tier customers sub-1.5s p95 by Nov 1st. This is a hard SLA.
- Maya: Design system v3 is 85% done. Dark mode tokens need contrast audit against WCAG 2.1 AA. Need 3 days to finalize component specs.
- Marcus: Security audit found 2 low-risk items in session token rotation. Fix is ready for PR #412.
- Budget review: Cloud GPU compute spend is currently at $14,200 / mo. Target is under $12,000 / mo with spot instance scheduling.

Key Decisions:
1. Approved migration to Prisma SQLite edge cache for read replicas.
2. Freeze non-critical PRs starting Oct 28 for final release hardening.
3. Schedule penetration test for the week of Nov 4.

Action Items:
- David Chen to implement background queue worker retry backoff with exponential jitter by Oct 20 (High Priority)
- Maya Lin to deliver responsive export modal design and mobile layout breakpoints by Oct 18 (Medium Priority)
- Marcus Vance to deploy OAuth2 token rotation patch to staging by Oct 16 (High Priority)
- Elena Rostova to prepare automated end-to-end regression test suite covering 50 concurrent file uploads by Oct 25 (High Priority)
- Sarah Jenkins to update executive board slide deck with new p95 SLA targets by Oct 22 (Low Priority)`,
  },
  {
    id: 'preset-contract-proposal',
    title: 'Enterprise AI Cloud Services Agreement',
    category: 'Legal & Contract',
    documentType: 'contract',
    description: 'Master service agreement draft with terms of service, SLA tiers, and billing schedule.',
    fileName: 'master_services_agreement_v1.md',
    mimeType: 'text/markdown',
    icon: 'ShieldCheck',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    rawContent: `# MASTER SERVICES & CLOUD SLA AGREEMENT

**Effective Date:** November 1, 2026
**Between:** ApexCloud Technologies Inc. ("Provider") and Horizon Global Enterprises LLC ("Customer")

## 1. Scope of Services
Provider agrees to provision dedicated, multi-region AI inference clusters and asynchronous document ingestion pipelines as specified in Exhibit A. All services are governed by ISO 27001 and SOC2 Type II compliance standards.

## 2. Service Level Agreement (SLA) & Uptime Commitments
- 99.95% Guaranteed Monthly Core API Availability
- P95 Model Inference Latency: < 1,200ms for payloads up to 10MB
- Support Response Time: Under 15 minutes for Severity-1 critical outages (24/7/365 dedicated hotline)

## 3. Financial Terms & Payment Schedule
- **Monthly Platform Base Subscription:** $8,500.00 USD (Billed on 1st of each calendar month)
- **Dedicated Ingestion Worker Surcharge:** $1,250.00 USD / month
- **Overage Rate:** $0.0025 per 1,000 processed tokens beyond the 100M monthly token baseline
- **Payment Terms:** Net-30 via ACH or Wire Transfer

## 4. Data Privacy & Model Retraining
Provider explicitly warrants that Customer data, uploaded documents, vectors, and extracted structured metadata SHALL NOT be used to train or fine-tune public foundation models. All tenant data is encrypted in-transit (TLS 1.3) and at-rest (AES-256).

## 5. Term & Termination
This agreement shall remain in force for an initial term of twelve (12) months. Either party may terminate with thirty (30) days written notice upon uncured material breach.

**Signatures:**
ApexCloud Technologies Inc.: _Jonathan Reed, Chief Operating Officer_
Horizon Global Enterprises: _Alicia Vance, Chief Technology Officer_`,
  },
  {
    id: 'preset-invoice-billing',
    title: 'Cloud Infrastructure & AI Worker Invoice',
    category: 'Finance & Invoice',
    documentType: 'invoice',
    description: 'Detailed billing statement with line-item breakdowns, tax calculations, and payment terms.',
    fileName: 'invoice_INV-2026-8849.txt',
    mimeType: 'text/plain',
    icon: 'Receipt',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    rawContent: `INVOICE: INV-2026-8849
Date of Issue: October 20, 2026
Due Date: November 19, 2026 (Net 30)

Billed From:
NeuralScale Systems Inc.
540 Market Street, Suite 900
San Francisco, CA 94104
Tax ID: 94-8839201

Billed To:
Vanguard Robotics Corp.
Attention: Accounts Payable
742 Evergreen Terrace
Seattle, WA 98101

LINE ITEMS:
1. Dedicated GPU Inference Cluster (H100 Node x2) - Oct 2026
   Qty: 1 | Unit Price: $4,500.00 | Total: $4,500.00
2. Asynchronous Queue Processing Engine (10M Job Operations)
   Qty: 10 | Unit Price: $120.00 | Total: $1,200.00
3. Multimodal Document Parsing & OCR Stream
   Qty: 45,000 Pages | Unit Price: $0.02 | Total: $900.00
4. Edge CDN & Vector Database Storage (500GB SSD NVMe)
   Qty: 1 | Unit Price: $350.00 | Total: $350.00
5. Priority 24/7 Enterprise Support Package
   Qty: 1 | Unit Price: $750.00 | Total: $750.00

FINANCIAL SUMMARY:
Subtotal: $7,700.00
State Sales Tax (8.25%): $635.25
Enterprise Discount (Applied 5%): -$385.00
TOTAL AMOUNT DUE: $7,950.25 USD

Payment Instructions:
Wire Transfer: Silicon Valley Bank
Routing: 121000358
Account: 99482019482
Ref: INV-2026-8849`,
  },
  {
    id: 'preset-tech-spec',
    title: 'High-Concurrency Event Worker Architecture',
    category: 'Technical Spec',
    documentType: 'spec',
    description: 'Engineering specification for background queues, SSE broadcast, and Prisma SQLite cache.',
    fileName: 'architecture_spec_background_worker.md',
    mimeType: 'text/markdown',
    icon: 'Cpu',
    badgeColor: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    rawContent: `# TECHNICAL SPECIFICATION: HIGH-THROUGHPUT ASYNCHRONOUS AI WORKER PIPELINE

**Author:** System Architecture Team
**Target Release:** v2.4.0
**Status:** Approved for Implementation

## 1. Executive Summary
This document specifies the background worker architecture for executing heavy multimodal AI document processing without blocking user HTTP requests. The system leverages an in-process persistent SQLite queue backed by Prisma ORM and delivers sub-50ms reactive status updates to frontend clients using Server-Sent Events (SSE).

## 2. Pipeline Execution Stages
Each ingested document transitions through five immutable pipeline stages:
1. **QUEUED:** Payload validated against Zod schema and stored in Prisma.
2. **PREPROCESSING:** Mime-type identification, character count extraction, image downsampling if > 10MB.
3. **INFERENCE:** Multimodal LLM execution with strict structured schema response format.
4. **FORMATTING:** Zod validation, table matrix reconstruction, and confidence scoring.
5. **COMPILING_PDF:** Executive PDF document generation with custom header templates and vector graphs.
6. **COMPLETED:** Payload persisted and SSE stream finalized.

## 3. Reliability & Fault Tolerance
- **Automatic Retry:** Worker implements 3 retry attempts with exponential backoff (1s, 4s, 16s).
- **Graceful Fallback:** If upstream AI provider returns 429 Rate Limit or 5xx, the worker seamlessly triggers the local fallback engine to preserve uptime.
- **SSE Heartbeats:** Stream sends keepalive comments every 15 seconds to prevent proxy timeout drops.`,
  },
  {
    id: 'preset-medical-report',
    title: 'Clinical Diagnostic & Health Summary',
    category: 'Medical / Health',
    documentType: 'report',
    description: 'Clinical laboratory diagnostic findings, biometric markers, and physician recommendations.',
    fileName: 'clinical_lab_panel_oct2026.txt',
    mimeType: 'text/plain',
    icon: 'Activity',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    rawContent: `PATIENT DIAGNOSTIC PANEL & HEALTH SUMMARY
Clinic: St. Jude Comprehensive Health Center
Patient ID: PT-892401 | Date of Exam: Oct 12, 2026
Attending Physician: Dr. Aris Thorne, MD (Internal Medicine)

PATIENT VITALS:
- Blood Pressure: 118/76 mmHg (Normal)
- Resting Heart Rate: 64 bpm
- BMI: 22.4 kg/m²
- SpO2: 99% on room air

METABOLIC & LIPID LAB RESULTS:
- Fasting Blood Glucose: 88 mg/dL [Reference: 70 - 99 mg/dL] - NORMAL
- HbA1c: 5.2% [Reference: < 5.7%] - OPTIMAL
- Total Cholesterol: 178 mg/dL [Reference: < 200 mg/dL] - DESIRABLE
- HDL ("Good") Cholesterol: 62 mg/dL [Reference: > 50 mg/dL] - EXCELLENT
- LDL ("Bad") Cholesterol: 98 mg/dL [Reference: < 100 mg/dL] - OPTIMAL
- Triglycerides: 89 mg/dL [Reference: < 150 mg/dL] - NORMAL
- Serum Vitamin D (25-OH): 48 ng/mL [Reference: 30 - 80 ng/mL] - SUFFICIENT

PHYSICIAN CLINICAL ASSESSMENT:
Patient exhibits stellar overall cardiovascular and metabolic health metrics. All lipid panel values and glycemic markers reside well within optimal target ranges.

RECOMMENDATIONS & ACTION PLAN:
1. Maintain current Mediterranean-style dietary regimen and regular aerobic exercise (150 min/wk).
2. Continue daily Vitamin D3 (1000 IU) supplementation throughout winter months.
3. Schedule annual follow-up routine diagnostic panel for October 2027.`,
  },
];
