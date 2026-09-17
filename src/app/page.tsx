'use client';

import { useRef, useState } from 'react';

type Mode = 'to-pdf' | 'to-word';

interface Result {
  url: string;
  name: string;
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('to-pdf');
  const [file, setFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept =
    mode === 'to-pdf' ? '.docx,.doc,.txt,.md' : '.pdf';
  const fromLabel = mode === 'to-pdf' ? 'Word' : 'PDF';
  const toLabel = mode === 'to-pdf' ? 'PDF' : 'Word';

  const pickFile = (f: File | undefined | null) => {
    setError(null);
    setResult(null);
    if (!f) return;
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const convert = async () => {
    if (!file || converting) return;
    setConverting(true);
    setError(null);
    setResult(null);

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('mode', mode);

      const res = await fetch('/api/convert', { method: 'POST', body: form });

      if (!res.ok) {
        let msg = 'Conversion failed.';
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/);
      const outName = match?.[1] || file.name.replace(/\.[^.]*$/, '') + (mode === 'to-pdf' ? '.pdf' : '.docx');

      setResult({ url: URL.createObjectURL(blob), name: outName });
    } catch (err: any) {
      setError(err?.message || 'Conversion failed.');
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-on-primary text-sm font-bold">
            C
          </div>
          <span className="text-2xl font-semibold tracking-tight">Convertdoc</span>
        </div>
        <span className="text-xs text-on-surface-muted">Free &amp; private — files never leave your browser upload</span>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-xl flex-1 px-6 pb-16">
        <div className="pt-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-medium tracking-tight">
            Convert documents, instantly.
          </h1>
          <p className="mt-3 text-on-surface-muted">
            Turn Word into PDF or PDF back into Word. Just pick a file.
          </p>
        </div>

        {/* Mode selector */}
        <div className="mt-8 grid grid-cols-2 gap-3 rounded-2xl bg-secondary-container p-1.5 text-on-secondary-container">
          <button
            onClick={() => {
              setMode('to-pdf');
              setFile(null);
              setError(null);
              setResult(null);
            }}
            className={`rounded-xl py-3 text-sm font-medium transition ${
              mode === 'to-pdf' ? 'bg-secondary text-on-secondary shadow-soft' : 'hover:opacity-80'
            }`}
          >
            Word → PDF
          </button>
          <button
            onClick={() => {
              setMode('to-word');
              setFile(null);
              setError(null);
              setResult(null);
            }}
            className={`rounded-xl py-3 text-sm font-medium transition ${
              mode === 'to-word' ? 'bg-secondary text-on-secondary shadow-soft' : 'hover:opacity-80'
            }`}
          >
            PDF → Word
          </button>
        </div>

        {/* Drop zone */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`mt-5 w-full rounded-2xl border-2 border-dashed bg-surface-elevated px-6 py-12 text-center transition ${
            dragging
              ? 'border-primary bg-primary-container'
              : 'border-secondary-container hover:border-secondary'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          {file ? (
            <div>
              <p className="truncate font-medium">{file.name}</p>
              <p className="mt-1 text-sm text-on-surface-muted">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          ) : (
            <>
              <p className="font-medium">
                Drop your {fromLabel} file here
              </p>
              <p className="mt-1 text-sm text-on-surface-muted">
                or click to browse · {accept.split(',').join(' ')}
              </p>
            </>
          )}
        </button>

        {/* Convert */}
        <button
          onClick={convert}
          disabled={!file || converting}
          className="mt-5 w-full rounded-2xl bg-primary py-4 text-base font-semibold text-on-primary transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {converting
            ? 'Converting…'
            : file
              ? `Convert ${fromLabel} to ${toLabel}`
              : 'Choose a file to start'}
        </button>

        {/* Error */}
        {error && (
          <div className="mt-5 rounded-xl bg-error-container px-4 py-3 text-sm text-on-error-container">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-5 flex items-center justify-between rounded-2xl bg-primary-container px-5 py-4">
            <div>
              <p className="font-semibold">{result.name}</p>
              <p className="text-sm text-on-primary-container">Ready to download</p>
            </div>
            <a
              href={result.url}
              download={result.name}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:opacity-90"
            >
              Download
            </a>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="px-6 py-6 text-center text-xs text-on-surface-muted">
        Convertdoc · Word to PDF &amp; PDF to Word
      </footer>
    </div>
  );
}