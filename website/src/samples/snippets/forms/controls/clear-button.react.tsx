import { useForm, type FieldControlProps } from '@embedpdf/react/form';

// The layer's own text box, and a button at its end that empties it.
export function TextBox({ widget, native, setValue }: FieldControlProps) {
  const form = useForm();
  if (widget.control !== 'text') return null;

  // Empty the box, then put the cursor back in it, ready for the new value.
  const clear = () => setValue({ value: '' }).then(() => form.focus(widget.fieldRef));

  return (
    <>
      {native}
      {!widget.disabled && widget.value !== '' && (
        <button
          className="clear-button"
          aria-label={`Clear ${widget.label}`}
          tabIndex={-1} // Tab goes to the text box
          onClick={clear}
        />
      )}
    </>
  );
}
