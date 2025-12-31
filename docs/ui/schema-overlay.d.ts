import { h } from 'preact';
import { OverlaySchema } from '@embedpdf/plugin-ui';
export interface OverlayRendererProps {
    schema: OverlaySchema;
    documentId: string;
    className?: string;
}
/**
 * Schema-driven Overlay Renderer for Preact
 *
 * Renders overlays defined in the UI schema.
 * Overlays are floating components positioned over document content.
 * The actual visibility logic (scroll-based, hover, etc.) is handled by the custom component.
 */
export declare function SchemaOverlay({ schema, documentId, className }: OverlayRendererProps): h.JSX.Element;
//# sourceMappingURL=schema-overlay.d.ts.map