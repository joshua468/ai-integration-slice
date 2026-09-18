# Runbook: Pipeline Troubleshooting & Diagnosis

## Common Issues & Resolutions

### 1. Gemini API Error 404 (Model Not Found)
- **Symptom:** Logs show `[GoogleGenerativeAI Error]: models/gemini-1.5-flash is not found or is not supported for generateContent`.
- **Cause:** Certain legacy Flash model identifiers are deprecated or not enabled on the active Google API project key.
- **Solution:** Verify `config.provider.gemini.analysisModel` in `src/lib/config.ts` is set to `gemini-3.6-flash` (or a model returned by `ModelService.ListModels`).

### 2. Schema Validation Rejection (`AIFailureError: VALIDATION`)
- **Symptom:** Job transitions to `FAILED` with `The model returned output that failed schema validation`.
- **Diagnostics:**
  1. Inspect `JobLog` entries for `jobId` to view the validation error trail.
  2. Check if the model returned markdown code fences or invalid JSON syntax.
  3. Verify whether the orchestrator retry loop attempted all 3 retries with feedback.

### 3. Rate Limit Exceeded (429)
- **Symptom:** `POST /api/jobs` returns `429 Too Many Requests`.
- **Cause:** Client IP exceeded 15 requests in the 60-second fixed window.
- **Solution:** Inspect `RateLimitEntry` table in SQLite. Wait for window expiration or test with a simulated client IP.

### 4. Storage Path Traversal Violation
- **Symptom:** Error `Path traversal detected`.
- **Cause:** A filename or storageKey contains `../` or attempts to escape `config.storage.root`.
- **Solution:** Ensure `resolveUploadPath()` guards are respected and keys follow the UUID format `<uuid>/<safe_filename>`.
