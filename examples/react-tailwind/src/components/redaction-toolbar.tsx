import { RedactionMode, useRedaction } from '@embedpdf/plugin-redaction/react';
import { ToolbarButton } from './ui';
import { CheckIcon, CloseIcon } from './icons';

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

// Redaction icons with diagonal stripe patterns (from snippet project)
function RedactTextIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M7 4h10" />
      <path d="M12 4v8" />
      <defs>
        <clipPath id="stripeClip">
          <rect x="2" y="12" width="20" height="10" rx="2" />
        </clipPath>
      </defs>
      <rect x="2" y="12" width="20" height="10" rx="2" fill="none" />
      <g clipPath="url(#stripeClip)">
        <path d="M-7 24l12 -12" />
        <path d="M-3 24l12 -12" />
        <path d="M1 24l12 -12" />
        <path d="M5 24l12 -12" />
        <path d="M9 24l12 -12" />
        <path d="M13 24l12 -12" />
        <path d="M17 24l12 -12" />
        <path d="M21 24l12 -12" />
        <path d="M25 24l12 -12" />
      </g>
    </svg>
  );
}

function RedactAreaIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M6 20h-1a2 2 0 0 1 -2 -2v-1" />
      <path d="M3 13v-3" />
      <path d="M3 6v-1a2 2 0 0 1 2 -2h1" />
      <path d="M10 3h3" />
      <path d="M17 3h1a2 2 0 0 1 2 2v1" />
      <defs>
        <clipPath id="redactClip">
          <rect x="10" y="10" width="12" height="12" rx="2" />
        </clipPath>
      </defs>
      <rect x="10" y="10" width="12" height="12" rx="2" fill="none" />
      <g clipPath="url(#redactClip)">
        <path d="M-2 24l14 -14" />
        <path d="M2 24l14 -14" />
        <path d="M6 24l14 -14" />
        <path d="M10 24l15 -15" />
        <path d="M14 24l15 -15" />
        <path d="M18 24l15 -15" />
      </g>
    </svg>
  );
}
