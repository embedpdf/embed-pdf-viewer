import type { PluginContext, PageObjectNumber, PageRotation, DocCapability } from '@embedpdf/core';
import type { PageEditCapability } from './types';

/**
 * Authorization for structural page edits. Maps to PDF bit 11 (ASSEMBLE =
 * insert/rotate/delete pages). The engine ALSO enforces this — every
 * page-structure verb throws `PermissionDenied` without it, identically on
 * local and cloud — so `canEdit()` is the UI mirror of a real guard, not the
 * guard itself. Typed as `DocCapability` so a typo is a compile error.
 */
const ASSEMBLE_CAPABILITY: DocCapability = 'doc.pages.assemble';

/**
 * Forwards structural edits to the document's engine handle, addressed by PON.
 * The handle (`ctx.doc`) and the page registry (`ctx.document()`, kept in sync
 * by the kernel's event→registry bridge) are both already on the plugin
 * context — this capability is the thin layer that turns the relative rotate
 * gesture into the engine's absolute wire.
 */
export function createPageEditCapability(ctx: PluginContext<unknown>): PageEditCapability {
  const requireDoc = () => {
    const doc = ctx.doc;
    if (!doc) throw new Error('[page-edit] no document bound');
    return doc;
  };

  /** Current absolute rotation of a page from the registry; 0 if unknown. */
  const rotationOf = (pon: PageObjectNumber): PageRotation => {
    const page = ctx.document()?.pages.find((p) => p.pageObjectNumber === pon);
    return page?.rotation ?? 0;
  };

  return {
    canEdit() {
      // Wildcard-aware predicate (mirrors the engine's own enforcement),
      // identical on both engines. NOT `effectiveScope.includes(...)` — that
      // enumeration drops the `*` admin grant, so it would hide the UI on a
      // default admin open even though the engine allows the edit.
      return ctx.doc?.security.allows(ASSEMBLE_CAPABILITY) ?? false;
    },

    rotateBy(pon, delta) {
      // Wrap to [0, 360) — the double-mod keeps -90 from current 0 landing on 270.
      const next = ((((rotationOf(pon) + delta) % 360) + 360) % 360) as PageRotation;
      return requireDoc().pages.rotate([pon], next);
    },

    setRotation(pons, rotation) {
      return requireDoc().pages.rotate(pons, rotation);
    },

    move(pons, destIndex) {
      return requireDoc().pages.move(pons, destIndex);
    },

    delete(pons) {
      return requireDoc().pages.delete(pons);
    },
  };
}
