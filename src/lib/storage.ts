import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { config } from './config';

/**
 * Local object-storage equivalent for development (see README Section 5).
 *
 * Uploaded files are written to disk under config.storage.root, keyed
 * `<uuid>/<sanitised-original-name>`. The database stores ONLY that storage
 * key — never the file bytes. In production this module is swapped for S3/GCS
 * while the rest of the pipeline is unchanged.
 */

function sanitizeName(name: string): string {
  const base = path.basename(name)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80)
    .trim();
  return base || 'file.bin';
}

export function storageRoot(): string {
  return config.storage.root;
}

/** Persist a file buffer, returning the storage key (relative to the root). */
export async function saveUpload(buffer: Buffer, originalName: string): Promise<{ storageKey: string; size: number }> {
  const id = crypto.randomUUID();
  const safeName = sanitizeName(originalName);
  const key = `${id}/${safeName}`;
  const dest = path.join(config.storage.root, key);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buffer);
  return { storageKey: key, size: buffer.length };
}

/** Resolve a storage key to a safe absolute path, refusing path traversal. */
export function resolveUploadPath(storageKey: string): string {
  const absolute = path.resolve(config.storage.root, storageKey);
  const root = path.resolve(config.storage.root);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw new Error('Invalid storage key: traversal attempt blocked');
  }
  return absolute;
}

/** Read a stored file back as a Buffer. */
export async function readUpload(storageKey: string): Promise<Buffer> {
  return fs.readFile(resolveUploadPath(storageKey));
}

/** Absolute path to a stored file (used by the worker for extraction). */
export function uploadFilePath(storageKey: string): string {
  return resolveUploadPath(storageKey);
}

export async function removeUpload(storageKey: string): Promise<void> {
  try {
    await fs.unlink(resolveUploadPath(storageKey));
  } catch {
    // best-effort cleanup
  }
}