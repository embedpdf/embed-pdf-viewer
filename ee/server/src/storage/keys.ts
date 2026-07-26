/**
 * Single source of truth for storage key construction.
 *
 * Layout (identical on FS / S3 / GCS / Azure):
 *
 *   <tenantId>/
 *     docs/
 *       <cd>/                     <- 2-char shard on docId for FS fanout
 *         <docId>/
 *           base.pdf              <- per-doc base PDF (Design A)
 *           layers/<name>/v00000001.layer
 *           events/<YYYY-MM>.jsonl
 *
 * Slashes are cosmetic on object stores; on FS they map to nested
 * directories. The 2-char shard prevents `ls <tenant>/docs/` from
 * blowing up at tens of millions of docs.
 *
 * `<cd>` is the first 2 hex chars of `docId`. We trust callers to
 * generate `docId`s with a uniform-ish prefix (UUID v4, ULID, our
 * own `doc_<base36>` helper all qualify).
 */

export const StorageKeys = {
  docRoot(tenantId: string, docId: string): string {
    return `${tenantId}/docs/${shard(docId)}/${docId}/`;
  },
  basePdf(tenantId: string, docId: string): string {
    return `${tenantId}/docs/${shard(docId)}/${docId}/base.pdf`;
  },
  /**
   * Layer artifact. `version` is a 1-based monotonic integer stored
   * zero-padded for lexical sort and human readability. Padding is not
   * a limit: v100000000.layer is valid once a layer gets that busy, and
   * the database remains the authority for current_version.
   */
  layerArtifact(tenantId: string, docId: string, layerName: string, version: number): string {
    return layerArtifactKey(tenantId, docId, layerName, version);
  },
  /**
   * Per-ATTEMPT layer artifact key: `v{version}-{attempt}.layer`.
   *
   * Mutations upload their artifact BEFORE the commit transaction decides
   * whether they won the version CAS. Two replicas racing the same
   * `nextVersion` must therefore never share a key — the loser's upload
   * would overwrite the winner's committed bytes and the layer would fail
   * its sha check on the next open. The attempt nonce makes every upload
   * target unique; readers never reconstruct this key (they follow the
   * `current_artifact_key` column), and the `v{version}-` prefix keeps
   * per-layer listings/GC grammar intact.
   */
  layerArtifactAttempt(
    tenantId: string,
    docId: string,
    layerName: string,
    version: number,
    attempt: string,
  ): string {
    if (!/^[a-z0-9]{1,32}$/.test(attempt)) {
      throw new Error(`layerArtifactAttempt: bad attempt nonce "${attempt}"`);
    }
    const base = layerArtifactKey(tenantId, docId, layerName, version);
    return `${base.slice(0, -'.layer'.length)}-${attempt}.layer`;
  },
  /** @deprecated Use `layerArtifact()`. */
  layerPdf(tenantId: string, docId: string, layerName: string, version: number): string {
    return layerArtifactKey(tenantId, docId, layerName, version);
  },
  /** Append-only event log, partitioned per calendar month. */
  eventsMonth(tenantId: string, docId: string, yearMonth: string): string {
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      throw new Error(`eventsMonth: bad YYYY-MM "${yearMonth}"`);
    }
    return `${tenantId}/docs/${shard(docId)}/${docId}/events/${yearMonth}.jsonl`;
  },
  /** Daily audit archive exported from `audit_log` by a scheduled job. */
  eventsDay(tenantId: string, docId: string, day: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new Error(`eventsDay: bad YYYY-MM-DD "${day}"`);
    }
    return `${tenantId}/docs/${shard(docId)}/${docId}/events/${day}.jsonl`;
  },
  tenantRoot(tenantId: string): string {
    return `${tenantId}/`;
  },
} as const;

function shard(docId: string): string {
  if (docId.length < 2) {
    throw new Error(`shard: docId too short (${docId})`);
  }
  return docId.slice(0, 2).toLowerCase();
}

function layerArtifactKey(
  tenantId: string,
  docId: string,
  layerName: string,
  version: number,
): string {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`layerArtifact: version must be a positive integer, got ${version}`);
  }
  const padded = version.toString().padStart(8, '0');
  return `${tenantId}/docs/${shard(docId)}/${docId}/layers/${encodeURIComponent(layerName)}/v${padded}.layer`;
}
