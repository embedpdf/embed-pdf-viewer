import { h } from 'preact';
import { OverlaySchema, OverlayAnchor } from '@embedpdf/plugin-ui';
import { useItemRenderer } from '@embedpdf/plugin-ui/preact';

export interface OverlayRendererProps {
  schema: OverlaySchema;
  documentId: string;
  className?: string;
}

/**
 * Get CSS classes for overlay anchor positioning
 */
function getAnchorClasses(anchor: OverlayAnchor): string {
  const classes: Record<OverlayAnchor, string> = {
    'top-left': 'top-0 left-0',
    'top-center': 'top-0 left-1/2 -translate-x-1/2',
    'top-right': 'top-0 right-0',
    'center-left': 'top-1/2 left-0 -translate-y-1/2',
    center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
    'center-right': 'top-1/2 right-0 -translate-y-1/2',
    'bottom-left': 'bottom-0 left-0',
    'bottom-center': 'bottom-0 left-1/2 -translate-x-1/2',
    'bottom-right': 'bottom-0 right-0',
  };

  return classes[anchor] || classes['bottom-center'];
}

/**
 * Convert offset config to inline styles
 */
function getOffsetStyles(
  offset?: OverlaySchema['position']['offset'],
): Record<string, string> | undefined {
  if (!offset) return undefined;

  const styles: Record<string, string> = {};

  if (offset.top) styles.top = offset.top;
  if (offset.right) styles.right = offset.right;
  if (offset.bottom) styles.bottom = offset.bottom;
  if (offset.left) styles.left = offset.left;

  return Object.keys(styles).length > 0 ? styles : undefined;
}

/**
 * Schema-driven Overlay Renderer for Preact
 *
 * Renders overlays defined in the UI schema.
 * Overlays are floating components positioned over document content.
 * The actual visibility logic (scroll-based, hover, etc.) is handled by the custom component.
 */
export function SchemaOverlay({ schema, documentId, className }: OverlayRendererProps) {
  const { content, position } = schema;
  const { renderCustomComponent } = useItemRenderer();

  const anchorClasses = getAnchorClasses(position.anchor);
  const offsetStyles = getOffsetStyles(position.offset);

  return (
    <div
      className={`z-3 absolute ${anchorClasses} ${className || ''}`}
      style={offsetStyles}
      data-overlay-id={schema.id}
    >
      {renderCustomComponent(content.componentId, documentId)}
    </div>
  );
}
