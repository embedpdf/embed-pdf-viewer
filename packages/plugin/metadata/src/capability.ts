import type { PluginContext, DocCapability } from '@embedpdf/core';
import type { MetadataAction, MetadataCapability, MetadataState } from './types';

/**
 * Authorization for Info-dict writes. Maps to PDF bit 4 (MODIFY). The engine
 * ALSO enforces this — `metadata.update` throws `PermissionDenied` without it,
 * identically on local and cloud — so `canEdit()` is the UI mirror of a real
 * guard, not the guard itself. Typed as `DocCapability` so a typo is a compile
 * error.
 */
const METADATA_MODIFY_CAPABILITY: DocCapability = 'doc.metadata.modify';

/**
 * Reads/writes the document's Info dict through the engine handle and keeps the
 * plugin's state in sync. The live-update wiring (own + remote events) lives in
 * the effect; this is the read/write surface.
 */
export function createMetadataCapability(
  ctx: PluginContext<MetadataState, MetadataAction>,
): MetadataCapability {
  const requireDoc = () => {
    const doc = ctx.doc;
    if (!doc) throw new Error('[metadata] no document bound');
    return doc;
  };

  return {
    canEdit() {
      // Wildcard-aware predicate (mirrors the engine's own enforcement),
      // identical on both engines. NOT `effectiveScope.includes(...)` — that
      // enumeration drops the `*` admin grant, so it would hide the UI on a
      // default admin open even though the engine allows the edit.
      return ctx.doc?.security.allows(METADATA_MODIFY_CAPABILITY) ?? false;
    },

    current: () => ctx.getState().metadata,

    update: async (patch) => {
      // The write also emits a `metadata.updated` event the effect catches, so
      // this dispatch is just for an immediate, in-sync update (idempotent).
      const result = await requireDoc().metadata.update(patch);
      ctx.dispatch({ type: 'SET', metadata: result.metadata });
    },

    reload: async () => {
      const metadata = await requireDoc().metadata.read();
      ctx.dispatch({ type: 'SET', metadata });
    },
  };
}
