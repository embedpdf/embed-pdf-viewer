import type { FieldControlProps } from '@embedpdf/react/form';

// The layer's own text box, and a button at its end that empties it.
export function TextBox({ widget, native, setValue }: FieldControlProps) {
  if (widget.control !== 'text') return null;

  return (
    <>
      {native}
      {!widget.disabled && widget.value !== '' && (
        <button
          className="clear-button"
          aria-label={`Clear ${widget.label}`}
          tabIndex={-1} // Tab goes to the text box
          onClick={() => setValue({ value: '' })}
        />
      )}
    </>
  );
}
