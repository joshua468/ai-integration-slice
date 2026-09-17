'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface JobRow {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string | null;
  attempts: number;
  documentType: string;
  status: string;
  progress: number;
  currentStage: string;
  modelProvider: string;
  modelName: string;
  templateStyle: string;
  title: string | null;
  subtitle: string | null;
  summary: string | null;
  confidenceScore: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  estimatedCost: number | null;
  processingTimeMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface QueueMeta {
  active: number;
  capacity: number;
  queued: number;
}

interface JobDetail extends JobRow {
  logs: { stage: string; message: string; level: string; timestamp: string }[];
  pdfDataUri: string | null;
  rawAiResponse: string | null;
  structuredData: any | null;
}

interface FollowUp {
  id: string;
  action: string;
  status: string;
  attempts: number;
  errorMessage: string | null;
  output: any | null;
  totalTokens: number | null;
  estimatedCost: number | null;
  processingTimeMs: number | null;
  createdAt: string;
}

const ALLOWED_EXTS = ['.txt', '.md', '.markdown', '.json', '.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.gif', '.webp'];
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 8;

const STATUS_STYLES: Record<string, string> = {
  QUEUED: 'bg-slate-200 text-slate-700',
  PREPROCESSING: 'bg-sky-100 text-sky-700',
  INFERENCE: 'bg-amber-100 text-amber-700',
  FORMATTING: 'bg-violet-100 text-violet-700',
  COMPILING_PDF: 'bg-indigo-100 text-indigo-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-rose-100 text-rose-700',
};

const VALIDATION_PROVIDERS = ['gemini', 'simulation'];

export default function StudioPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<{ name: string; reason: string }[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [documentType, setDocumentType] = useState('generic');
  const [modelProvider, setModelProvider] = useState('gemini');
  const [modelName, setModelName] = useState('gemini-3.6-flash');
  const [templateStyle, setTemplateStyle] = useState('executive');
  const [simulateInvalid, setSimulateInvalid] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState<number | null>(null);

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [queue, setQueue] = useState<QueueMeta>({ active: 0, capacity: 2, queued: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [followUpsLoading, setFollowUpsLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs?limit=25');
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
        if (data.queue) setQueue(data.queue);
      }
    } catch {
      /* transient */
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    async function load() {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/jobs/${selectedId}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setDetail(data);
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setDetailLoading(false);
    }
    load();
    const t = setInterval(load, 2500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    async function load() {
      setFollowUpsLoading(true);
      try {
        const res = await fetch(`/api/jobs/${selectedId}/followup`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setFollowUps(data.followUps || []);
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setFollowUpsLoading(false);
    }
    load();
    const t = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [selectedId]);

  const validateFile = (f: File): string | null => {
    if (f.size === 0) return 'Empty file — nothing to process.';
    if (f.size > MAX_BYTES) return `Exceeds the 10 MB limit (${(f.size / 1024 / 1024).toFixed(2)} MB).`;
    const idx = f.name.lastIndexOf('.');
    const ext = idx >= 0 ? f.name.slice(idx).toLowerCase() : '';
    if (!ALLOWED_EXTS.includes(ext)) {
      return `Type not allowed (${ext || 'no extension'}). Allowed: ${ALLOWED_EXTS.join(', ')}`;
    }
    return null;
  };

  const addFiles = (list: FileList | File[]) => {
    setServerError(null);
    setRateLimited(null);
    const arr = Array.from(list);
    const combined = [...files, ...arr].slice(0, MAX_FILES);
    const errors: { name: string; reason: string }[] = [];
    for (const f of arr) {
      const reason = validateFile(f);
      if (reason) errors.push({ name: f.name, reason });
    }
    setFiles(combined);
    setFileErrors((prev) => [...prev, ...errors]);
  };

  const removeFile = (i: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  };

  const upload = async () => {
    if (serverError) setServerError(null);
    if (files.length === 0) {
      setServerError('Pick at least one file to run through the pipeline.');
      return;
    }
    setUploading(true);
    setRateLimited(null);

    // Client-side gate mirrors the server policy exactly.
    const valid = files.every((f) => validateFile(f) === null);
    if (!valid) {
      setUploading(false);
      setServerError('One or more files are rejected client-side before upload (see the list below).');
      return;
    }

    try {
      const form = new FormData();
      for (const f of files) form.append('files', f);
      form.append('documentType', documentType);
      form.append('modelProvider', modelProvider);
      form.append('modelName', modelName);
      form.append('templateStyle', templateStyle);
      if (simulateInvalid) form.append('simulateInvalidOutput', '1');

      const res = await fetch('/api/jobs', { method: 'POST', body: form });

      if (res.status === 429) {
        const retry = Number(res.headers.get('Retry-After') || '60');
        setRateLimited(retry);
        setServerError(`Rate limited: too many uploads. Try again in ~${retry}s.`);
        setUploading(false);
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        let msg = data?.error || 'Upload failed.';
        if (Array.isArray(data?.files)) {
          msg += ' Rejected: ' + data.files.map((x: any) => `${x.name} (${x.reason})`).join('; ');
        }
        setServerError(msg);
        setUploading(false);
        return;
      }

      setFiles([]);
      setFileErrors([]);
      refresh();
    } catch (err: any) {
      setServerError(err?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const runFollowUp = async (jobId: string) => {
    setServerError(null);
    setRateLimited(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summarise', modelProvider, modelName }),
      });
      if (res.status === 429) {
        const retry = Number(res.headers.get('Retry-After') || '60');
        setRateLimited(retry);
        setServerError(`Rate limited (follow-up). Try again in ~${retry}s.`);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setServerError(data?.error || 'Follow-up failed.');
        return;
      }
      setServerError(null);
    } catch (err: any) {
      setServerError(err?.message || 'Follow-up request failed.');
    }
  };

  const fmtUsd = (v: number | null | undefined): string => {
    if (v == null) return '—';
    if (v === 0) return '$0';
    if (v < 0.0001) return `$${v.toExponential(1)}`;
    return `$${v.toFixed(4)}`;
  };

  const fmtTime = (ms: number | null | undefined): string => {
    if (ms == null) return '—';
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const openJob = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
    setDetail(null);
    setFollowUps([]);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10 border-b border-on-surface-muted/10">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-on-primary text-sm font-bold">
            AI
          </div>
          <span className="text-2xl font-semibold tracking-tight">Integration Studio</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-on-surface-muted">
          <a href="/" className="hover:opacity-80 underline underline-offset-4">Home (Convertdoc)</a>
          <span className="rounded-full bg-secondary-container px-3 py-1 text-on-secondary-container">
            Queue {queue.active}/{queue.capacity} running · {queue.queued} queued
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-16">
        <div className="pt-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-medium tracking-tight">Document Intelligence Pipeline</h1>
          <p className="mt-2 text-on-surface-muted text-sm">
            Upload files → AI extracts a validated structured schema → executive PDF → plain-language follow-up.
            One model, two roles, one config file. Rate limits &amp; concurrency are enforced server-side.
          </p>
        </div>

        {/* Upload card */}
        <section className="mt-8 rounded-2xl bg-secondary-container p-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition ${
              dragging ? 'border-primary bg-primary/10' : 'border-on-surface-muted/30 hover:border-on-surface-muted/60'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ALLOWED_EXTS.join(',')}
              className="hidden"
              onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
            />
            <p className="text-sm font-medium">Drop files here, or click to choose (up to {MAX_FILES}, 10 MB each)</p>
            <p className="mt-1 text-xs text-on-surface-muted">Allowed: {ALLOWED_EXTS.join(', ')}</p>
          </div>

          {fileErrors.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-rose-700">
              {fileErrors.map((err, i) => (
                <li key={`${err.name}-${i}`}>✕ {err.name}: {err.reason}</li>
              ))}
            </ul>
          )}

          {files.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg bg-background px-3 py-2">
                  <span className="truncate">{f.name} <span className="text-xs text-on-surface-muted">{(f.size / 1024).toFixed(1)} KB</span></span>
                  <button onClick={() => removeFile(i)} className="text-xs text-rose-600 hover:underline">remove</button>
                </li>
              ))}
            </ul>
          )}

          {/* Pipeline controls */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="block text-xs">
              <span className="text-on-surface-muted">Document type</span>
              <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="mt-1 w-full rounded-lg bg-background px-2 py-2 text-sm">
                {['generic', 'invoice', 'report'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-on-surface-muted">Provider</span>
              <select value={modelProvider} onChange={(e) => { setModelProvider(e.target.value); setSimulateInvalid(false); }} className="mt-1 w-full rounded-lg bg-background px-2 py-2 text-sm">
                {VALIDATION_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-on-surface-muted">Analysis model</span>
              <input value={modelName} onChange={(e) => setModelName(e.target.value)} className="mt-1 w-full rounded-lg bg-background px-2 py-2 text-sm" />
            </label>
            <label className="block text-xs">
              <span className="text-on-surface-muted">PDF theme</span>
              <select value={templateStyle} onChange={(e) => setTemplateStyle(e.target.value)} className="mt-1 w-full rounded-lg bg-background px-2 py-2 text-sm">
                {['executive', 'modern', 'classic'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={simulateInvalid}
                disabled={modelProvider !== 'simulation'}
                onChange={(e) => setSimulateInvalid(e.target.checked)}
                className="h-4 w-4"
              />
              <span className={modelProvider !== 'simulation' ? 'text-on-surface-muted' : ''}>
                Validation-failure demo <span className="text-xs text-on-surface-muted">(sim model returns schema-breaking JSON)</span>
              </span>
            </label>
            <button
              onClick={upload}
              disabled={uploading || files.length === 0}
              className="ml-auto rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-on-primary shadow-soft transition hover:opacity-90 disabled:opacity-40"
            >
              {uploading ? 'Uploading & enqueuing…' : `Run pipeline (${files.length})`}
            </button>
          </div>

          {serverError && <p className="mt-3 text-sm text-rose-700">{serverError}</p>}
          {rateLimited != null && <p className="mt-1 text-xs text-amber-700">HTTP 429 — retry after {rateLimited}s (server-side rate limit). Follow-up and upload endpoints are separate limits.</p>}
        </section>

        {/* Jobs table */}
        <section className="mt-8">
          <h2 className="text-lg font-medium tracking-tight">Jobs</h2>
          {jobs.length === 0 ? (
            <p className="mt-3 text-sm text-on-surface-muted">No jobs yet. Upload something above — the queue processes files FIFO with a concurrency cap of {queue.capacity}.</p>
          ) : (
            <ul className="mt-3 divide-y divide-on-surface-muted/10 rounded-2xl bg-secondary-container">
              {jobs.map((j) => (
                <li key={j.id}>
                  <button onClick={() => openJob(j.id)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left text-sm hover:bg-on-surface-muted/10">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[j.status] || 'bg-slate-200 text-slate-700'}`}>{j.status}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{j.title || j.fileName}</span>
                    <span className="hidden text-xs text-on-surface-muted sm:inline">{j.modelProvider.toUpperCase()} · {j.modelName}</span>
                    <span className="hidden text-xs text-on-surface-muted lg:inline">tokens {j.totalTokens ?? '—'}</span>
                    <span className="text-xs text-on-surface-muted">{fmtUsd(j.estimatedCost)}</span>
                    <span className="text-xs text-on-surface-muted">attempts {j.attempts}</span>
                    <span className="text-xs text-on-surface-muted">{fmtTime(j.processingTimeMs)}</span>
                  </button>

                  <div className="px-4 pb-3">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-on-surface-muted/15">
                      <div
                        className={`h-full rounded-full transition-all ${j.status === 'FAILED' ? 'bg-rose-500' : j.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-primary'}`}
                        style={{ width: `${j.progress}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-on-surface-muted">Stage: {j.currentStage}</p>
                  </div>

                  {j.status === 'FAILED' && j.errorMessage && (
                    <div className="mx-4 mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">{j.errorMessage}</div>
                  )}

                  {selectedId === j.id && (
                    <div className="border-t border-on-surface-muted/10 bg-background px-4 py-4">
                      {detailLoading ? <p className="text-sm text-on-surface-muted">Loading…</p> : renderDetail(detail, followUps, followUpsLoading, runFollowUp)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function renderDetail(
  detail: JobDetail | null,
  followUps: FollowUp[],
  followUpsLoading: boolean,
  runFollowUp: (jobId: string) => void
) {
  if (!detail) return <p className="text-sm text-on-surface-muted">No detail available.</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Validated structured output</h3>
        {detail.structuredData ? (
          <pre className="max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
            {JSON.stringify(detail.structuredData, null, 2)}
          </pre>
        ) : (
          <p className="text-xs text-on-surface-muted">{detail.status === 'FAILED' ? 'No structured output — the job failed truthfully. See the red banner above.' : 'Pending…'}</p>
        )}

        <div>
          <h4 className="text-sm font-medium">Model trace</h4>
          <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-on-surface-muted">
            <dt className="text-on-surface-muted">Provider / model</dt><dd>{detail.modelProvider.toUpperCase()} · {detail.modelName}</dd>
            <dt>Prompt tokens</dt><dd>{detail.promptTokens ?? '—'}</dd>
            <dt>Completion tokens</dt><dd>{detail.completionTokens ?? '—'}</dd>
            <dt>Total tokens</dt><dd>{detail.totalTokens ?? '—'}</dd>
            <dt>Estimated cost</dt><dd>{fmtUsd(detail.estimatedCost)}</dd>
            <dt>Confidence</dt><dd>{detail.confidenceScore != null ? `${(detail.confidenceScore * 100).toFixed(0)}%` : '—'}</dd>
            <dt>Processing time</dt><dd>{fmtTime(detail.processingTimeMs)}</dd>
            <dt>Attempts</dt><dd>{detail.attempts}</dd>
          </dl>
        </div>

        {detail.rawAiResponse && (
          <details>
            <summary className="cursor-pointer text-xs font-medium text-on-surface-muted">Raw AI response</summary>
            <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{detail.rawAiResponse}</pre>
          </details>
        )}

        {detail.logs?.length ? (
          <details>
            <summary className="cursor-pointer text-xs font-medium text-on-surface-muted">Execution logs ({detail.logs.length})</summary>
            <ul className="mt-1 max-h-40 space-y-1 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
              {detail.logs.map((l, i) => (
                <li key={i}><span className="text-slate-400">{l.stage}</span> {l.message}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <div className="space-y-3">
        {detail.pdfDataUri ? (
          <iframe title="Executive PDF" src={detail.pdfDataUri} className="h-72 w-full rounded-lg border border-on-surface-muted/20 bg-white" />
        ) : (
          <p className="text-xs text-on-surface-muted">No executive PDF (job not completed successfully).</p>
        )}

        {detail.status === 'COMPLETED' && (
          <div className="rounded-lg border border-on-surface-muted/15 p-3">
            <h4 className="text-sm font-medium">Follow-up — Role 2: plain-language summarise</h4>
            <p className="mt-1 text-xs text-on-surface-muted">Second role prompt, second model call (temperature 0.4, 1,024 token cap).</p>
            <button onClick={() => runFollowUp(detail.id)} className="mt-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary hover:opacity-90">
              Run plain-language summary
            </button>
            {followUpsLoading ? <p className="mt-2 text-xs text-on-surface-muted">Loading…</p> : null}
            {followUps.map((f) => (
              <div key={f.id} className="mt-3 rounded-lg bg-secondary-container p-3 text-sm">
                <div className="flex items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${f.status === 'DONE' ? 'bg-emerald-100 text-emerald-700' : f.status === 'FAILED' ? 'bg-rose-100 text-rose-700' : 'bg-sky-100 text-sky-700'}`}>{f.status}</span>
                  <span className="text-on-surface-muted">attempts {f.attempts} · {f.totalTokens ?? 0} tokens · {fmtUsd(f.estimatedCost)} · {fmtTime(f.processingTimeMs)}</span>
                </div>
                {f.errorMessage && <p className="mt-1 text-xs text-rose-700">{f.errorMessage}</p>}
                {f.output && (
                  <div className="mt-2">
                    <p className="text-base font-medium">{f.output.headline}</p>
                    <p className="mt-1 text-sm text-on-surface-muted">{f.output.summary}</p>
                    {Array.isArray(f.output.keyPoints) && f.output.keyPoints.length > 0 && (
                      <ul className="mt-2 list-disc space-y-0.5 pl-4 text-sm">
                        {f.output.keyPoints.map((k: any, i: number) => <li key={i}>{typeof k === 'string' ? k : k?.text || k?.point}</li>)}
                      </ul>
                    )}
                    {f.output.metrics && (
                      <p className="mt-2 text-xs text-on-surface-muted">
                        {f.output.metrics.originalWordCount} → {f.output.metrics.summaryWordCount} words ({f.output.metrics.reductionPercent}% reduction) · {f.output.tone} · {f.output.readabilityLevel}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function fmtUsd(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v === 0) return '$0';
  if (v < 0.0001) return `$${v.toExponential(1)}`;
  return `$${v.toFixed(4)}`;
}

function fmtTime(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return `${(ms / 1000).toFixed(2)}s`;
}