---
name: dual-role-ai-orchestration
description: >-
  Use this skill to orchestrate, evaluate, and test the two distinct AI prompt roles (Role 1: Structured Document Analyst, Role 2: Plain-Language Communicator), verify Zod schema validation feedback loops, calculate token/cost economics, and test failure simulation modes.
---

# Dual-Role AI Orchestration Skill

This skill provides procedures for testing, evaluating, and fine-tuning the dual-role AI prompts, schema validation loops, cost estimation, and truthful error simulation.

---

## The Dual Roles

| Parameter | Role 1: The Structured Analyst | Role 2: The Plain-Language Communicator |
| :--- | :--- | :--- |
| **Endpoint** | `POST /api/jobs` | `POST /api/jobs/[id]/followup` |
| **System Prompt** | `ANALYSIS_SYSTEM_PROMPT` | `FOLLOW_UP_SUMMARISE_SYSTEM_PROMPT` |
| **Temperature** | `0.2` (Near-deterministic) | `0.4` (Fluent / balanced) |
| **Max Tokens** | `4096` | `1024` |
| **Schema** | `StructuredDocumentSchema` | `FollowUpOutputSchema` |
| **Output Fields** | `title`, `executiveSummary`, `sections`, `tables`, `actionItems`, `financials`, `metrics` | `headline`, `summary`, `keyPoints`, `readabilityLevel`, `metrics` |

---

## Workflows

### 1. Test Role 1 Structured Analysis
1. Post a document to `/api/jobs` with `modelProvider="gemini"` (or `simulation`).
2. Verify that the output parses into `StructuredDocumentSchema` with non-empty sections and executive summary.
3. Validate that `promptTokens`, `completionTokens`, and `estimatedCost` are calculated:
   $$\text{Spend} = \frac{\text{promptTokens} \times 0.75 + \text{completionTokens} \times 3.75}{1,000,000}$$

### 2. Trigger Role 2 Plain-Language Follow-Up
```bash
curl -X POST http://localhost:3000/api/jobs/<JOB_ID>/followup \
  -H "Content-Type: application/json" \
  -d '{"action": "summarise"}'
```
**Verification:**
- Response creates a `FollowUp` record with `status: PENDING`.
- Worker executes `runFollowUpSummarise()` and sets `status: DONE`.
- `output` JSON contains `headline`, `summary`, `keyPoints`, and reduction metrics.

### 3. Test Truthful Failure Injection (`simulateInvalidOutput`)
To verify that the system never falls back silently to mock data:
1. Submit a job with `simulateInvalidOutput: true`.
2. Observe orchestrator receiving deliberately broken JSON.
3. Verify that the retry loop attempts 3 times with validation error feedback.
4. Confirm final state is `FAILED` with explicit `VALIDATION: ...` message recorded in database.

---

## References
- [Prompts & Schema Specifications](./references/prompts-and-schemas.md)
