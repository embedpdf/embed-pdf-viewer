import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';

interface EditCommentFormProps {
  initialText: string;
  onSave: (newText: string) => void;
  onCancel: () => void;
  autoFocus?: boolean;
  documentId: string;
}

export const EditCommentForm = ({
  initialText,
  onSave,
  onCancel,
  autoFocus = false,
  documentId,
}: EditCommentFormProps) => {
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { translate } = useTranslations(documentId);

  // Focus the textarea and move the cursor to the end when the component mounts
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(text.length, text.length);
    }
  }, [autoFocus, text.length]);

  const handleSaveClick = (e: MouseEvent) => {
    e.stopPropagation();
    onSave(text);
  };

  const handleCancelClick = (e: MouseEvent) => {
    e.stopPropagation();
    onCancel();
  };

  return (
    <div className="flex-1 space-y-2">
      <textarea
        ref={textareaRef}
        value={text}
        onInput={(e) => setText(e.currentTarget.value)}
        className="border-border-default bg-bg-input text-fg-primary focus:border-accent focus:ring-accent w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1"
        rows={3}
      />
      <div className="flex space-x-2">
        <button
          onClick={handleSaveClick}
          className="bg-accent text-fg-on-accent hover:bg-accent-hover rounded-md px-3 py-1 text-sm"
        >
          {translate('comments.save')}
        </button>
        <button
          onClick={handleCancelClick}
          className="bg-interactive-hover text-fg-secondary hover:bg-border-default rounded-md px-3 py-1 text-sm"
        >
          {translate('comments.cancel')}
        </button>
      </div>
    </div>
  );
};
