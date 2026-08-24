import { EngineError } from '../../../errors/EngineError';
import { EngineErrorCode } from '../../../errors/EngineErrorCode';
import {
  resolveBinarySource,
  type BinarySource,
  type WireResource,
  type WireResourceMap,
} from '../../../resource/BinarySource';
import { sniffBinaryMetadata } from '../../../resource/binaryMetadata';
import type { StampDraft, StampWireDraft } from './draft';
import type { StampPatch, StampWirePatch } from './patch';

/**
 * Resolve + validate a stamp `source`. Sniffing happens here — before any
 * transport — so callers get a fast `InvalidArg` instead of a worker/HTTP
 * round-trip. The sniffed mime type overwrites whatever was declared.
 */
async function resolveStampSource(source: BinarySource): Promise<WireResource> {
  const resolved = await resolveBinarySource(source);
  const meta = sniffBinaryMetadata(resolved.bytes);
  if (!meta) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'stamp source must be PNG, JPEG, or single-page PDF bytes (format is detected from the data, not the declared mime type)',
    );
  }
  return { ...resolved, mimeType: meta.mimeType };
}

export async function normalizeStampDraft(
  draft: StampDraft,
  allocateKey: () => string,
): Promise<{ wire: StampWireDraft; resources: WireResourceMap }> {
  const { source, ...rest } = draft;
  const resolved = await resolveStampSource(source);
  const key = allocateKey();
  return { wire: { ...rest, source: { resource: key } }, resources: { [key]: resolved } };
}

export async function normalizeStampPatch(
  patch: StampPatch,
  allocateKey: () => string,
): Promise<{ wire: StampWirePatch; resources: WireResourceMap }> {
  if (patch.source === undefined) {
    const { source: _source, ...rest } = patch;
    return { wire: rest, resources: {} };
  }
  const { source, ...rest } = patch;
  const resolved = await resolveStampSource(source);
  const key = allocateKey();
  return { wire: { ...rest, source: { resource: key } }, resources: { [key]: resolved } };
}
