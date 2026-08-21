import type {
  PluginContext,
  PageObjectNumber,
  PageRotation,
  DocCapability,
  PdfSize,
} from '@embedpdf/core';
import type { PageEditCapability, PagePlacement } from './types';

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

  /**
   * Resolve a placement to the engine's index wire, from the registry at
   * call time — the PON anchors are why "add after this thumbnail" survives
   * a concurrent reorder. Returns the anchor page too, so `addBlank` can
   * default its size without a second lookup.
   */
  const resolvePlacement = (placement?: PagePlacement) => {
    if (!placement) return { destIndex: undefined, anchor: undefined };
    if ('index' in placement) return { destIndex: placement.index, anchor: undefined };
    const pon = 'after' in placement ? placement.after : placement.before;
    const anchor = ctx.document()?.pages.find((p) => p.pageObjectNumber === pon);
    if (!anchor) throw new Error(`[page-edit] placement page not found: ${pon}`);
    return { destIndex: 'after' in placement ? anchor.index + 1 : anchor.index, anchor };
  };

  /**
   * Default blank-page size: the insertion point's predecessor (the page
   * the new one will follow), else the first page, else — only reachable
   * with an empty registry, which an open document never has — US Letter.
   */
  const neighbourSize = (destIndex: number | undefined): PdfSize => {
    const pages = ctx.document()?.pages ?? [];
    if (pages.length === 0) return { width: 612, height: 792 };
    if (destIndex === undefined) return pages[pages.length - 1].size;
    return pages[Math.max(0, Math.min(destIndex - 1, pages.length - 1))].size;
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

    addBlank(opts = {}) {
      const doc = requireDoc();
      const { destIndex, anchor } = resolvePlacement(opts.placement);
      // PON placements match the anchor the user is looking at; everything
      // else matches the neighbour the new page will follow.
      const size = opts.size ?? anchor?.size ?? neighbourSize(destIndex);
      return doc.pages.insertBlank({ size, count: opts.count }, destIndex);
    },

    insert(bytes, opts = {}) {
      const doc = requireDoc();
      const { destIndex } = resolvePlacement(opts.placement);
      return doc.pages.insert(bytes, destIndex);
    },
  };
}
