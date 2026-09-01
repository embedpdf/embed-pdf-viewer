import * as React from 'react';

export interface FormFocusRingProps {
  visible: boolean;
}

/**
 * Paint the form focus indicator above baked PDF appearances and transparent
 * native controls. Putting an inset outline on the widget wrapper lets an
 * opaque child cover it, which makes rectangular checkboxes and combo boxes
 * appear unfocused even though they are active in the native Tab order.
 */
export function FormFocusRing({ visible }: FormFocusRingProps) {
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
        outline: '2px solid rgba(66, 133, 244, 0.8)',
        outlineOffset: -2,
        pointerEvents: 'none',
      }}
    />
  );
}
