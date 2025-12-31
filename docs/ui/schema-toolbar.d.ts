import { h } from 'preact';
import { ToolbarRendererProps } from '@embedpdf/plugin-ui/preact';
/**
 * Schema-driven Toolbar Renderer for Preact
 *
 * Renders a toolbar based on a ToolbarSchema definition from the UI plugin.
 *
 * Visibility is controlled entirely by CSS:
 * - Responsive: Container queries based on data-ui-item attribute
 * - Categories: data-categories attribute matched against data-disabled-categories on root
 */
export declare function SchemaToolbar({ schema, documentId, isOpen, className, }: ToolbarRendererProps): h.JSX.Element | null;
//# sourceMappingURL=schema-toolbar.d.ts.map