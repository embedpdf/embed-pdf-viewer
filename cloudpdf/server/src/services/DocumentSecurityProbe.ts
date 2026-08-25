import { EngineError, EngineErrorCode, wirePack } from '@embedpdf/engine-core/runtime';

import { DocumentQuarantinedError } from './CrashJournal';
import type { DocumentSecurityInfo } from '../db/repos/documents.repo';
import type { EnginePool } from '../runtime/EnginePool';
import type { BaseFileCache, LocalFileHandle } from '../storage/BaseFileCache';

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
  pool?: EnginePool;
  /**
   * Called when a probe attempt fails before the security state is
   * recorded as `unknown`. The probe is deliberately best-effort — it
   * never fails a commit — but the cause must not be invisible: a
   * broken materialise path once hid behind this catch for every
   * presigned upload. Wire this to the app logger.
   */
  onError?: (err: unknown, ctx: { key: string; sha: string }) => void;
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
    } catch (err) {
      // A quarantine refusal is a VERDICT, not a probe failure: letting
      // it degrade to security:'unknown' would admit an upload of a sha
      // that repeatedly crashed the engine. Rethrow → the ingestion
      // pipeline surfaces the 422; everything else stays best-effort.
      if (err instanceof DocumentQuarantinedError) throw err;
      this.opts.onError?.(err, { key: input.key, sha: input.expectedSha });
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
