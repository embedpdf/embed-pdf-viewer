import { h, RefObject } from 'preact';
import { useState, useRef } from 'preact/hooks';

interface AnnotationInputProps {
  placeholder: string;
  onSubmit: (text: string) => void;
  inputRef?: RefObject<HTMLInputElement>;
  isFocused?: boolean;
}

export const AnnotationInput = ({
  placeholder,
  onSubmit,
  inputRef,
  isFocused,
}: AnnotationInputProps) => {
  const [text, setText] = useState('');

  const handleSubmit = (e?: h.JSX.TargetedEvent<HTMLFormElement, Event>) => {
    e?.preventDefault();
    if (text.trim()) {
      onSubmit(text);
      setText('');
    }
  };

  return (
    <form
      className="border-border-subtle mt-4 flex items-end space-x-2 border-t pt-4"
      onClick={(e) => e.stopPropagation()}
      onSubmit={handleSubmit}
    >
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={text}
        onInput={(e) => setText(e.currentTarget.value)}
        className={`bg-bg-input text-fg-primary placeholder-fg-muted w-full rounded-lg border px-3 py-1 text-base transition-colors focus:border-transparent focus:outline-none focus:ring-2 ${
          isFocused ? 'border-accent focus:ring-accent' : 'border-border-default focus:ring-accent'
        }`}
      />
      <button
        type="submit"
        disabled={!text.trim()}
        className="bg-accent text-fg-on-accent hover:bg-accent-hover disabled:bg-interactive-disabled rounded-lg p-2 transition-colors disabled:cursor-not-allowed"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
          />
        </svg>
      </button>
    </form>
  );
};
