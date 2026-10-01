import * as React from 'react';

export interface FormFocusRingProps {
  visible: boolean;
  /** The ring's CSS color: the form's `focus.color` setting, through its CSS variable. */
  color: string;
}

/**
 * Paint the focus ring above the field's picture and see-through native
 * controls. An inset outline on the box itself would sit under an opaque
 * child, so rectangular checkboxes and dropdowns would look unfocused while
 * they are active in the native Tab order.
 */
export function FormFocusRing({ visible, color }: FormFocusRingProps) {
  if (!visible) return null;
  return (
    <span
      aria-hidden="true"
      data-embedpdf-form-focus-ring=""
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        boxSizing: 'border-box',
        outline: `2px solid ${color}`,
        outlineOffset: -2,
        pointerEvents: 'none',
      }}
    />
  );
}
