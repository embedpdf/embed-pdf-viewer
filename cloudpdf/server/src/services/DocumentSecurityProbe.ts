import { EngineError, EngineErrorCode, wirePack } from '@embedpdf/engine-core/runtime';
import type { DocumentSecurityInfo } from '../db/repos/documents.repo';
import type { BaseFileCache, LocalFileHandle } from '../storage/BaseFileCache';
import type { WorkerThreadPool } from '../runtime/WorkerThreadPool';

export interface DocumentSecurityProbeInput {
  key: string;
  expectedSha: string;
  password?: string | null;
  signal?: AbortSignal;
}

export interface DocumentSecurityProbeResult {
  security: DocumentSecurityInfo;
}

export interface DocumentSecurityProbeOptions {
  cache?: BaseFileCache;
  pool?: WorkerThreadPool;
}

/**
 * Server-side ingestion security probe. The API process only
 * materializes the uploaded object and dispatches a one-shot worker
 * job; PDFium parsing stays inside `WorkerHost`.
 */
export class DocumentSecurityProbe {
  constructor(private readonly opts: DocumentSecurityProbeOptions = {}) {}

  async probe(input: DocumentSecurityProbeInput): Promise<DocumentSecurityProbeResult> {
    const { cache, pool } = this.opts;
    if (!cache || !pool) {
      return { security: unknownSecurity() };
    }

    let handle: LocalFileHandle | null = null;
    try {
      handle = await cache.acquire({
        sha: input.expectedSha,
        key: input.key,
        signal: input.signal,
      });
      const result = await pool.runAdHoc(
        input.expectedSha,
        (jobId) =>
          wirePack({
            kind: 'document.probeSecurityFile' as const,
            jobId,
            path: handle!.path,
            password: input.password ?? null,
          }),
        input.signal,
      );
      if (result.tag !== 'document.probeSecurityFile') {
        throw new EngineError(
          EngineErrorCode.WireFormat,
          `unexpected security probe payload: ${result.tag}`,
        );
      }
      return { security: result.security };
    } catch {
      return { security: unknownSecurity() };
    } finally {
      handle?.release();
    }
  }
}

function unknownSecurity(): DocumentSecurityInfo {
  return {
    encryptionState: 'unknown',
    encryptionRequiresPassword: null,
    securityHandlerRevision: null,
    pdfPermissionsBits: null,
    pdfPermissionsAllAllowed: null,
    pdfOpenedAs: null,
    securityProbedAt: Date.now(),
  };
}
