import { RedactionMode, useRedaction } from '@embedpdf/plugin-redaction/react';
import { ToolbarButton } from './ui';
import { CheckIcon, CloseIcon, RedactTextIcon, RedactAreaIcon } from './icons';

type RedactionToolbarProps = {
  documentId: string;
};

export function RedactionToolbar({ documentId }: RedactionToolbarProps) {
  const { provides, state } = useRedaction(documentId);

  if (!provides) return null;

  const handleTextRedact = () => {
    provides.toggleRedactSelection();
  };

  const handleAreaRedact = () => {
    provides.toggleMarqueeRedact();
  };

  const handleCommitPending = () => {
    provides.commitAllPending();
  };

  const handleClearPending = () => {
    provides.clearPending();
  };

  return (
    <div className="flex items-center gap-2 border-b border-gray-300 bg-white px-3 py-2">
      {/* Redaction Mode Toggles */}
      <ToolbarButton
        onClick={handleTextRedact}
        isActive={state.activeType === RedactionMode.RedactSelection}
        aria-label="Redact text"
        title="Redact Text Selection"
      >
        <RedactTextIcon className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={handleAreaRedact}
        isActive={state.activeType === RedactionMode.MarqueeRedact}
        aria-label="Redact area"
        title="Redact Area (Marquee)"
      >
        <RedactAreaIcon className="h-4 w-4" />
      </ToolbarButton>

      {/* Divider */}
      <div className="mx-1 h-6 w-px bg-gray-300" />

      {/* Action Buttons */}
      <button
        onClick={handleCommitPending}
        disabled={state.pendingCount === 0}
        className="rounded p-2 text-green-600 transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
        aria-label="Apply redactions"
        title={`Apply ${state.pendingCount} pending redaction(s)`}
      >
        <CheckIcon className="h-4 w-4" />
      </button>

      <button
        onClick={handleClearPending}
        disabled={state.pendingCount === 0}
        className="rounded p-2 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
        aria-label="Clear redactions"
        title={`Clear ${state.pendingCount} pending redaction(s)`}
      >
        <CloseIcon className="h-4 w-4" />
      </button>

      {state.pendingCount > 0 && (
        <span className="ml-2 text-sm text-gray-600">
          {state.pendingCount} pending redaction{state.pendingCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}
