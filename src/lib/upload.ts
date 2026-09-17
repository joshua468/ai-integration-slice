import { config, maxFileSizeBytes } from './config';

const ALLOWED_MIME = new Set<string>(config.file.allowedMimeTypes);
const ALLOWED_EXT: string[] = [...config.file.allowedExtensions];

function getExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

function allowedByMimeOrExt(mimeType: string, name: string): boolean {
  if (ALLOWED_MIME.has(mimeType)) return true;
  return ALLOWED_EXT.includes(getExtension(name));
}

/** Shared server-side upload policy. Returns a human-readable rejection reason, or null if valid. */
export function validateUploadFile(fileName: string, mimeType: string, size: number): string | null {
  if (!fileName || size === 0) {
    return 'Empty file — nothing to process.';
  }
  if (size > maxFileSizeBytes) {
    return `File exceeds the ${(maxFileSizeBytes / 1024 / 1024).toFixed(0)} MB limit (${(size / 1024 / 1024).toFixed(2)} MB).`;
  }
  if (!allowedByMimeOrExt(mimeType, fileName)) {
    return `File type "${mimeType || 'unknown'}" (${getExtension(fileName) || 'no extension'}) is not allowed. Allowed: ${config.file.allowedExtensions.join(', ')}`;
  }
  return null;
}