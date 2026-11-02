import { createHash } from 'node:crypto';

import {
  EngineError,
  EngineErrorCode,
  wirePack,
  type EngineFontFacts,
  type WorkerJobId,
} from '@embedpdf/engine-core/runtime';

import type { EnginePool } from '../runtime/EnginePool';

/**
 * The server's fonts as clients see them: their fingerprint (`serverFonts`,
 * in the manifest, the font list's URL and every picture's) and a served
 * font's bytes. Read from a worker's registry: every worker registers the
 * same fonts at startup, so any one answers for all.
 */
export class ServerFonts {
  private fingerprintRead: Promise<string> | null = null;

  constructor(private readonly pool: EnginePool) {}

  /**
   * The fingerprint of the server's font setup. Read once; a failed read is
   * tried again next time.
   */
  fingerprint(): Promise<string> {
    this.fingerprintRead ??= this.readFingerprint().catch((error: unknown) => {
      this.fingerprintRead = null;
      throw error;
    });
    return this.fingerprintRead;
  }

  /** A served font's program, by its SHA-256: `NotFound` for any other. */
  async programData(sha256: string, signal?: AbortSignal): Promise<Uint8Array> {
    const result = await this.pool.runAdHoc(
      undefined,
      (jobId: WorkerJobId) => wirePack({ kind: 'fonts.program', effect: 'read', jobId, sha256 }),
      signal,
    );
    if (result.tag !== 'fonts.program') {
      throw new EngineError(EngineErrorCode.WireFormat, `unexpected fonts payload: ${result.tag}`);
    }
    return new Uint8Array(result.bytes);
  }

  private async readFingerprint(): Promise<string> {
    const result = await this.pool.runAdHoc(undefined, (jobId: WorkerJobId) =>
      wirePack({ kind: 'fonts.list', effect: 'read', jobId }),
    );
    if (result.tag !== 'fonts.list') {
      throw new EngineError(EngineErrorCode.WireFormat, `unexpected fonts payload: ${result.tag}`);
    }
    return serverFontsFingerprint(result.engineFonts, result.fallbacks);
  }
}

/**
 * The fingerprint of a font setup: every font's key, program, face and
 * `serve`, and the fallbacks in the order they're tried. Computed from the
 * setup itself, so replicas with the same fonts agree, and a restart that
 * changes nothing re-keys nothing.
 */
export function serverFontsFingerprint(
  fonts: readonly EngineFontFacts[],
  fallbacks: readonly string[],
): string {
  const setup = {
    fonts: fonts.map((font) => ({
      key: font.key,
      sha256: font.sha256,
      familyName: font.identity.familyName,
      weight: font.identity.weight,
      italic: font.identity.italic,
      served: font.served,
    })),
    fallbacks,
  };
  return createHash('sha256').update(JSON.stringify(setup)).digest('hex').slice(0, 16);
}
