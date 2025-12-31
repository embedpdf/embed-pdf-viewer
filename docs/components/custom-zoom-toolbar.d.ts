import { h } from 'preact';
/**
 * Custom Zoom Toolbar Component
 *
 * This component is designed to be registered with the UI plugin and used
 * as a custom component in the UI schema.
 *
 * Props:
 *   - documentId: The document ID (passed by the UI renderer)
 */
interface CustomZoomToolbarProps {
    documentId: string;
}
/**
 * Custom Zoom Toolbar
 *
 * A comprehensive zoom control with:
 * - Zoom in/out buttons
 * - Editable zoom percentage input
 * - Dropdown menu with zoom presets
 */
export declare function CustomZoomToolbar({ documentId }: CustomZoomToolbarProps): h.JSX.Element | null;
export {};
//# sourceMappingURL=custom-zoom-toolbar.d.ts.map