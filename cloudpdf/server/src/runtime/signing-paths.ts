import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Where a signing candidate lives between `prepare` and the upload of
 * its tail, and where a completion rebuilds it. The API process and the
 * engine workers (in-process threads or the supervised host's threads on
 * the same machine) derive the SAME path from the signing id, so nothing
 * but the id needs to cross the engine boundary: the server streams the
 * tail from here right after prepare, and the worker deletes the file on
 * abort. One directory per signing keeps concurrent attempts apart.
 */
export function defaultSigningRoot(): string {
  return join(tmpdir(), 'cloudpdf-signing');
}

export function signingCandidatePath(root: string, signingId: string): string {
  return join(root, signingId, 'candidate.pdf');
}

/** The worker-side factory `WorkerHostOptions.signingCandidatePath` expects. */
export function signingCandidatePathFactory(
  root: string,
): (basePath: string, signingId: string) => string {
  return (_basePath, signingId) => {
    const path = signingCandidatePath(root, signingId);
    mkdirSync(join(root, signingId), { recursive: true });
    return path;
  };
}
