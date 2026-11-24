import type { FieldControlProps } from '@embedpdf/react/form';

// It fills its frame (`width` and `height` 100% in your CSS), and turns with the field.
export function Switch({ widget, setValue }: FieldControlProps) {
  if (widget.control !== 'toggle') return null;

  return (
    <button
      role="switch"
      className="switch"
      aria-checked={widget.checked}
      aria-label={widget.label}
      disabled={widget.disabled}
      onClick={() => setValue({ checked: !widget.checked })}
    />
  );
}
