---
name: document-intelligence-pipeline
description: >-
  Use this skill to run, test, and debug the 5-stage background document processing pipeline (QUEUED -> PREPROCESSING -> INFERENCE -> FORMATTING -> COMPILING_PDF -> COMPLETED/FAILED), inspect the FIFO queue worker, manage local object storage, and diagnose execution logs.
---

# Document Intelligence Pipeline Skill

This skill guides the agent through operating, validating, and debugging the asynchronous multi-document ingestion and PDF synthesis pipeline.

---

## 5-Stage Pipeline Overview

```
QUEUED (0%) ──▶ PREPROCESSING (20%) ──▶ INFERENCE (50%) ──▶ FORMATTING (75%) ──▶ COMPILING_PDF (90%) ──▶ COMPLETED (100%)
                                                │
                                                └──[Error / Schema Failure]──▶ FAILED
```

1. **`QUEUED`:** Job enqueued into bounded FIFO queue (`config.queue.concurrency = 2`).
2. **`PREPROCESSING`:** Reads file from `storage/uploads/<uuid>/<name>`, extracts text (plaintext/markdown/DOCX/PDF).
3. **`INFERENCE`:** Executes Role 1 prompt against Google Gemini (or selected provider) with timeout AbortController (30s).
4. **`FORMATTING`:** Cleans JSON fences, validates data structure with Zod `StructuredDocumentSchema`, retries on failure up to 3 times.
5. **`COMPILING_PDF`:** Converts structured data into executive PDF layout via `jsPDF` and persists base64 data URI.
6. **`COMPLETED` / `FAILED`:** Persists token metrics, processing time, and audit logs.

---

## Workflows & Procedures

### 1. Ingest Batch Documents via API
To test ingestion from CLI or automated test scripts:

```bash
# Upload a test file with curl or Node script
curl -X POST http://localhost:3000/api/jobs \
  -F "files[]=@src/lib/presets.ts" \
  -F "documentType=notes" \
  -F "modelProvider=simulation" \
  -F "templateStyle=executive"
```

### 2. Inspect FIFO Queue Status
```bash
curl http://localhost:3000/api/jobs?limit=5
```
Inspect the `queue` object in the JSON response:
```json
{
  "queue": {
    "active": 1,
    "capacity": 2,
    "queued": 0
  }
}
```

### 3. Check Real-Time SSE Stream for a Job
```bash
curl -N http://localhost:3000/api/jobs/<JOB_ID>/stream
```

### 4. Verify Local Object Storage
Verify that uploaded files land under `storage/uploads/<uuid>/` and that the database holds only the key:
- Check `Job.storageKey` in SQLite (`prisma/dev.db`).
- Check file existence in `storage/uploads/...`.

---

## References
- [Pipeline Troubleshooting & Runbook](./references/pipeline-runbook.md)
